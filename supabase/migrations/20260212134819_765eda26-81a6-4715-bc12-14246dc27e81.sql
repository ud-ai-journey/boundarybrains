-- Admin-only participant counts per round (submitted = answered >= 1)
CREATE OR REPLACE FUNCTION public.round_participant_counts_submitted()
RETURNS TABLE (round_id uuid, participants_submitted integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only admins may read aggregate participation stats
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT qa.round_id, COUNT(DISTINCT qa.user_id)::int AS participants_submitted
  FROM public.quiz_answers qa
  GROUP BY qa.round_id;
END;
$$;