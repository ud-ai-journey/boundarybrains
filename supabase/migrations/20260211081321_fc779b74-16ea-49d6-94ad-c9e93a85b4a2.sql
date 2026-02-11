-- Round-specific leaderboard rows (no cross-round aggregation)

CREATE TABLE IF NOT EXISTS public.round_leaderboard_rows (
  round_id uuid NOT NULL,
  user_id uuid NOT NULL,
  employee_id text NULL,
  full_name text NULL,
  total_correct integer NOT NULL DEFAULT 0,
  total_answered integer NOT NULL DEFAULT 0,
  duration_ms bigint NULL,
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_round_leaderboard_round_score
  ON public.round_leaderboard_rows (round_id, total_correct DESC, duration_ms ASC);

ALTER TABLE public.round_leaderboard_rows ENABLE ROW LEVEL SECURITY;

-- Employees can read ONLY the currently unlocked round; admins can read any round.
DROP POLICY IF EXISTS "Round leaderboard readable" ON public.round_leaderboard_rows;
CREATE POLICY "Round leaderboard readable"
ON public.round_leaderboard_rows
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.quiz_rounds r
    WHERE r.id = round_id
      AND r.status = 'unlocked'::public.round_status
  )
);

-- No direct writes from clients
DROP POLICY IF EXISTS "No direct writes to round leaderboard" ON public.round_leaderboard_rows;
CREATE POLICY "No direct writes to round leaderboard"
ON public.round_leaderboard_rows
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- Recompute a single row for a given user+round.
CREATE OR REPLACE FUNCTION public.recompute_round_leaderboard_row(_round_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employee_id text;
  v_full_name text;
  v_total_answered int;
  v_total_correct int;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_duration_ms bigint;
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
  WHERE qa.user_id = _user_id
    AND qa.round_id = _round_id;

  SELECT att.started_at, att.completed_at
    INTO v_started_at, v_completed_at
  FROM public.quiz_round_attempts att
  WHERE att.user_id = _user_id
    AND att.round_id = _round_id
  ORDER BY att.created_at DESC
  LIMIT 1;

  IF v_started_at IS NOT NULL AND v_completed_at IS NOT NULL THEN
    v_duration_ms := (EXTRACT(EPOCH FROM (v_completed_at - v_started_at)) * 1000)::bigint;
  ELSE
    v_duration_ms := NULL;
  END IF;

  INSERT INTO public.round_leaderboard_rows (
    round_id,
    user_id,
    employee_id,
    full_name,
    total_correct,
    total_answered,
    duration_ms,
    completed_at,
    updated_at
  )
  VALUES (
    _round_id,
    _user_id,
    v_employee_id,
    v_full_name,
    COALESCE(v_total_correct, 0),
    COALESCE(v_total_answered, 0),
    v_duration_ms,
    v_completed_at,
    now()
  )
  ON CONFLICT (round_id, user_id)
  DO UPDATE SET
    employee_id = EXCLUDED.employee_id,
    full_name = EXCLUDED.full_name,
    total_correct = EXCLUDED.total_correct,
    total_answered = EXCLUDED.total_answered,
    duration_ms = EXCLUDED.duration_ms,
    completed_at = EXCLUDED.completed_at,
    updated_at = now();
END;
$$;

-- Trigger helpers
CREATE OR REPLACE FUNCTION public.trg_recompute_round_leaderboard_from_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recompute_round_leaderboard_row(COALESCE(NEW.round_id, OLD.round_id), COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_round_leaderboard_from_attempts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recompute_round_leaderboard_row(COALESCE(NEW.round_id, OLD.round_id), COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_round_leaderboard_from_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Recompute for all rounds this user has touched
  PERFORM public.recompute_round_leaderboard_row(a.round_id, NEW.user_id)
  FROM (
    SELECT DISTINCT qa.round_id FROM public.quiz_answers qa WHERE qa.user_id = NEW.user_id
    UNION
    SELECT DISTINCT att.round_id FROM public.quiz_round_attempts att WHERE att.user_id = NEW.user_id
  ) a;

  RETURN NEW;
END;
$$;

-- Triggers (idempotent)
DROP TRIGGER IF EXISTS recompute_round_leaderboard_from_answers ON public.quiz_answers;
CREATE TRIGGER recompute_round_leaderboard_from_answers
AFTER INSERT OR UPDATE OR DELETE ON public.quiz_answers
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_round_leaderboard_from_answers();

DROP TRIGGER IF EXISTS recompute_round_leaderboard_from_attempts ON public.quiz_round_attempts;
CREATE TRIGGER recompute_round_leaderboard_from_attempts
AFTER INSERT OR UPDATE OR DELETE ON public.quiz_round_attempts
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_round_leaderboard_from_attempts();

DROP TRIGGER IF EXISTS recompute_round_leaderboard_from_profiles ON public.profiles;
CREATE TRIGGER recompute_round_leaderboard_from_profiles
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_round_leaderboard_from_profiles();
