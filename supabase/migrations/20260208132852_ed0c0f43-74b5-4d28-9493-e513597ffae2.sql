-- Rebuild leaderboard view so it can compute correctness without exposing answer key to clients
-- and avoid row-multiplication between attempts and answers.

DROP VIEW IF EXISTS public.leaderboard;

CREATE VIEW public.leaderboard
WITH (security_invoker=off)
AS
WITH
  answers_agg AS (
    SELECT
      qa.user_id,
      COUNT(qa.id)::int AS total_answered,
      COALESCE(
        SUM(
          CASE
            WHEN qans.correct_option IS NOT NULL
             AND qa.selected_option = qans.correct_option
            THEN 1 ELSE 0
          END
        ),
        0
      )::int AS total_correct
    FROM public.quiz_answers qa
    LEFT JOIN public.quiz_question_answers qans
      ON qans.question_id = qa.question_id
    GROUP BY qa.user_id
  ),
  attempts_agg AS (
    SELECT
      att.user_id,
      COALESCE(SUM(att.duration_ms), 0)::bigint AS total_duration_ms,
      MAX(att.completed_at) AS last_completed_at
    FROM public.quiz_round_attempts att
    WHERE att.completed_at IS NOT NULL
    GROUP BY att.user_id
  )
SELECT
  p.employee_id,
  p.full_name,
  p.user_id,
  COALESCE(a.total_correct, 0) AS total_correct,
  COALESCE(a.total_answered, 0) AS total_answered,
  COALESCE(t.total_duration_ms, 0) AS total_duration_ms,
  t.last_completed_at
FROM public.profiles p
LEFT JOIN answers_agg a ON a.user_id = p.user_id
LEFT JOIN attempts_agg t ON t.user_id = p.user_id;

GRANT SELECT ON public.leaderboard TO authenticated;