-- Smart Healthcare using AI & Blockchain (MVP)

-- 1) Shared updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Profiles (non-privileged user metadata; DO NOT store roles here)
create table if not exists public.profiles (
  user_id uuid primary key,
  full_name text,
  phone text,
  specialization text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles: read own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Profiles: insert own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Profiles: update own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- 3) Roles (SECURITY: roles must be in a separate table)
create type public.app_role as enum ('patient', 'doctor');

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

create policy "User roles: read own"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

create policy "User roles: insert own (single role at signup)"
on public.user_roles
for insert
to authenticated
with check (auth.uid() = user_id);

-- no update/delete by default (avoid privilege escalation)

-- 4) Consent-based doctor access
create table if not exists public.doctor_patient_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  doctor_id uuid not null,
  status text not null default 'pending', -- pending | granted | revoked
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, doctor_id)
);

alter table public.doctor_patient_consents enable row level security;

create policy "Consents: patient can read their consents"
on public.doctor_patient_consents
for select
to authenticated
using (auth.uid() = patient_id);

create policy "Consents: doctor can read requests addressed to them"
on public.doctor_patient_consents
for select
to authenticated
using (auth.uid() = doctor_id);

create policy "Consents: patient can create requests"
on public.doctor_patient_consents
for insert
to authenticated
with check (auth.uid() = patient_id);

create policy "Consents: patient can update status"
on public.doctor_patient_consents
for update
to authenticated
using (auth.uid() = patient_id);

create policy "Consents: doctor can update status for their requests"
on public.doctor_patient_consents
for update
to authenticated
using (auth.uid() = doctor_id);

create trigger trg_consents_updated_at
before update on public.doctor_patient_consents
for each row execute function public.set_updated_at();

create index if not exists idx_consents_patient on public.doctor_patient_consents(patient_id);
create index if not exists idx_consents_doctor on public.doctor_patient_consents(doctor_id);

-- 5) Health metrics (optional, but supports dashboard + charts)
create table if not exists public.health_metrics (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  heart_rate int,
  systolic_bp int,
  diastolic_bp int,
  glucose_mgdl int,
  temperature_c numeric,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.health_metrics enable row level security;

create policy "Health metrics: patient read own"
on public.health_metrics
for select
to authenticated
using (auth.uid() = patient_id);

create policy "Health metrics: patient insert own"
on public.health_metrics
for insert
to authenticated
with check (auth.uid() = patient_id);

create policy "Health metrics: patient update own"
on public.health_metrics
for update
to authenticated
using (auth.uid() = patient_id);

create policy "Health metrics: doctors read granted patients"
on public.health_metrics
for select
to authenticated
using (
  public.has_role(auth.uid(), 'doctor') and exists (
    select 1 from public.doctor_patient_consents c
    where c.patient_id = health_metrics.patient_id
      and c.doctor_id = auth.uid()
      and c.status = 'granted'
  )
);

create trigger trg_health_metrics_updated_at
before update on public.health_metrics
for each row execute function public.set_updated_at();

create index if not exists idx_health_metrics_patient on public.health_metrics(patient_id, recorded_at desc);

-- 6) AI predictions (risk + score) and report basics
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  created_by uuid not null, -- could be patient or doctor
  input jsonb not null,
  risk_percentage int not null,
  risk_category text not null,
  health_score int not null,
  doctor_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.predictions enable row level security;

create policy "Predictions: patient read own"
on public.predictions
for select
to authenticated
using (auth.uid() = patient_id);

create policy "Predictions: patient insert own"
on public.predictions
for insert
to authenticated
with check (auth.uid() = patient_id and auth.uid() = created_by);

create policy "Predictions: patient update remarks on own"
on public.predictions
for update
to authenticated
using (auth.uid() = patient_id);

create policy "Predictions: doctors read granted patients"
on public.predictions
for select
to authenticated
using (
  public.has_role(auth.uid(), 'doctor') and exists (
    select 1 from public.doctor_patient_consents c
    where c.patient_id = predictions.patient_id
      and c.doctor_id = auth.uid()
      and c.status = 'granted'
  )
);

create policy "Predictions: doctors insert for granted patients"
on public.predictions
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'doctor')
  and auth.uid() = created_by
  and exists (
    select 1 from public.doctor_patient_consents c
    where c.patient_id = predictions.patient_id
      and c.doctor_id = auth.uid()
      and c.status = 'granted'
  )
);

