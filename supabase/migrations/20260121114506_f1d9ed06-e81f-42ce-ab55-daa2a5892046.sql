-- Explicitly deny all access to sensitive tables for the anon role.
-- This is a defense-in-depth policy: authenticated users are still governed by existing policies.

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles: deny anon" ON public.profiles;
CREATE POLICY "Profiles: deny anon"
ON public.profiles
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- HEALTH METRICS
ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Health metrics: deny anon" ON public.health_metrics;
CREATE POLICY "Health metrics: deny anon"
ON public.health_metrics
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
