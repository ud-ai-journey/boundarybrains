-- Public aggregated leaderboard table (safe to expose), maintained by triggers.

-- 1) Table
CREATE TABLE IF NOT EXISTS public.leaderboard_rows (
  user_id uuid PRIMARY KEY,
  employee_id text,
  full_name text,
  total_correct integer NOT NULL DEFAULT 0,
  total_answered integer NOT NULL DEFAULT 0,
  total_duration_ms bigint NOT NULL DEFAULT 0,
  last_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leaderboard_rows ENABLE ROW LEVEL SECURITY;

-- Everyone logged in can read the leaderboard (no answer key exposed).
DROP POLICY IF EXISTS "Leaderboard rows readable by authenticated" ON public.leaderboard_rows;
CREATE POLICY "Leaderboard rows readable by authenticated"
ON public.leaderboard_rows
FOR SELECT
TO authenticated
USING (true);

-- Lock down writes from clients; only backend triggers update.
DROP POLICY IF EXISTS "No direct writes to leaderboard rows" ON public.leaderboard_rows;
CREATE POLICY "No direct writes to leaderboard rows"
ON public.leaderboard_rows
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_leaderboard_rows_score
ON public.leaderboard_rows (total_correct DESC, total_duration_ms ASC);

-- 2) Recompute function (SECURITY DEFINER so it can read answer key & all rows)
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

  -- If user has no profile yet, do nothing.
  IF v_employee_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(qa.id)::int,
    COALESCE(SUM(CASE WHEN public.is_correct_answer(qa.question_id, qa.selected_option) THEN 1 ELSE 0 END), 0)::int
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

-- 3) Triggers to keep leaderboard_rows up-to-date
CREATE OR REPLACE FUNCTION public.trg_recompute_leaderboard_from_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_leaderboard_row(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS recompute_leaderboard_on_answers ON public.quiz_answers;
CREATE TRIGGER recompute_leaderboard_on_answers
AFTER INSERT OR UPDATE OR DELETE ON public.quiz_answers
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_leaderboard_from_answers();

CREATE OR REPLACE FUNCTION public.trg_recompute_leaderboard_from_attempts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_leaderboard_row(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS recompute_leaderboard_on_attempts ON public.quiz_round_attempts;
CREATE TRIGGER recompute_leaderboard_on_attempts
AFTER INSERT OR UPDATE OR DELETE ON public.quiz_round_attempts
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_leaderboard_from_attempts();

CREATE OR REPLACE FUNCTION public.trg_recompute_leaderboard_from_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_leaderboard_row(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recompute_leaderboard_on_profiles ON public.profiles;
CREATE TRIGGER recompute_leaderboard_on_profiles
AFTER INSERT OR UPDATE OF employee_id, full_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_leaderboard_from_profiles();

-- 4) Seed current rows
INSERT INTO public.leaderboard_rows (user_id, employee_id, full_name)
SELECT p.user_id, p.employee_id, p.full_name
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- Recompute for everyone who has a profile
DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT user_id FROM public.profiles) LOOP
    PERFORM public.recompute_leaderboard_row(r.user_id);
  END LOOP;
END$$;
