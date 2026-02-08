-- Fix linter warnings:
-- 1) Put pg_trgm in a dedicated schema (not public)
-- 2) Ensure all helper functions have an explicit search_path

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    -- Move extension objects into extensions schema
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END$$;

-- Update functions to include extensions in their search_path
CREATE OR REPLACE FUNCTION public.normalize_answer(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT regexp_replace(lower(trim(coalesce(_s, ''))), '\s+', ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION public.is_correct_text_answer(_question_id uuid, _answer_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
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
        public.normalize_answer(v.variant) LIKE '%' || inp.a || '%'
        OR inp.a LIKE '%' || public.normalize_answer(v.variant) || '%'
        OR extensions.similarity(public.normalize_answer(v.variant), inp.a) >= 0.55
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_answer_correct(_question_id uuid, _selected_option char, _answer_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN (SELECT q.question_type FROM public.quiz_questions q WHERE q.id = _question_id) = 'text'::public.question_type
      THEN public.is_correct_text_answer(_question_id, _answer_text)
    ELSE
      public.is_correct_answer(_question_id, _selected_option)
  END;
$$;