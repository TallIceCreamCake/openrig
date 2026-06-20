-- Equipment incidents (sinistres) management
-- Covers: damage, theft, accident, loss, vandalism
-- Workflow: reported → assessed → claimed → in_repair → resolved → closed

create table if not exists public.equipment_incidents (
  id                       uuid default gen_random_uuid() primary key,

  -- Equipment
  equipment_id             uuid references public.equipment(id) on delete set null,
  equipment_unit_id        uuid references public.equipment_units(id) on delete set null,
  serial_number            text,
  equipment_name           text, -- snapshot at time of incident

  -- Context
  rental_id                uuid references public.rentals(id) on delete set null,
  client_id                uuid references public.clients(id) on delete set null,
  client_name              text, -- snapshot

  -- Incident
  incident_type            text not null check (incident_type in ('damage','theft','accident','loss','vandalism','other')),
  severity                 text not null default 'moderate' check (severity in ('minor','moderate','severe','total_loss')),
  status                   text not null default 'reported' check (status in ('reported','assessed','claimed','in_repair','resolved','closed')),
  title                    text not null,
  description              text,
  incident_date            date,
  location                 text,

  -- Responsibility
  reported_by              uuid references public.app_users(id) on delete set null,
  client_liability_percent numeric(5,2) not null default 100 check (client_liability_percent between 0 and 100),

  -- Financial
  repair_estimate          numeric(12,2),
  final_cost               numeric(12,2),
  client_charge_amount     numeric(12,2) generated always as (
    round(coalesce(final_cost, repair_estimate, 0) * client_liability_percent / 100, 2)
  ) stored,

  -- Insurance
  insurance_status         text not null default 'not_applicable'
                             check (insurance_status in ('not_applicable','to_declare','declared','accepted','refused','paid')),
  insurance_claim_number   text,
  insurance_provider       text,
  insurance_coverage_amount numeric(12,2),

  -- Maintenance link (auto-created corrective task)
  maintenance_task_id      uuid references public.maintenance_tasks(id) on delete set null,

  -- Timeline
  assessed_at              timestamptz,
  assessed_by              uuid references public.app_users(id) on delete set null,
  resolved_at              timestamptz,

  created_at               timestamptz default now() not null,
  updated_at               timestamptz default now() not null
);

create index if not exists idx_equipment_incidents_equipment on public.equipment_incidents(equipment_id);
create index if not exists idx_equipment_incidents_rental on public.equipment_incidents(rental_id);
create index if not exists idx_equipment_incidents_status on public.equipment_incidents(status);
create index if not exists idx_equipment_incidents_client on public.equipment_incidents(client_id);

-- Documents / photos attached to an incident
create table if not exists public.incident_documents (
  id           uuid default gen_random_uuid() primary key,
  incident_id  uuid not null references public.equipment_incidents(id) on delete cascade,
  doc_type     text not null default 'photo'
               check (doc_type in ('photo','assessment','quote','insurance_claim','invoice','other')),
  title        text not null,
  file_url     text not null,
  uploaded_by  uuid references public.app_users(id) on delete set null,
  created_at   timestamptz default now() not null
);

create index if not exists idx_incident_documents_incident on public.incident_documents(incident_id);

-- Auto-update updated_at
create or replace function public.touch_equipment_incidents_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_equipment_incidents_updated_at on public.equipment_incidents;
create trigger trg_equipment_incidents_updated_at
  before update on public.equipment_incidents
  for each row execute function public.touch_equipment_incidents_updated_at();

-- RLS (open for service role, standard for authenticated)
alter table public.equipment_incidents enable row level security;
alter table public.incident_documents  enable row level security;

create policy "Full access equipment_incidents" on public.equipment_incidents
  using (true) with check (true);
create policy "Full access incident_documents" on public.incident_documents
  using (true) with check (true);
