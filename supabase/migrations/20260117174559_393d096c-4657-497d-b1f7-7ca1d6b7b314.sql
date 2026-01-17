-- Ensure Row Level Security is enabled (idempotent)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Explicitly deny any access from anonymous users (defense-in-depth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointments'
      AND policyname = 'Appointments: deny anon'
  ) THEN
    CREATE POLICY "Appointments: deny anon"
    ON public.appointments
    AS RESTRICTIVE
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;