create policy "Predictions: doctors update remarks for granted patients"
on public.predictions
for update
to authenticated
using (
  public.has_role(auth.uid(), 'doctor')
  and exists (
    select 1 from public.doctor_patient_consents c
    where c.patient_id = predictions.patient_id
      and c.doctor_id = auth.uid()
      and c.status = 'granted'
  )
);

create trigger trg_predictions_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

create index if not exists idx_predictions_patient on public.predictions(patient_id, created_at desc);

-- 7) Simulated blockchain ledger for predictions
create table if not exists public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  patient_id uuid not null,
  created_by uuid not null,
  tx_id text not null unique,
  prev_hash text,
  payload_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.ledger_transactions enable row level security;

create policy "Ledger: patient read own"
on public.ledger_transactions
for select
to authenticated
using (auth.uid() = patient_id);

create policy "Ledger: doctors read granted patients"
on public.ledger_transactions
for select
to authenticated
using (
  public.has_role(auth.uid(), 'doctor') and exists (
    select 1 from public.doctor_patient_consents c
    where c.patient_id = ledger_transactions.patient_id
      and c.doctor_id = auth.uid()
      and c.status = 'granted'
  )
);

create policy "Ledger: insert by creator"
on public.ledger_transactions
for insert
to authenticated
with check (auth.uid() = created_by);

create index if not exists idx_ledger_patient on public.ledger_transactions(patient_id, created_at desc);

-- 8) Telemedicine: doctor availability + appointments
create table if not exists public.doctor_availability (
  doctor_id uuid primary key,
  is_available boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.doctor_availability enable row level security;

create policy "Availability: doctor read own"
on public.doctor_availability
for select to authenticated
using (auth.uid() = doctor_id);

create policy "Availability: doctor upsert own"
on public.doctor_availability
for insert to authenticated
with check (auth.uid() = doctor_id);

create policy "Availability: doctor update own"
on public.doctor_availability
for update to authenticated
using (auth.uid() = doctor_id);

create policy "Availability: patients read available doctors"
on public.doctor_availability
for select to authenticated
using (is_available = true);

create trigger trg_availability_updated_at
before update on public.doctor_availability
for each row execute function public.set_updated_at();

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  doctor_id uuid not null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled', -- scheduled | completed | cancelled
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

create policy "Appointments: patient read own"
on public.appointments
for select to authenticated
using (auth.uid() = patient_id);

create policy "Appointments: doctor read own"
on public.appointments
for select to authenticated
using (auth.uid() = doctor_id);

create policy "Appointments: patient create"
on public.appointments
for insert to authenticated
with check (auth.uid() = patient_id);

create policy "Appointments: patient update own"
on public.appointments
for update to authenticated
using (auth.uid() = patient_id);

create policy "Appointments: doctor update own"
on public.appointments
for update to authenticated
using (auth.uid() = doctor_id);

create trigger trg_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

create index if not exists idx_appointments_doctor on public.appointments(doctor_id, scheduled_for);
create index if not exists idx_appointments_patient on public.appointments(patient_id, scheduled_for);

-- 9) Telemedicine chat messages per appointment
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "Chat: participants can read"
on public.chat_messages
for select to authenticated
using (
  exists (
    select 1 from public.appointments a
    where a.id = chat_messages.appointment_id
      and (a.patient_id = auth.uid() or a.doctor_id = auth.uid())
  )
);

create policy "Chat: participants can send"
on public.chat_messages
for insert to authenticated
with check (
  auth.uid() = sender_id and exists (
    select 1 from public.appointments a
    where a.id = chat_messages.appointment_id
      and (a.patient_id = auth.uid() or a.doctor_id = auth.uid())
  )
);

create index if not exists idx_chat_messages_appt on public.chat_messages(appointment_id, created_at);

-- 10) Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  body text,
  href text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "Notifications: read own"
on public.notifications
for select to authenticated
using (auth.uid() = user_id);

create policy "Notifications: insert own"
on public.notifications
for insert to authenticated
with check (auth.uid() = user_id);

create policy "Notifications: update own"
on public.notifications
for update to authenticated
using (auth.uid() = user_id);

create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);

-- 11) Enable realtime for chat
alter publication supabase_realtime add table public.chat_messages;