-- Enable trigram similarity for fuzzy matching (safe, common Postgres extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) Question type: mcq vs text
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_type') THEN
    CREATE TYPE public.question_type AS ENUM ('mcq', 'text');
  END IF;
END$$;

ALTER TABLE public.quiz_questions
ADD COLUMN IF NOT EXISTS question_type public.question_type NOT NULL DEFAULT 'mcq';

-- 2) Allow storing text answers; MCQ selected_option becomes nullable
ALTER TABLE public.quiz_answers
  ALTER COLUMN selected_option DROP NOT NULL;

ALTER TABLE public.quiz_answers
ADD COLUMN IF NOT EXISTS answer_text text;

-- 3) Store accepted text variants (answer key for text questions) in a separate table
CREATE TABLE IF NOT EXISTS public.quiz_question_text_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  variant text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_text_variants_question
ON public.quiz_question_text_variants(question_id);

CREATE INDEX IF NOT EXISTS idx_text_variants_trgm
ON public.quiz_question_text_variants USING GIN (variant gin_trgm_ops);

ALTER TABLE public.quiz_question_text_variants ENABLE ROW LEVEL SECURITY;

-- Only admins can manage/read variants (employees must not see answer key)
DROP POLICY IF EXISTS "Admins manage text variants" ON public.quiz_question_text_variants;
CREATE POLICY "Admins manage text variants"
ON public.quiz_question_text_variants
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Normalization + correctness function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.normalize_answer(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(trim(coalesce(_s, ''))), '\s+', ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION public.is_correct_text_answer(_question_id uuid, _answer_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH inp AS (
    SELECT public.normalize_answer(_answer_text) AS a
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.quiz_question_text_variants v
    CROSS JOIN inp
    WHERE v.question_id = _question_id
      AND inp.a <> ''
      AND (
        -- Partial names: allow substring either way
        public.normalize_answer(v.variant) LIKE '%' || inp.a || '%'
        OR inp.a LIKE '%' || public.normalize_answer(v.variant) || '%'
        -- Minor typos: similarity threshold
        OR similarity(public.normalize_answer(v.variant), inp.a) >= 0.55
      )
  );
$$;

-- 5) Unified correctness function for leaderboard recompute
CREATE OR REPLACE FUNCTION public.is_answer_correct(_question_id uuid, _selected_option char, _answer_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT q.question_type FROM public.quiz_questions q WHERE q.id = _question_id) = 'text'::public.question_type
      THEN public.is_correct_text_answer(_question_id, _answer_text)
    ELSE
      public.is_correct_answer(_question_id, _selected_option)
  END;
$$;

-- 6) Update leaderboard recompute to use unified correctness (so text questions count)
CREATE OR REPLACE FUNCTION public.recompute_leaderboard_row(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id text;
  v_full_name text;
  v_total_answered int;
  v_total_correct int;
  v_total_duration_ms bigint;
  v_last_completed_at timestamptz;
BEGIN
  SELECT p.employee_id, p.full_name
    INTO v_employee_id, v_full_name
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  IF v_employee_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(qa.id)::int,
    COALESCE(
      SUM(
        CASE
          WHEN public.is_answer_correct(qa.question_id, qa.selected_option, qa.answer_text) THEN 1
          ELSE 0
        END
      ),
      0
    )::int
  INTO v_total_answered, v_total_correct
  FROM public.quiz_answers qa
  WHERE qa.user_id = _user_id;

  SELECT
    COALESCE(SUM(att.duration_ms), 0)::bigint,
    MAX(att.completed_at)
  INTO v_total_duration_ms, v_last_completed_at
  FROM public.quiz_round_attempts att
  WHERE att.user_id = _user_id
    AND att.completed_at IS NOT NULL;

  INSERT INTO public.leaderboard_rows (
    user_id,
    employee_id,
    full_name,
    total_correct,
    total_answered,
    total_duration_ms,
    last_completed_at,
    updated_at
  )
  VALUES (
    _user_id,
    v_employee_id,
    v_full_name,
    COALESCE(v_total_correct, 0),
    COALESCE(v_total_answered, 0),
    COALESCE(v_total_duration_ms, 0),
    v_last_completed_at,
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    employee_id = EXCLUDED.employee_id,
    full_name = EXCLUDED.full_name,
    total_correct = EXCLUDED.total_correct,
    total_answered = EXCLUDED.total_answered,
    total_duration_ms = EXCLUDED.total_duration_ms,
    last_completed_at = EXCLUDED.last_completed_at,
    updated_at = now();
END;
$$;

-- Recompute everything once to incorporate new logic
DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT user_id FROM public.profiles) LOOP
    PERFORM public.recompute_leaderboard_row(r.user_id);
  END LOOP;
END$$;