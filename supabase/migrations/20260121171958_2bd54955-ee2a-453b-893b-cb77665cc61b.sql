-- Fix cross-user notification inserts by providing a secure server-side API
-- This function allows sending notifications to another user ONLY when
-- the sender and recipient are the doctor/patient participants of a given appointment.

CREATE OR REPLACE FUNCTION public.send_notification(
  _recipient_id uuid,
  _type text,
  _title text,
  _body text DEFAULT NULL,
  _href text DEFAULT NULL,
  _appointment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_notification_id uuid;
  v_patient_id uuid;
  v_doctor_id uuid;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow self-notifications without extra checks.
  IF _recipient_id = v_sender_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, href)
    VALUES (_recipient_id, coalesce(_type, 'info'), coalesce(_title, ''), _body, _href)
    RETURNING id INTO v_notification_id;
    RETURN v_notification_id;
  END IF;

  -- Cross-user notifications require a valid appointment relationship.
  IF _appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id is required for cross-user notifications';
  END IF;

  SELECT a.patient_id, a.doctor_id
    INTO v_patient_id, v_doctor_id
  FROM public.appointments a
  WHERE a.id = _appointment_id
  LIMIT 1;

  IF v_patient_id IS NULL OR v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Invalid appointment_id';
  END IF;

  -- Only allow doctor<->patient notifications within the same appointment.
  IF NOT (
    (v_sender_id = v_patient_id AND _recipient_id = v_doctor_id)
    OR
    (v_sender_id = v_doctor_id AND _recipient_id = v_patient_id)
  ) THEN
    RAISE EXCEPTION 'Sender and recipient are not participants of the appointment';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, href)
  VALUES (_recipient_id, coalesce(_type, 'info'), coalesce(_title, ''), _body, _href)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Allow authenticated clients to call the function.
GRANT EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text, uuid) TO authenticated;