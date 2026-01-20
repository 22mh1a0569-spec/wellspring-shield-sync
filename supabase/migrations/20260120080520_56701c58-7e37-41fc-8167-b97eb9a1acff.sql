-- Add sender_role to chat_messages for labeling and auditing
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS sender_role public.app_role;

-- Backfill sender_role for existing messages using the appointment participants
UPDATE public.chat_messages m
SET sender_role = CASE
  WHEN a.patient_id = m.sender_id THEN 'patient'::public.app_role
  WHEN a.doctor_id = m.sender_id THEN 'doctor'::public.app_role
  ELSE NULL
END
FROM public.appointments a
WHERE a.id = m.appointment_id
  AND m.sender_role IS NULL;

-- Ensure chat_messages changes are streamed over realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION
    WHEN duplicate_object THEN
      -- table already in publication
      NULL;
  END;
END $$;

-- Set/validate sender_role server-side to prevent spoofing
CREATE OR REPLACE FUNCTION public.set_chat_message_sender_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient uuid;
  v_doctor uuid;
BEGIN
  SELECT patient_id, doctor_id
    INTO v_patient, v_doctor
  FROM public.appointments
  WHERE id = NEW.appointment_id;

  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Invalid appointment_id';
  END IF;

  IF NEW.sender_id = v_patient THEN
    NEW.sender_role := 'patient'::public.app_role;
  ELSIF NEW.sender_id = v_doctor THEN
    NEW.sender_role := 'doctor'::public.app_role;
  ELSE
    RAISE EXCEPTION 'Sender is not a participant of the appointment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_chat_message_sender_role ON public.chat_messages;
CREATE TRIGGER trg_set_chat_message_sender_role
BEFORE INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_chat_message_sender_role();
