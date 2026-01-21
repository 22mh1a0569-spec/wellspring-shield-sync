-- Create a minimal metadata lookup for doctors without exposing report content
-- This function bypasses RLS (security definer) but returns ONLY non-sensitive metadata needed to request consent.
CREATE OR REPLACE FUNCTION public.get_ledger_tx_meta_for_doctor(_tx_id text)
RETURNS TABLE (
  tx_id text,
  created_at timestamptz,
  patient_id uuid,
  prediction_id uuid,
  note_id uuid,
  appointment_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select lt.tx_id, lt.created_at, lt.patient_id, lt.prediction_id, lt.note_id, lt.appointment_id
  from public.ledger_transactions lt
  where lt.tx_id = _tx_id
    and public.has_role(auth.uid(), 'doctor'::public.app_role)
  limit 1;
$$;

-- Create a safe doctor-initiated consent request that also notifies the patient.
-- Prevents spamming/duplication by reusing an existing row when possible.
CREATE OR REPLACE FUNCTION public.request_patient_consent(_patient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
  v_existing_id uuid;
BEGIN
  v_doctor_id := auth.uid();
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(v_doctor_id, 'doctor'::public.app_role) THEN
    RAISE EXCEPTION 'Only doctors can request consent';
  END IF;

  -- If a consent row already exists (pending or granted), reuse it.
  SELECT id
    INTO v_existing_id
  FROM public.doctor_patient_consents
  WHERE doctor_id = v_doctor_id
    AND patient_id = _patient_id
    AND status IN ('pending', 'granted')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.doctor_patient_consents (doctor_id, patient_id, status)
  VALUES (v_doctor_id, _patient_id, 'pending')
  RETURNING id INTO v_existing_id;

  -- Create patient notification (bypasses RLS via security definer).
  INSERT INTO public.notifications (user_id, type, title, body, href)
  VALUES (
    _patient_id,
    'consent',
    'Doctor requested access',
    'A doctor requested your consent to view a verified report. You can approve or revoke access in Access Control.',
    '/patient/consents'
  );

  RETURN v_existing_id;
END;
$$;
