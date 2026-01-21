-- Allow doctors to create consent requests (doctor-initiated)
CREATE POLICY "Consents: doctor can create requests"
ON public.doctor_patient_consents
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'doctor'::public.app_role)
  AND auth.uid() = doctor_id
  AND status = 'pending'
);
