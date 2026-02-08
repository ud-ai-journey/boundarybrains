-- 1) Add optional video URL to questions
ALTER TABLE public.quiz_questions
ADD COLUMN IF NOT EXISTS video_url text;

-- 2) Storage bucket for quiz media
INSERT INTO storage.buckets (id, name, public)
VALUES ('quiz-media', 'quiz-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3) Storage policies
-- Public read for quiz media
DROP POLICY IF EXISTS "Quiz media is publicly readable" ON storage.objects;
CREATE POLICY "Quiz media is publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'quiz-media');

-- Admins can upload quiz media
DROP POLICY IF EXISTS "Admins can upload quiz media" ON storage.objects;
CREATE POLICY "Admins can upload quiz media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quiz-media'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Admins can update quiz media
DROP POLICY IF EXISTS "Admins can update quiz media" ON storage.objects;
CREATE POLICY "Admins can update quiz media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'quiz-media'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'quiz-media'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Admins can delete quiz media
DROP POLICY IF EXISTS "Admins can delete quiz media" ON storage.objects;
CREATE POLICY "Admins can delete quiz media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'quiz-media'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
