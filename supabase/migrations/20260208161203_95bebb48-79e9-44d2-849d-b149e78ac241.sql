-- Ensure correct answers are never readable by regular users.
-- Keep validation working via SECURITY DEFINER functions (public.is_answer_correct / is_correct_answer).

ALTER TABLE public.quiz_question_answers ENABLE ROW LEVEL SECURITY;

-- Replace the existing broad policy with explicit admin-only policies.
DROP POLICY IF EXISTS "Admins manage answers" ON public.quiz_question_answers;

-- Admins can read answer keys
CREATE POLICY "Admins can read answer keys"
ON public.quiz_question_answers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can manage answer keys
CREATE POLICY "Admins can manage answer keys"
ON public.quiz_question_answers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update answer keys"
ON public.quiz_question_answers
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete answer keys"
ON public.quiz_question_answers
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
