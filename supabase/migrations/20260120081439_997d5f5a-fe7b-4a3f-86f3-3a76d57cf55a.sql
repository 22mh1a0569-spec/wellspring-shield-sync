-- Appointment lifecycle timestamps (used for consultation + notes visibility)
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS ended_at timestamptz;

-- Doctor notes & recommendations linked to an appointment
CREATE TABLE IF NOT EXISTS public.appointment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  diagnosis text,
  recommendations text,
  is_final boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id)
);

-- Foreign keys (public schema only)
ALTER TABLE public.appointment_notes
  DROP CONSTRAINT IF EXISTS appointment_notes_appointment_id_fkey,
  ADD CONSTRAINT appointment_notes_appointment_id_fkey
    FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.appointment_notes ENABLE ROW LEVEL SECURITY;

-- Policies: doctors manage notes for their appointments
DROP POLICY IF EXISTS "Appointment notes: doctor read own" ON public.appointment_notes;
CREATE POLICY "Appointment notes: doctor read own"
ON public.appointment_notes
FOR SELECT
USING (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Appointment notes: doctor insert own" ON public.appointment_notes;
CREATE POLICY "Appointment notes: doctor insert own"
ON public.appointment_notes
FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Appointment notes: doctor update own" ON public.appointment_notes;
CREATE POLICY "Appointment notes: doctor update own"
ON public.appointment_notes
FOR UPDATE
USING (auth.uid() = doctor_id);

-- Policies: patient can read only finalized notes for their appointments
DROP POLICY IF EXISTS "Appointment notes: patient read finalized" ON public.appointment_notes;
CREATE POLICY "Appointment notes: patient read finalized"
ON public.appointment_notes
FOR SELECT
USING (auth.uid() = patient_id AND is_final = true);

-- updated_at triggers (reuse existing set_updated_at())
DROP TRIGGER IF EXISTS set_updated_at_appointment_notes ON public.appointment_notes;
CREATE TRIGGER set_updated_at_appointment_notes
BEFORE UPDATE ON public.appointment_notes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_appointments ON public.appointments;
CREATE TRIGGER set_updated_at_appointments
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Extend ledger to support anchoring appointment notes as well as predictions
ALTER TABLE public.ledger_transactions
  ADD COLUMN IF NOT EXISTS appointment_id uuid,
  ADD COLUMN IF NOT EXISTS note_id uuid;

-- Allow prediction_id to be nullable (notes anchoring will use note_id)
ALTER TABLE public.ledger_transactions
  ALTER COLUMN prediction_id DROP NOT NULL;

-- FK for notes
ALTER TABLE public.ledger_transactions
  DROP CONSTRAINT IF EXISTS ledger_transactions_note_id_fkey,
  ADD CONSTRAINT ledger_transactions_note_id_fkey
    FOREIGN KEY (note_id) REFERENCES public.appointment_notes(id) ON DELETE SET NULL;

-- Optional FK for appointment
ALTER TABLE public.ledger_transactions
  DROP CONSTRAINT IF EXISTS ledger_transactions_appointment_id_fkey,
  ADD CONSTRAINT ledger_transactions_appointment_id_fkey
    FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;

-- Ensure ledger row anchors exactly one payload type (prediction or note)
ALTER TABLE public.ledger_transactions
  DROP CONSTRAINT IF EXISTS ledger_transactions_exactly_one_payload;
ALTER TABLE public.ledger_transactions
  ADD CONSTRAINT ledger_transactions_exactly_one_payload
  CHECK ((num_nonnulls(prediction_id, note_id) = 1));
