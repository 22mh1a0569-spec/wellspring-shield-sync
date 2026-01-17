-- Add avatar URL to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create a public bucket for avatars (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage RLS policies for avatars
-- Public read (bucket is public, but keep explicit policy for clarity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars: public read'
  ) THEN
    CREATE POLICY "Avatars: public read"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars: users upload own'
  ) THEN
    CREATE POLICY "Avatars: users upload own"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'avatars'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars: users update own'
  ) THEN
    CREATE POLICY "Avatars: users update own"
    ON storage.objects
    FOR UPDATE
    USING (
      bucket_id = 'avatars'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars: users delete own'
  ) THEN
    CREATE POLICY "Avatars: users delete own"
    ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'avatars'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;