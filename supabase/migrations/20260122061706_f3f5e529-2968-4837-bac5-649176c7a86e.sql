-- Ensure one account cannot hold multiple app roles.
-- 1) Remove any duplicate role rows per user (keep earliest).
WITH ranked AS (
  SELECT id,
         user_id,
         created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles ur
USING ranked r
WHERE ur.id = r.id
  AND r.rn > 1;

-- 2) Enforce one role per user.
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
