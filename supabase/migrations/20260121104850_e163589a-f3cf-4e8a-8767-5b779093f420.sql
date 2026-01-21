-- Safe patient identity lookup for doctors with granted consent.
-- Returns minimal identity info (full_name if set, otherwise short id).
CREATE OR REPLACE FUNCTION public.get_patient_label_for_doctor(_patient_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select coalesce(p.full_name, concat(substr(_patient_id::text, 1, 8), '…'))
  from public.profiles p
  where p.user_id = _patient_id
    and public.has_role(auth.uid(), 'doctor'::public.app_role)
    and exists (
      select 1
      from public.doctor_patient_consents c
      where c.doctor_id = auth.uid()
        and c.patient_id = _patient_id
        and c.status = 'granted'
    )
  limit 1;
$$;