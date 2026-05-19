-- Service project crew management v2
-- - HR worker profiles (intermittent / auto-entrepreneur / stagiaire / etc.)
-- - Crew assignments for service projects only
-- - Shift-level planning, timesheets, project payroll/costs
-- - Legacy sync with rental_affectation + personnel_activities for current app compatibility

-- 1) Extend HR profile (connected to existing personnel module)
alter table if exists public.app_user_hr
  add column if not exists employment_type text not null default 'employee',
  add column if not exists payment_model text not null default 'salary',
  add column if not exists default_hourly_rate numeric(12,2),
  add column if not exists default_day_rate numeric(12,2),
  add column if not exists default_cachet_rate numeric(12,2),
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists legal_identifier text,
  add column if not exists school_name text,
  add column if not exists payroll_notes text;

do $$
begin
  if to_regclass('public.app_user_hr') is not null then
    alter table public.app_user_hr
      drop constraint if exists app_user_hr_employment_type_check;
    alter table public.app_user_hr
      add constraint app_user_hr_employment_type_check
      check (employment_type in ('employee', 'intermittent', 'auto_entrepreneur', 'intern', 'freelance', 'subcontractor'));

    alter table public.app_user_hr
      drop constraint if exists app_user_hr_payment_model_check;
    alter table public.app_user_hr
      add constraint app_user_hr_payment_model_check
      check (payment_model in ('salary', 'hourly', 'daily', 'cachet', 'mixed'));

    alter table public.app_user_hr
      drop constraint if exists app_user_hr_default_hourly_rate_check;
    alter table public.app_user_hr
      add constraint app_user_hr_default_hourly_rate_check
      check (default_hourly_rate is null or default_hourly_rate >= 0);

    alter table public.app_user_hr
      drop constraint if exists app_user_hr_default_day_rate_check;
    alter table public.app_user_hr
      add constraint app_user_hr_default_day_rate_check
      check (default_day_rate is null or default_day_rate >= 0);

    alter table public.app_user_hr
      drop constraint if exists app_user_hr_default_cachet_rate_check;
    alter table public.app_user_hr
      add constraint app_user_hr_default_cachet_rate_check
      check (default_cachet_rate is null or default_cachet_rate >= 0);

    alter table public.app_user_hr
      drop constraint if exists app_user_hr_contract_dates_check;
    alter table public.app_user_hr
      add constraint app_user_hr_contract_dates_check
      check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date);
  end if;
end;
$$;

update public.app_user_hr
set
  employment_type = coalesce(nullif(trim(coalesce(employment_type, '')), ''), 'employee'),
  payment_model = coalesce(nullif(trim(coalesce(payment_model, '')), ''), 'salary'),
  default_hourly_rate = case when default_hourly_rate is not null and default_hourly_rate < 0 then null else default_hourly_rate end,
  default_day_rate = case when default_day_rate is not null and default_day_rate < 0 then null else default_day_rate end,
  default_cachet_rate = case when default_cachet_rate is not null and default_cachet_rate < 0 then null else default_cachet_rate end;

-- 2) Historical compensation profiles (per-person, effective-dated)
create table if not exists public.personnel_compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.app_users(id) on delete cascade,
  effective_from date not null default current_date,
  effective_to date,
  employment_type text not null default 'employee' check (employment_type in ('employee', 'intermittent', 'auto_entrepreneur', 'intern', 'freelance', 'subcontractor')),
  payment_model text not null default 'hourly' check (payment_model in ('salary', 'hourly', 'daily', 'cachet', 'mixed')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  hourly_rate numeric(12,2),
  day_rate numeric(12,2),
  cachet_rate numeric(12,2),
  overtime_multiplier numeric(6,3) not null default 1.250,
  night_multiplier numeric(6,3) not null default 1.150,
  weekend_multiplier numeric(6,3) not null default 1.200,
  travel_allowance numeric(12,2) not null default 0,
  meal_allowance numeric(12,2) not null default 0,
  lodging_allowance numeric(12,2) not null default 0,
  legal_identifier text,
  company_name text,
  school_name text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (personnel_id, effective_from),
  check (effective_to is null or effective_to >= effective_from),
  check (hourly_rate is null or hourly_rate >= 0),
  check (day_rate is null or day_rate >= 0),
  check (cachet_rate is null or cachet_rate >= 0),
  check (overtime_multiplier >= 1),
  check (night_multiplier >= 1),
  check (weekend_multiplier >= 1),
  check (travel_allowance >= 0),
  check (meal_allowance >= 0),
  check (lodging_allowance >= 0)
);

create index if not exists idx_personnel_comp_profiles_personnel_effective
  on public.personnel_compensation_profiles (personnel_id, effective_from desc);

create index if not exists idx_personnel_comp_profiles_active_window
  on public.personnel_compensation_profiles (effective_from, effective_to);

drop trigger if exists trg_personnel_compensation_profiles_touch_updated_at on public.personnel_compensation_profiles;
create trigger trg_personnel_compensation_profiles_touch_updated_at
before update on public.personnel_compensation_profiles
for each row
execute function public.touch_updated_at_column();

insert into public.personnel_compensation_profiles (
  personnel_id,
  effective_from,
  employment_type,
  payment_model,
  currency,
  hourly_rate,
  day_rate,
  cachet_rate,
  legal_identifier,
  school_name,
  notes,
  metadata
)
select
  hr.user_id,
  coalesce(hr.contract_start_date, hr.hire_date, current_date),
  coalesce(nullif(trim(coalesce(hr.employment_type, '')), ''), 'employee'),
  coalesce(nullif(trim(coalesce(hr.payment_model, '')), ''), 'salary'),
  'EUR',
  hr.default_hourly_rate,
  hr.default_day_rate,
  hr.default_cachet_rate,
  hr.legal_identifier,
  hr.school_name,
  hr.payroll_notes,
  jsonb_build_object('source', 'app_user_hr_backfill')
from public.app_user_hr hr
where not exists (
  select 1
  from public.personnel_compensation_profiles p
  where p.personnel_id = hr.user_id
)
on conflict do nothing;

-- 3) Crew role catalog
create table if not exists public.rental_crew_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text,
  color text not null default '#334155' check (color ~ '^#([0-9a-fA-F]{6})$'),
  default_payment_model text not null default 'hourly' check (default_payment_model in ('salary', 'hourly', 'daily', 'cachet', 'mixed')),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_rental_crew_roles_active_sort
  on public.rental_crew_roles (is_active, sort_order, name);

drop trigger if exists trg_rental_crew_roles_touch_updated_at on public.rental_crew_roles;
create trigger trg_rental_crew_roles_touch_updated_at
before update on public.rental_crew_roles
for each row
execute function public.touch_updated_at_column();

insert into public.rental_crew_roles (code, name, description, color, default_payment_model, sort_order)
values
  ('project_manager', 'Chef de projet', 'Pilotage global de la prestation', '#0f766e', 'daily', 10),
  ('site_manager', 'Régisseur', 'Coordination opérationnelle terrain', '#1d4ed8', 'daily', 20),
  ('light_tech', 'Technicien lumière', 'Installation / exploitation lumière', '#7c3aed', 'hourly', 30),
  ('sound_tech', 'Technicien son', 'Installation / exploitation son', '#2563eb', 'hourly', 40),
  ('video_tech', 'Technicien vidéo', 'Installation / exploitation vidéo', '#9333ea', 'hourly', 50),
  ('stagehand', 'Road / Machiniste', 'Manutention et plateau', '#4b5563', 'hourly', 60),
  ('driver', 'Chauffeur', 'Transport équipe / matériel', '#b45309', 'hourly', 70),
  ('intern', 'Stagiaire', 'Renfort opérationnel en apprentissage', '#16a34a', 'hourly', 80)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  color = excluded.color,
  default_payment_model = excluded.default_payment_model,
  sort_order = excluded.sort_order,
  is_active = true;

-- 4) Service-project crew requirements and assignments
create table if not exists public.rental_crew_role_requirements (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  crew_role_id uuid not null references public.rental_crew_roles(id) on delete restrict,
  required_headcount integer not null default 1 check (required_headcount >= 0 and required_headcount <= 500),
  required_start_at timestamp with time zone,
  required_end_at timestamp with time zone,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (required_end_at is null or required_start_at is null or required_end_at >= required_start_at)
);

create index if not exists idx_rental_crew_requirements_rental
  on public.rental_crew_role_requirements (rental_id, crew_role_id);

drop trigger if exists trg_rental_crew_role_requirements_touch_updated_at on public.rental_crew_role_requirements;
create trigger trg_rental_crew_role_requirements_touch_updated_at
before update on public.rental_crew_role_requirements
for each row
execute function public.touch_updated_at_column();

create table if not exists public.rental_crew_assignments (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  personnel_id uuid not null references public.app_users(id) on delete restrict,
  crew_role_id uuid references public.rental_crew_roles(id) on delete set null,
  assignment_source text not null default 'manual' check (assignment_source in ('manual', 'rental_affectation_sync', 'api', 'planning')),
  assignment_status text not null default 'confirmed' check (assignment_status in ('draft', 'confirmed', 'in_progress', 'done', 'cancelled')),
  title text,
  planned_start_at timestamp with time zone,
  planned_end_at timestamp with time zone,
  call_time timestamp with time zone,
  wrap_time timestamp with time zone,
  location_override text,
  planned_break_minutes integer not null default 0 check (planned_break_minutes >= 0 and planned_break_minutes <= 1440),
  workload_percent numeric(5,2) not null default 100 check (workload_percent >= 0 and workload_percent <= 200),
  expected_payment_model text check (expected_payment_model in ('salary', 'hourly', 'daily', 'cachet', 'mixed')),
  expected_hourly_rate numeric(12,2),
  expected_day_rate numeric(12,2),
  expected_cachet_rate numeric(12,2),
  expected_hours numeric(12,2) not null default 0,
  expected_days numeric(12,2) not null default 0,
  expected_gross_amount numeric(12,2) not null default 0,
  expected_expenses_amount numeric(12,2) not null default 0,
  expected_total_cost numeric(12,2) not null default 0,
  actual_hours numeric(12,2) not null default 0,
  actual_gross_amount numeric(12,2) not null default 0,
  actual_expenses_amount numeric(12,2) not null default 0,
  actual_total_cost numeric(12,2) not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  cancelled_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (planned_end_at is null or planned_start_at is null or planned_end_at >= planned_start_at),
  check (expected_hourly_rate is null or expected_hourly_rate >= 0),
  check (expected_day_rate is null or expected_day_rate >= 0),
  check (expected_cachet_rate is null or expected_cachet_rate >= 0),
  check (expected_hours >= 0),
  check (expected_days >= 0),
  check (expected_gross_amount >= 0),
  check (expected_expenses_amount >= 0),
  check (expected_total_cost >= 0),
  check (actual_hours >= 0),
  check (actual_gross_amount >= 0),
  check (actual_expenses_amount >= 0),
  check (actual_total_cost >= 0)
);

create unique index if not exists idx_rental_crew_assignments_rental_personnel
  on public.rental_crew_assignments (rental_id, personnel_id);

create index if not exists idx_rental_crew_assignments_rental_status
  on public.rental_crew_assignments (rental_id, assignment_status, planned_start_at);

create index if not exists idx_rental_crew_assignments_personnel_status
  on public.rental_crew_assignments (personnel_id, assignment_status, planned_start_at);

drop trigger if exists trg_rental_crew_assignments_touch_updated_at on public.rental_crew_assignments;
create trigger trg_rental_crew_assignments_touch_updated_at
before update on public.rental_crew_assignments
for each row
execute function public.touch_updated_at_column();

-- 5) Shift planning, timesheets and pay items
create table if not exists public.rental_crew_shifts (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  assignment_id uuid not null references public.rental_crew_assignments(id) on delete cascade,
  personnel_id uuid not null references public.app_users(id) on delete restrict,
  shift_type text not null default 'custom' check (shift_type in ('setup', 'show', 'teardown', 'travel', 'pickup', 'return', 'rehearsal', 'custom')),
  title text,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 1440),
  shift_status text not null default 'planned' check (shift_status in ('planned', 'confirmed', 'in_progress', 'done', 'cancelled')),
  location text,
  milestone_id uuid references public.rental_milestones(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (ends_at >= starts_at)
);

create index if not exists idx_rental_crew_shifts_rental_dates
  on public.rental_crew_shifts (rental_id, starts_at, ends_at);

create index if not exists idx_rental_crew_shifts_assignment
  on public.rental_crew_shifts (assignment_id, starts_at);

create index if not exists idx_rental_crew_shifts_personnel
  on public.rental_crew_shifts (personnel_id, starts_at);

drop trigger if exists trg_rental_crew_shifts_touch_updated_at on public.rental_crew_shifts;
create trigger trg_rental_crew_shifts_touch_updated_at
before update on public.rental_crew_shifts
for each row
execute function public.touch_updated_at_column();

create table if not exists public.rental_crew_time_entries (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  assignment_id uuid not null references public.rental_crew_assignments(id) on delete cascade,
  shift_id uuid references public.rental_crew_shifts(id) on delete set null,
  personnel_id uuid not null references public.app_users(id) on delete restrict,
  started_at timestamp with time zone not null,
  ended_at timestamp with time zone not null,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 1440),
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  entry_status text not null default 'submitted' check (entry_status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  approved_by uuid,
  approved_at timestamp with time zone,
  rejection_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (ended_at >= started_at)
);

create index if not exists idx_rental_crew_time_entries_assignment
  on public.rental_crew_time_entries (assignment_id, started_at);

create index if not exists idx_rental_crew_time_entries_shift
  on public.rental_crew_time_entries (shift_id);

create index if not exists idx_rental_crew_time_entries_rental_status
  on public.rental_crew_time_entries (rental_id, entry_status, started_at);

drop trigger if exists trg_rental_crew_time_entries_touch_updated_at on public.rental_crew_time_entries;
create trigger trg_rental_crew_time_entries_touch_updated_at
before update on public.rental_crew_time_entries
for each row
execute function public.touch_updated_at_column();

create table if not exists public.rental_crew_pay_items (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  assignment_id uuid not null references public.rental_crew_assignments(id) on delete cascade,
  personnel_id uuid not null references public.app_users(id) on delete restrict,
  time_entry_id uuid references public.rental_crew_time_entries(id) on delete set null,
  item_type text not null default 'adjustment' check (item_type in ('hourly', 'daily', 'cachet', 'overtime', 'night_bonus', 'weekend_bonus', 'meal_allowance', 'travel_allowance', 'lodging_allowance', 'expense', 'adjustment')),
  source text not null default 'manual' check (source in ('manual', 'auto', 'import')),
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit_amount numeric(12,2) not null default 0 check (unit_amount >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  is_expense boolean not null default false,
  is_locked boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_rental_crew_pay_items_assignment
  on public.rental_crew_pay_items (assignment_id, source, item_type, created_at desc);

create index if not exists idx_rental_crew_pay_items_rental
  on public.rental_crew_pay_items (rental_id, created_at desc);

drop trigger if exists trg_rental_crew_pay_items_touch_updated_at on public.rental_crew_pay_items;
create trigger trg_rental_crew_pay_items_touch_updated_at
before update on public.rental_crew_pay_items
for each row
execute function public.touch_updated_at_column();

create table if not exists public.rental_crew_shift_activity_links (
  shift_id uuid primary key references public.rental_crew_shifts(id) on delete cascade,
  activity_id uuid not null unique references public.personnel_activities(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

-- 6) Business helpers and consistency triggers
create or replace function public.assert_rental_is_service_project(p_rental_id uuid)
returns void
language plpgsql
as $$
declare
  v_type text;
begin
  if p_rental_id is null then
    raise exception 'rental_id is required';
  end if;

  select r.type
    into v_type
  from public.rentals r
  where r.id = p_rental_id;

  if v_type is null then
    raise exception 'Rental % not found', p_rental_id;
  end if;

  if v_type <> 'service' then
    raise exception 'Rental % is type %, expected service', p_rental_id, v_type;
  end if;
end;
$$;

create or replace function public.get_personnel_compensation_profile(
  p_personnel_id uuid,
  p_on_date date default current_date
)
returns public.personnel_compensation_profiles
language plpgsql
stable
as $$
declare
  v_profile public.personnel_compensation_profiles%rowtype;
begin
  select *
    into v_profile
  from public.personnel_compensation_profiles p
  where p.personnel_id = p_personnel_id
    and p.effective_from <= coalesce(p_on_date, current_date)
    and (p.effective_to is null or p.effective_to >= coalesce(p_on_date, current_date))
  order by p.effective_from desc
  limit 1;

  return v_profile;
end;
$$;

create or replace function public.enforce_rental_crew_assignment_consistency()
returns trigger
language plpgsql
as $$
declare
  v_rental record;
  v_role record;
  v_profile public.personnel_compensation_profiles%rowtype;
begin
  perform public.assert_rental_is_service_project(new.rental_id);

  select r.id, r.start_date, r.end_date, r.location
    into v_rental
  from public.rentals r
  where r.id = new.rental_id;

  select rr.name, rr.default_payment_model
    into v_role
  from public.rental_crew_roles rr
  where rr.id = new.crew_role_id;

  v_profile := public.get_personnel_compensation_profile(new.personnel_id, coalesce(new.planned_start_at::date, v_rental.start_date::date, current_date));

  new.assignment_source := coalesce(new.assignment_source, 'manual');
  new.assignment_status := coalesce(new.assignment_status, 'confirmed');
  new.planned_start_at := coalesce(new.planned_start_at, v_rental.start_date);
  new.planned_end_at := coalesce(new.planned_end_at, v_rental.end_date, new.planned_start_at);

  if new.planned_end_at < new.planned_start_at then
    raise exception 'planned_end_at must be >= planned_start_at';
  end if;

  new.location_override := coalesce(new.location_override, v_rental.location);
  new.planned_break_minutes := greatest(least(coalesce(new.planned_break_minutes, 0), 1440), 0);
  new.workload_percent := greatest(least(coalesce(new.workload_percent, 100), 200), 0);

  new.expected_payment_model := coalesce(new.expected_payment_model, v_role.default_payment_model, v_profile.payment_model, 'hourly');
  new.expected_hourly_rate := case
    when new.expected_hourly_rate is not null then greatest(new.expected_hourly_rate, 0)
    when v_profile.hourly_rate is not null then greatest(v_profile.hourly_rate, 0)
    else null
  end;
  new.expected_day_rate := case
    when new.expected_day_rate is not null then greatest(new.expected_day_rate, 0)
    when v_profile.day_rate is not null then greatest(v_profile.day_rate, 0)
    else null
  end;
  new.expected_cachet_rate := case
    when new.expected_cachet_rate is not null then greatest(new.expected_cachet_rate, 0)
    when v_profile.cachet_rate is not null then greatest(v_profile.cachet_rate, 0)
    else null
  end;

  new.expected_hours := greatest(coalesce(new.expected_hours, 0), 0);
  new.expected_days := greatest(coalesce(new.expected_days, 0), 0);
  new.expected_gross_amount := greatest(coalesce(new.expected_gross_amount, 0), 0);
  new.expected_expenses_amount := greatest(coalesce(new.expected_expenses_amount, 0), 0);
  new.expected_total_cost := greatest(coalesce(new.expected_total_cost, 0), 0);
  new.actual_hours := greatest(coalesce(new.actual_hours, 0), 0);
  new.actual_gross_amount := greatest(coalesce(new.actual_gross_amount, 0), 0);
  new.actual_expenses_amount := greatest(coalesce(new.actual_expenses_amount, 0), 0);
  new.actual_total_cost := greatest(coalesce(new.actual_total_cost, 0), 0);

  if coalesce(new.title, '') = '' then
    new.title := coalesce(v_role.name, 'Intervenant prestation');
  end if;

  if new.assignment_status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif tg_op = 'UPDATE' and old.assignment_status = 'cancelled' and new.assignment_status <> 'cancelled' then
    new.cancelled_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_rental_crew_assignment_consistency on public.rental_crew_assignments;
create trigger trg_enforce_rental_crew_assignment_consistency
before insert or update on public.rental_crew_assignments
for each row
execute function public.enforce_rental_crew_assignment_consistency();

create or replace function public.enforce_rental_crew_shift_consistency()
returns trigger
language plpgsql
as $$
declare
  v_assignment public.rental_crew_assignments%rowtype;
  v_rental record;
begin
  select *
    into v_assignment
  from public.rental_crew_assignments a
  where a.id = new.assignment_id;

  if v_assignment.id is null then
    raise exception 'Unknown assignment %', new.assignment_id;
  end if;

  new.rental_id := v_assignment.rental_id;
  new.personnel_id := v_assignment.personnel_id;

  perform public.assert_rental_is_service_project(new.rental_id);

  select r.start_date, r.end_date, r.location
    into v_rental
  from public.rentals r
  where r.id = new.rental_id;

  new.shift_type := coalesce(new.shift_type, 'custom');
  new.shift_status := coalesce(new.shift_status, 'planned');
  new.starts_at := coalesce(new.starts_at, v_assignment.planned_start_at, v_rental.start_date, now());
  new.ends_at := coalesce(new.ends_at, v_assignment.planned_end_at, v_rental.end_date, new.starts_at);

  if new.ends_at < new.starts_at then
    raise exception 'Shift end must be >= start';
  end if;

  new.break_minutes := greatest(least(coalesce(new.break_minutes, 0), 1440), 0);
  new.location := coalesce(new.location, v_assignment.location_override, v_rental.location);

  return new;
end;
$$;

drop trigger if exists trg_enforce_rental_crew_shift_consistency on public.rental_crew_shifts;
create trigger trg_enforce_rental_crew_shift_consistency
before insert or update on public.rental_crew_shifts
for each row
execute function public.enforce_rental_crew_shift_consistency();

create or replace function public.enforce_rental_crew_time_entry_consistency()
returns trigger
language plpgsql
as $$
declare
  v_assignment public.rental_crew_assignments%rowtype;
  v_shift public.rental_crew_shifts%rowtype;
  v_minutes integer;
begin
  if new.shift_id is not null then
    select *
      into v_shift
    from public.rental_crew_shifts s
    where s.id = new.shift_id;

    if v_shift.id is null then
      raise exception 'Unknown shift %', new.shift_id;
    end if;

    new.assignment_id := v_shift.assignment_id;
    new.rental_id := v_shift.rental_id;
    new.personnel_id := v_shift.personnel_id;

    new.started_at := coalesce(new.started_at, v_shift.starts_at);
    new.ended_at := coalesce(new.ended_at, v_shift.ends_at);
    new.break_minutes := coalesce(new.break_minutes, v_shift.break_minutes, 0);
  end if;

  select *
    into v_assignment
  from public.rental_crew_assignments a
  where a.id = new.assignment_id;

  if v_assignment.id is null then
    raise exception 'Unknown assignment %', new.assignment_id;
  end if;

  new.rental_id := v_assignment.rental_id;
  new.personnel_id := v_assignment.personnel_id;

  perform public.assert_rental_is_service_project(new.rental_id);

  if new.started_at is null or new.ended_at is null then
    raise exception 'started_at and ended_at are required';
  end if;

  if new.ended_at < new.started_at then
    raise exception 'ended_at must be >= started_at';
  end if;

  new.break_minutes := greatest(least(coalesce(new.break_minutes, 0), 1440), 0);

  v_minutes := greatest(
    floor(extract(epoch from (new.ended_at - new.started_at)) / 60)::int - coalesce(new.break_minutes, 0),
    0
  );

  new.worked_minutes := v_minutes;
  new.entry_status := coalesce(new.entry_status, 'submitted');

  if new.entry_status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
  elsif new.entry_status in ('rejected', 'cancelled') then
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_rental_crew_time_entry_consistency on public.rental_crew_time_entries;
create trigger trg_enforce_rental_crew_time_entry_consistency
before insert or update on public.rental_crew_time_entries
for each row
execute function public.enforce_rental_crew_time_entry_consistency();

create or replace function public.enforce_rental_crew_pay_item_consistency()
returns trigger
language plpgsql
as $$
declare
  v_assignment public.rental_crew_assignments%rowtype;
begin
  select *
    into v_assignment
  from public.rental_crew_assignments a
  where a.id = new.assignment_id;

  if v_assignment.id is null then
    raise exception 'Unknown assignment %', new.assignment_id;
  end if;

  new.rental_id := v_assignment.rental_id;
  new.personnel_id := v_assignment.personnel_id;

  perform public.assert_rental_is_service_project(new.rental_id);

  new.source := coalesce(new.source, 'manual');
  new.item_type := coalesce(new.item_type, 'adjustment');
  new.quantity := greatest(coalesce(new.quantity, 0), 0);
  new.unit_amount := greatest(coalesce(new.unit_amount, 0), 0);
  new.currency := upper(coalesce(nullif(trim(coalesce(new.currency, '')), ''), 'EUR'));

  if new.amount is null or new.item_type <> 'adjustment' then
    new.amount := round((new.quantity * new.unit_amount)::numeric, 2);
  else
    new.amount := greatest(new.amount, 0);
  end if;

  if new.item_type = 'expense' then
    new.is_expense := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_rental_crew_pay_item_consistency on public.rental_crew_pay_items;
create trigger trg_enforce_rental_crew_pay_item_consistency
before insert or update on public.rental_crew_pay_items
for each row
execute function public.enforce_rental_crew_pay_item_consistency();

create or replace function public.recompute_rental_crew_assignment_expected(p_assignment_id uuid)
returns void
language plpgsql
as $$
declare
  v_assignment public.rental_crew_assignments%rowtype;
  v_profile public.personnel_compensation_profiles%rowtype;
  v_hours numeric(12,2) := 0;
  v_days numeric(12,2) := 0;
  v_model text := 'hourly';
  v_hourly numeric(12,2) := 0;
  v_day numeric(12,2) := 0;
  v_cachet numeric(12,2) := 0;
  v_gross numeric(12,2) := 0;
begin
  select *
    into v_assignment
  from public.rental_crew_assignments
  where id = p_assignment_id
  for update;

  if not found then
    return;
  end if;

  v_profile := public.get_personnel_compensation_profile(
    v_assignment.personnel_id,
    coalesce(v_assignment.planned_start_at::date, current_date)
  );

  select coalesce(sum(
      greatest(
        extract(epoch from (s.ends_at - s.starts_at)) / 3600.0
        - (coalesce(s.break_minutes, 0)::numeric / 60.0),
        0
      )
    ), 0)::numeric(12,2)
    into v_hours
  from public.rental_crew_shifts s
  where s.assignment_id = p_assignment_id
    and s.shift_status <> 'cancelled';

  if v_hours <= 0 and v_assignment.planned_start_at is not null and v_assignment.planned_end_at is not null then
    v_hours := greatest(
      extract(epoch from (v_assignment.planned_end_at - v_assignment.planned_start_at)) / 3600.0
      - (coalesce(v_assignment.planned_break_minutes, 0)::numeric / 60.0),
      0
    )::numeric(12,2);
  end if;

  v_days := case
    when v_hours > 0 then ceil(v_hours / 8.0)::numeric(12,2)
    else 0
  end;

  v_model := coalesce(v_assignment.expected_payment_model, v_profile.payment_model, 'hourly');
  v_hourly := coalesce(v_assignment.expected_hourly_rate, v_profile.hourly_rate, 0);
  v_day := coalesce(v_assignment.expected_day_rate, v_profile.day_rate, case when v_hourly > 0 then round(v_hourly * 8, 2) else 0 end);
  v_cachet := coalesce(v_assignment.expected_cachet_rate, v_profile.cachet_rate, case when v_day > 0 then v_day else round(v_hourly * 8, 2) end);

  if v_assignment.assignment_status = 'cancelled' then
    v_hours := 0;
    v_days := 0;
    v_gross := 0;
  else
    v_gross := case
      when v_model = 'cachet' then greatest(v_cachet, 0)
      when v_model = 'daily' then round(greatest(v_days, 0) * greatest(v_day, 0), 2)
      when v_model = 'salary' then round(greatest(v_hours, 0) * greatest(v_hourly, 0), 2)
      when v_model = 'mixed' then round(greatest(v_days, 0) * greatest(v_day, 0), 2)
      else round(greatest(v_hours, 0) * greatest(v_hourly, 0), 2)
    end;
  end if;

  update public.rental_crew_assignments
  set
    expected_payment_model = v_model,
    expected_hourly_rate = case when v_hourly > 0 then v_hourly else expected_hourly_rate end,
    expected_day_rate = case when v_day > 0 then v_day else expected_day_rate end,
    expected_cachet_rate = case when v_cachet > 0 then v_cachet else expected_cachet_rate end,
    expected_hours = greatest(v_hours, 0),
    expected_days = greatest(v_days, 0),
    expected_gross_amount = greatest(v_gross, 0),
    expected_total_cost = greatest(v_gross + coalesce(expected_expenses_amount, 0), 0),
    updated_at = now()
  where id = p_assignment_id;
end;
$$;

create or replace function public.recompute_rental_crew_assignment_actual(p_assignment_id uuid)
returns void
language plpgsql
as $$
declare
  v_hours numeric(12,2) := 0;
  v_gross numeric(12,2) := 0;
  v_expenses numeric(12,2) := 0;
begin
  select coalesce(sum(coalesce(te.worked_minutes, 0)), 0)::numeric / 60.0
    into v_hours
  from public.rental_crew_time_entries te
  where te.assignment_id = p_assignment_id
    and te.entry_status not in ('rejected', 'cancelled');

  select
    coalesce(sum(case when pi.is_expense then 0 else pi.amount end), 0)::numeric(12,2),
    coalesce(sum(case when pi.is_expense then pi.amount else 0 end), 0)::numeric(12,2)
  into
    v_gross,
    v_expenses
  from public.rental_crew_pay_items pi
  where pi.assignment_id = p_assignment_id;

  update public.rental_crew_assignments
  set
    actual_hours = greatest(coalesce(v_hours, 0), 0),
    actual_gross_amount = greatest(coalesce(v_gross, 0), 0),
    actual_expenses_amount = greatest(coalesce(v_expenses, 0), 0),
    actual_total_cost = greatest(coalesce(v_gross, 0) + coalesce(v_expenses, 0), 0),
    updated_at = now()
  where id = p_assignment_id;
end;
$$;

create or replace function public.refresh_rental_crew_assignment_auto_pay(p_assignment_id uuid)
returns void
language plpgsql
as $$
declare
  v_assignment public.rental_crew_assignments%rowtype;
  v_profile public.personnel_compensation_profiles%rowtype;
  v_hours numeric(12,2) := 0;
  v_days numeric(12,2) := 0;
  v_model text := 'hourly';
  v_hourly numeric(12,2) := 0;
  v_day numeric(12,2) := 0;
  v_cachet numeric(12,2) := 0;
begin
  select *
    into v_assignment
  from public.rental_crew_assignments
  where id = p_assignment_id;

  if v_assignment.id is null then
    return;
  end if;

  v_profile := public.get_personnel_compensation_profile(
    v_assignment.personnel_id,
    coalesce(v_assignment.planned_start_at::date, current_date)
  );

  select coalesce(sum(coalesce(te.worked_minutes, 0)), 0)::numeric / 60.0
    into v_hours
  from public.rental_crew_time_entries te
  where te.assignment_id = p_assignment_id
    and te.entry_status in ('submitted', 'approved');

  v_days := case
    when v_hours > 0 then ceil(v_hours / 8.0)::numeric(12,2)
    else 0
  end;

  v_model := coalesce(v_assignment.expected_payment_model, v_profile.payment_model, 'hourly');
  v_hourly := coalesce(v_assignment.expected_hourly_rate, v_profile.hourly_rate, 0);
  v_day := coalesce(v_assignment.expected_day_rate, v_profile.day_rate, case when v_hourly > 0 then round(v_hourly * 8, 2) else 0 end);
  v_cachet := coalesce(v_assignment.expected_cachet_rate, v_profile.cachet_rate, case when v_day > 0 then v_day else round(v_hourly * 8, 2) end);

  delete from public.rental_crew_pay_items
  where assignment_id = p_assignment_id
    and source = 'auto'
    and is_locked = false;

  if v_assignment.assignment_status <> 'cancelled' then
    if v_model = 'cachet' and v_cachet > 0 then
      insert into public.rental_crew_pay_items (
        rental_id,
        assignment_id,
        personnel_id,
        item_type,
        source,
        quantity,
        unit_amount,
        amount,
        currency,
        is_expense,
        notes,
        metadata
      )
      values (
        v_assignment.rental_id,
        p_assignment_id,
        v_assignment.personnel_id,
        'cachet',
        'auto',
        1,
        v_cachet,
        round(v_cachet, 2),
        coalesce(v_profile.currency, 'EUR'),
        false,
        'Cachet auto',
        jsonb_build_object('auto', true)
      );
    elsif v_model = 'daily' and v_day > 0 and v_days > 0 then
      insert into public.rental_crew_pay_items (
        rental_id,
        assignment_id,
        personnel_id,
        item_type,
        source,
        quantity,
        unit_amount,
        amount,
        currency,
        is_expense,
        notes,
        metadata
      )
      values (
        v_assignment.rental_id,
        p_assignment_id,
        v_assignment.personnel_id,
        'daily',
        'auto',
        v_days,
        v_day,
        round(v_days * v_day, 2),
        coalesce(v_profile.currency, 'EUR'),
        false,
        'Forfait jour auto',
        jsonb_build_object('auto', true)
      );
    elsif v_hourly > 0 and v_hours > 0 then
      insert into public.rental_crew_pay_items (
        rental_id,
        assignment_id,
        personnel_id,
        item_type,
        source,
        quantity,
        unit_amount,
        amount,
        currency,
        is_expense,
        notes,
        metadata
      )
      values (
        v_assignment.rental_id,
        p_assignment_id,
        v_assignment.personnel_id,
        'hourly',
        'auto',
        v_hours,
        v_hourly,
        round(v_hours * v_hourly, 2),
        coalesce(v_profile.currency, 'EUR'),
        false,
        'Horaire auto',
        jsonb_build_object('auto', true)
      );
    end if;

    if coalesce(v_profile.meal_allowance, 0) > 0 and v_days > 0 then
      insert into public.rental_crew_pay_items (
        rental_id,
        assignment_id,
        personnel_id,
        item_type,
        source,
        quantity,
        unit_amount,
        amount,
        currency,
        is_expense,
        notes,
        metadata
      )
      values (
        v_assignment.rental_id,
        p_assignment_id,
        v_assignment.personnel_id,
        'meal_allowance',
        'auto',
        v_days,
        v_profile.meal_allowance,
        round(v_days * v_profile.meal_allowance, 2),
        coalesce(v_profile.currency, 'EUR'),
        true,
        'Panier repas auto',
        jsonb_build_object('auto', true)
      );
    end if;

    if coalesce(v_profile.travel_allowance, 0) > 0 and v_days > 0 then
      insert into public.rental_crew_pay_items (
        rental_id,
        assignment_id,
        personnel_id,
        item_type,
        source,
        quantity,
        unit_amount,
        amount,
        currency,
        is_expense,
        notes,
        metadata
      )
      values (
        v_assignment.rental_id,
        p_assignment_id,
        v_assignment.personnel_id,
        'travel_allowance',
        'auto',
        v_days,
        v_profile.travel_allowance,
        round(v_days * v_profile.travel_allowance, 2),
        coalesce(v_profile.currency, 'EUR'),
        true,
        'Prime déplacement auto',
        jsonb_build_object('auto', true)
      );
    end if;

    if coalesce(v_profile.lodging_allowance, 0) > 0 and v_days > 0 then
      insert into public.rental_crew_pay_items (
        rental_id,
        assignment_id,
        personnel_id,
        item_type,
        source,
        quantity,
        unit_amount,
        amount,
        currency,
        is_expense,
        notes,
        metadata
      )
      values (
        v_assignment.rental_id,
        p_assignment_id,
        v_assignment.personnel_id,
        'lodging_allowance',
        'auto',
        v_days,
        v_profile.lodging_allowance,
        round(v_days * v_profile.lodging_allowance, 2),
        coalesce(v_profile.currency, 'EUR'),
        true,
        'Prime hébergement auto',
        jsonb_build_object('auto', true)
      );
    end if;
  end if;

  perform public.recompute_rental_crew_assignment_actual(p_assignment_id);
end;
$$;

create or replace function public.recompute_rental_crew_rental_totals(p_rental_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_count integer := 0;
  v_expected numeric(12,2) := 0;
  v_actual numeric(12,2) := 0;
  v_hours numeric(12,2) := 0;
begin
  select
    count(*)::int,
    coalesce(sum(expected_total_cost), 0)::numeric(12,2),
    coalesce(sum(actual_total_cost), 0)::numeric(12,2),
    coalesce(sum(actual_hours), 0)::numeric(12,2)
  into
    v_count,
    v_expected,
    v_actual,
    v_hours
  from public.rental_crew_assignments
  where rental_id = p_rental_id
    and assignment_status <> 'cancelled';

  return jsonb_build_object(
    'rental_id', p_rental_id,
    'active_assignments', coalesce(v_count, 0),
    'expected_total_cost', coalesce(v_expected, 0),
    'actual_total_cost', coalesce(v_actual, 0),
    'actual_hours', coalesce(v_hours, 0)
  );
end;
$$;

create or replace function public.trg_rental_crew_assignment_post_recompute()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform public.recompute_rental_crew_assignment_expected(new.id);
    perform public.recompute_rental_crew_assignment_actual(new.id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.recompute_rental_crew_assignment_expected(new.id);
    perform public.recompute_rental_crew_assignment_actual(new.id);
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_rental_crew_assignment_post_recompute on public.rental_crew_assignments;
create trigger trg_rental_crew_assignment_post_recompute
after insert or update on public.rental_crew_assignments
for each row
execute function public.trg_rental_crew_assignment_post_recompute();

create or replace function public.trg_rental_crew_shifts_recompute_expected()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform public.recompute_rental_crew_assignment_expected(new.assignment_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.assignment_id is distinct from new.assignment_id then
      perform public.recompute_rental_crew_assignment_expected(old.assignment_id);
    end if;
    perform public.recompute_rental_crew_assignment_expected(new.assignment_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_rental_crew_assignment_expected(old.assignment_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_rental_crew_shifts_recompute_expected on public.rental_crew_shifts;
create trigger trg_rental_crew_shifts_recompute_expected
after insert or update or delete on public.rental_crew_shifts
for each row
execute function public.trg_rental_crew_shifts_recompute_expected();

create or replace function public.trg_rental_crew_time_entries_refresh_payroll()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform public.refresh_rental_crew_assignment_auto_pay(new.assignment_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.assignment_id is distinct from new.assignment_id then
      perform public.refresh_rental_crew_assignment_auto_pay(old.assignment_id);
    end if;
    perform public.refresh_rental_crew_assignment_auto_pay(new.assignment_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_rental_crew_assignment_auto_pay(old.assignment_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_rental_crew_time_entries_refresh_payroll on public.rental_crew_time_entries;
create trigger trg_rental_crew_time_entries_refresh_payroll
after insert or update or delete on public.rental_crew_time_entries
for each row
execute function public.trg_rental_crew_time_entries_refresh_payroll();

create or replace function public.trg_rental_crew_pay_items_recompute_actual()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    perform public.recompute_rental_crew_assignment_actual(new.assignment_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.assignment_id is distinct from new.assignment_id then
      perform public.recompute_rental_crew_assignment_actual(old.assignment_id);
    end if;
    perform public.recompute_rental_crew_assignment_actual(new.assignment_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_rental_crew_assignment_actual(old.assignment_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_rental_crew_pay_items_recompute_actual on public.rental_crew_pay_items;
create trigger trg_rental_crew_pay_items_recompute_actual
after insert or update or delete on public.rental_crew_pay_items
for each row
execute function public.trg_rental_crew_pay_items_recompute_actual();

-- 7) Legacy synchronization with existing app flows
create or replace function public.trg_sync_rental_affectation_to_crew()
returns trigger
language plpgsql
as $$
declare
  v_rental record;
begin
  if tg_op = 'INSERT' then
    select r.id, r.type, r.start_date, r.end_date, r.location
      into v_rental
    from public.rentals r
    where r.id = new.rental_id;

    if v_rental.id is null or v_rental.type <> 'service' then
      return new;
    end if;

    insert into public.rental_crew_assignments (
      rental_id,
      personnel_id,
      assignment_source,
      assignment_status,
      planned_start_at,
      planned_end_at,
      location_override,
      metadata
    )
    values (
      new.rental_id,
      new.personnel_id,
      'rental_affectation_sync',
      'confirmed',
      v_rental.start_date,
      v_rental.end_date,
      v_rental.location,
      jsonb_build_object('synced_from', 'rental_affectation')
    )
    on conflict (rental_id, personnel_id)
    do update set
      assignment_status = 'confirmed',
      cancelled_at = null,
      planned_start_at = coalesce(public.rental_crew_assignments.planned_start_at, excluded.planned_start_at),
      planned_end_at = coalesce(public.rental_crew_assignments.planned_end_at, excluded.planned_end_at),
      location_override = coalesce(public.rental_crew_assignments.location_override, excluded.location_override),
      updated_at = now();

    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.rental_crew_assignments
    set
      assignment_status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      updated_at = now()
    where rental_id = old.rental_id
      and personnel_id = old.personnel_id
      and assignment_status <> 'cancelled';

    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_rental_affectation_to_crew on public.rental_affectation;
create trigger trg_sync_rental_affectation_to_crew
after insert or delete on public.rental_affectation
for each row
execute function public.trg_sync_rental_affectation_to_crew();

create or replace function public.trg_sync_crew_to_rental_affectation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assignment_source <> 'rental_affectation_sync' and new.assignment_status <> 'cancelled' then
      insert into public.rental_affectation (rental_id, personnel_id)
      values (new.rental_id, new.personnel_id)
      on conflict (rental_id, personnel_id) do nothing;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.rental_id is distinct from new.rental_id
       or old.personnel_id is distinct from new.personnel_id
       or old.assignment_status is distinct from new.assignment_status then
      delete from public.rental_affectation
      where rental_id = old.rental_id
        and personnel_id = old.personnel_id;

      if new.assignment_source <> 'rental_affectation_sync' and new.assignment_status <> 'cancelled' then
        insert into public.rental_affectation (rental_id, personnel_id)
        values (new.rental_id, new.personnel_id)
        on conflict (rental_id, personnel_id) do nothing;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.assignment_source <> 'rental_affectation_sync' then
      delete from public.rental_affectation
      where rental_id = old.rental_id
        and personnel_id = old.personnel_id;
    end if;
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_crew_to_rental_affectation on public.rental_crew_assignments;
create trigger trg_sync_crew_to_rental_affectation
after insert or update or delete on public.rental_crew_assignments
for each row
execute function public.trg_sync_crew_to_rental_affectation();

create or replace function public.trg_sync_crew_shift_to_personnel_activity()
returns trigger
language plpgsql
as $$
declare
  v_activity_id uuid;
  v_assignment record;
  v_rental record;
  v_activity_status text;
begin
  if to_regclass('public.personnel_activities') is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    select activity_id
      into v_activity_id
    from public.rental_crew_shift_activity_links
    where shift_id = old.id;

    if v_activity_id is not null then
      delete from public.personnel_activities where id = v_activity_id;
    end if;

    delete from public.rental_crew_shift_activity_links where shift_id = old.id;
    return old;
  end if;

  select
    a.id,
    a.personnel_id,
    a.rental_id,
    a.title as assignment_title,
    r.title as rental_title,
    r.location,
    c.name as client_name
  into v_assignment
  from public.rental_crew_assignments a
  join public.rentals r on r.id = a.rental_id
  left join public.clients c on c.id = r.client_id
  where a.id = new.assignment_id;

  if v_assignment.id is null then
    return new;
  end if;

  v_activity_status := case new.shift_status
    when 'in_progress' then 'in_progress'
    when 'done' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end;

  select activity_id
    into v_activity_id
  from public.rental_crew_shift_activity_links
  where shift_id = new.id;

  if v_activity_id is null then
    insert into public.personnel_activities (
      personnel_id,
      type,
      title,
      description,
      rental_id,
      client_name,
      location,
      start_time,
      end_time,
      status,
      notes,
      equipment_involved
    )
    values (
      v_assignment.personnel_id,
      'service',
      coalesce(nullif(trim(coalesce(new.title, '')), ''), nullif(trim(coalesce(v_assignment.assignment_title, '')), ''), nullif(trim(coalesce(v_assignment.rental_title, '')), ''), 'Prestation'),
      coalesce(new.notes, 'Créneau équipe prestation'),
      v_assignment.rental_id,
      v_assignment.client_name,
      coalesce(new.location, v_assignment.location),
      new.starts_at,
      new.ends_at,
      v_activity_status::public.activity_status,
      new.notes,
      '{}'::text[]
    )
    returning id into v_activity_id;

    insert into public.rental_crew_shift_activity_links (shift_id, activity_id)
    values (new.id, v_activity_id)
    on conflict (shift_id) do update set activity_id = excluded.activity_id;
  else
    update public.personnel_activities
    set
      personnel_id = v_assignment.personnel_id,
      type = 'service',
      title = coalesce(nullif(trim(coalesce(new.title, '')), ''), nullif(trim(coalesce(v_assignment.assignment_title, '')), ''), nullif(trim(coalesce(v_assignment.rental_title, '')), ''), 'Prestation'),
      description = coalesce(new.notes, description),
      rental_id = v_assignment.rental_id,
      client_name = v_assignment.client_name,
      location = coalesce(new.location, v_assignment.location),
      start_time = new.starts_at,
      end_time = new.ends_at,
      status = v_activity_status::public.activity_status,
      notes = new.notes
    where id = v_activity_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_crew_shift_to_personnel_activity on public.rental_crew_shifts;
create trigger trg_sync_crew_shift_to_personnel_activity
after insert or update or delete on public.rental_crew_shifts
for each row
execute function public.trg_sync_crew_shift_to_personnel_activity();

-- 8) RPC helpers
create or replace function public.upsert_rental_crew_assignment(
  p_rental_id uuid,
  p_personnel_id uuid,
  p_crew_role_id uuid default null,
  p_assignment_status text default 'confirmed',
  p_planned_start_at timestamp with time zone default null,
  p_planned_end_at timestamp with time zone default null,
  p_payment_model text default null,
  p_hourly_rate numeric default null,
  p_day_rate numeric default null,
  p_cachet_rate numeric default null,
  p_notes text default null,
  p_updated_by uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_assignment public.rental_crew_assignments%rowtype;
begin
  perform public.assert_rental_is_service_project(p_rental_id);

  insert into public.rental_crew_assignments (
    rental_id,
    personnel_id,
    crew_role_id,
    assignment_status,
    planned_start_at,
    planned_end_at,
    expected_payment_model,
    expected_hourly_rate,
    expected_day_rate,
    expected_cachet_rate,
    notes,
    updated_by
  )
  values (
    p_rental_id,
    p_personnel_id,
    p_crew_role_id,
    coalesce(nullif(trim(coalesce(p_assignment_status, '')), ''), 'confirmed'),
    p_planned_start_at,
    p_planned_end_at,
    p_payment_model,
    p_hourly_rate,
    p_day_rate,
    p_cachet_rate,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_updated_by
  )
  on conflict (rental_id, personnel_id)
  do update set
    crew_role_id = excluded.crew_role_id,
    assignment_status = excluded.assignment_status,
    planned_start_at = coalesce(excluded.planned_start_at, public.rental_crew_assignments.planned_start_at),
    planned_end_at = coalesce(excluded.planned_end_at, public.rental_crew_assignments.planned_end_at),
    expected_payment_model = coalesce(excluded.expected_payment_model, public.rental_crew_assignments.expected_payment_model),
    expected_hourly_rate = coalesce(excluded.expected_hourly_rate, public.rental_crew_assignments.expected_hourly_rate),
    expected_day_rate = coalesce(excluded.expected_day_rate, public.rental_crew_assignments.expected_day_rate),
    expected_cachet_rate = coalesce(excluded.expected_cachet_rate, public.rental_crew_assignments.expected_cachet_rate),
    notes = coalesce(excluded.notes, public.rental_crew_assignments.notes),
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_assignment;

  perform public.recompute_rental_crew_assignment_expected(v_assignment.id);

  select *
    into v_assignment
  from public.rental_crew_assignments
  where id = v_assignment.id;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment.id,
    'rental_id', v_assignment.rental_id,
    'personnel_id', v_assignment.personnel_id,
    'assignment_status', v_assignment.assignment_status,
    'expected_total_cost', v_assignment.expected_total_cost,
    'actual_total_cost', v_assignment.actual_total_cost
  );
end;
$$;

create or replace function public.upsert_rental_crew_shift(
  p_assignment_id uuid,
  p_shift_id uuid default null,
  p_shift_type text default null,
  p_title text default null,
  p_starts_at timestamp with time zone default null,
  p_ends_at timestamp with time zone default null,
  p_break_minutes integer default null,
  p_shift_status text default null,
  p_location text default null,
  p_milestone_id uuid default null,
  p_notes text default null,
  p_metadata jsonb default null
)
returns jsonb
language plpgsql
as $$
declare
  v_shift public.rental_crew_shifts%rowtype;
begin
  if p_shift_id is null then
    insert into public.rental_crew_shifts (
      assignment_id,
      shift_type,
      title,
      starts_at,
      ends_at,
      break_minutes,
      shift_status,
      location,
      milestone_id,
      notes,
      metadata
    )
    values (
      p_assignment_id,
      coalesce(nullif(trim(coalesce(p_shift_type, '')), ''), 'custom'),
      nullif(trim(coalesce(p_title, '')), ''),
      p_starts_at,
      p_ends_at,
      coalesce(p_break_minutes, 0),
      coalesce(nullif(trim(coalesce(p_shift_status, '')), ''), 'planned'),
      nullif(trim(coalesce(p_location, '')), ''),
      p_milestone_id,
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning * into v_shift;
  else
    update public.rental_crew_shifts
    set
      assignment_id = p_assignment_id,
      shift_type = coalesce(nullif(trim(coalesce(p_shift_type, '')), ''), shift_type),
      title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
      starts_at = coalesce(p_starts_at, starts_at),
      ends_at = coalesce(p_ends_at, ends_at),
      break_minutes = coalesce(p_break_minutes, break_minutes),
      shift_status = coalesce(nullif(trim(coalesce(p_shift_status, '')), ''), shift_status),
      location = coalesce(nullif(trim(coalesce(p_location, '')), ''), location),
      milestone_id = coalesce(p_milestone_id, milestone_id),
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      metadata = coalesce(p_metadata, metadata),
      updated_at = now()
    where id = p_shift_id
    returning * into v_shift;

    if v_shift.id is null then
      raise exception 'Shift % not found', p_shift_id;
    end if;
  end if;

  perform public.recompute_rental_crew_assignment_expected(v_shift.assignment_id);

  return jsonb_build_object(
    'ok', true,
    'shift_id', v_shift.id,
    'assignment_id', v_shift.assignment_id,
    'rental_id', v_shift.rental_id,
    'personnel_id', v_shift.personnel_id,
    'starts_at', v_shift.starts_at,
    'ends_at', v_shift.ends_at,
    'shift_status', v_shift.shift_status
  );
end;
$$;

create or replace function public.register_rental_crew_time_entry(
  p_assignment_id uuid,
  p_shift_id uuid default null,
  p_started_at timestamp with time zone default null,
  p_ended_at timestamp with time zone default null,
  p_break_minutes integer default 0,
  p_entry_status text default 'submitted',
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_entry public.rental_crew_time_entries%rowtype;
begin
  insert into public.rental_crew_time_entries (
    assignment_id,
    shift_id,
    started_at,
    ended_at,
    break_minutes,
    entry_status,
    notes,
    metadata
  )
  values (
    p_assignment_id,
    p_shift_id,
    p_started_at,
    p_ended_at,
    coalesce(p_break_minutes, 0),
    coalesce(nullif(trim(coalesce(p_entry_status, '')), ''), 'submitted'),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_entry;

  perform public.refresh_rental_crew_assignment_auto_pay(v_entry.assignment_id);

  return jsonb_build_object(
    'ok', true,
    'time_entry_id', v_entry.id,
    'assignment_id', v_entry.assignment_id,
    'worked_minutes', v_entry.worked_minutes,
    'entry_status', v_entry.entry_status
  );
end;
$$;

create or replace function public.approve_rental_crew_time_entry(
  p_time_entry_id uuid,
  p_approved_by uuid default null,
  p_approved boolean default true,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_entry public.rental_crew_time_entries%rowtype;
begin
  update public.rental_crew_time_entries
  set
    entry_status = case when coalesce(p_approved, true) then 'approved' else 'rejected' end,
    approved_by = case when coalesce(p_approved, true) then p_approved_by else null end,
    approved_at = case when coalesce(p_approved, true) then now() else null end,
    rejection_reason = case when coalesce(p_approved, true) then null else nullif(trim(coalesce(p_rejection_reason, '')), '') end,
    updated_at = now()
  where id = p_time_entry_id
  returning * into v_entry;

  if v_entry.id is null then
    raise exception 'Time entry % not found', p_time_entry_id;
  end if;

  perform public.refresh_rental_crew_assignment_auto_pay(v_entry.assignment_id);

  return jsonb_build_object(
    'ok', true,
    'time_entry_id', v_entry.id,
    'assignment_id', v_entry.assignment_id,
    'entry_status', v_entry.entry_status
  );
end;
$$;

-- 9) Extend the existing personnel view before crew reporting views consume it
create or replace view public.personnel as
select
  u.id,
  split_part(coalesce(u.full_name, ''), ' ', 1) as first_name,
  trim(both from substr(coalesce(u.full_name, ''), length(split_part(coalesce(u.full_name, ''), ' ', 1)) + 1)) as last_name,
  u.email,
  coalesce(prof.phone, '') as phone,
  coalesce(hr.role, 'manager') as role,
  coalesce(hr.status, 'active') as status,
  coalesce(hr.hire_date, now()::date) as hire_date,
  coalesce(hr.salary, 0::numeric) as salary,
  u.avatar_url,
  coalesce(hr.address, '') as address,
  coalesce(hr.emergency_contact, jsonb_build_object('name', '', 'phone', '', 'relationship', '')) as emergency_contact,
  coalesce(hr.skills, '{}'::text[]) as skills,
  coalesce(hr.certifications, '{}'::text[]) as certifications,
  u.created_at,
  coalesce(hr.employment_type, 'employee') as employment_type,
  coalesce(hr.payment_model, 'salary') as payment_model,
  hr.default_hourly_rate,
  hr.default_day_rate,
  hr.default_cachet_rate,
  hr.contract_start_date,
  hr.contract_end_date,
  hr.legal_identifier,
  hr.school_name,
  hr.payroll_notes
from public.app_users u
left join public.app_user_profiles prof on prof.user_id = u.id
left join public.app_user_hr hr on hr.user_id = u.id;

-- 10) Reporting views
create or replace view public.rental_crew_assignment_overview as
with shift_agg as (
  select
    s.assignment_id,
    count(*)::int as shift_count,
    coalesce(sum(greatest(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0 - (coalesce(s.break_minutes, 0)::numeric / 60.0), 0)), 0)::numeric(12,2) as planned_shift_hours
  from public.rental_crew_shifts s
  where s.shift_status <> 'cancelled'
  group by s.assignment_id
),
time_agg as (
  select
    te.assignment_id,
    coalesce(sum(te.worked_minutes), 0)::numeric / 60.0 as time_entry_hours
  from public.rental_crew_time_entries te
  where te.entry_status not in ('rejected', 'cancelled')
  group by te.assignment_id
)
select
  a.id as assignment_id,
  a.rental_id,
  r.reference_code,
  r.title as rental_title,
  r.start_date as rental_start_date,
  r.end_date as rental_end_date,
  r.status as rental_status,
  a.personnel_id,
  p.first_name,
  p.last_name,
  p.email,
  p.role as personnel_role,
  p.status as personnel_status,
  p.employment_type,
  p.payment_model as personnel_payment_model,
  a.crew_role_id,
  rr.code as crew_role_code,
  rr.name as crew_role_name,
  a.assignment_source,
  a.assignment_status,
  a.planned_start_at,
  a.planned_end_at,
  a.call_time,
  a.wrap_time,
  a.location_override,
  a.expected_payment_model,
  a.expected_hourly_rate,
  a.expected_day_rate,
  a.expected_cachet_rate,
  a.expected_hours,
  a.expected_days,
  a.expected_gross_amount,
  a.expected_expenses_amount,
  a.expected_total_cost,
  a.actual_hours,
  a.actual_gross_amount,
  a.actual_expenses_amount,
  a.actual_total_cost,
  coalesce(sa.shift_count, 0)::int as shift_count,
  coalesce(sa.planned_shift_hours, 0)::numeric(12,2) as planned_shift_hours,
  coalesce(ta.time_entry_hours, 0)::numeric(12,2) as time_entry_hours,
  a.notes,
  a.metadata,
  a.created_at,
  a.updated_at
from public.rental_crew_assignments a
join public.rentals r on r.id = a.rental_id
left join public.personnel p on p.id = a.personnel_id
left join public.rental_crew_roles rr on rr.id = a.crew_role_id
left join shift_agg sa on sa.assignment_id = a.id
left join time_agg ta on ta.assignment_id = a.id;

create or replace view public.rental_crew_calendar_view as
select
  s.id as shift_id,
  s.rental_id,
  r.reference_code,
  r.title as rental_title,
  r.status as rental_status,
  s.assignment_id,
  s.personnel_id,
  p.first_name,
  p.last_name,
  p.role as personnel_role,
  p.employment_type,
  a.crew_role_id,
  rr.code as crew_role_code,
  rr.name as crew_role_name,
  s.shift_type,
  s.title,
  s.starts_at,
  s.ends_at,
  s.break_minutes,
  s.shift_status,
  s.location,
  s.milestone_id,
  s.notes,
  s.metadata,
  s.created_at,
  s.updated_at
from public.rental_crew_shifts s
join public.rental_crew_assignments a on a.id = s.assignment_id
join public.rentals r on r.id = s.rental_id
left join public.personnel p on p.id = s.personnel_id
left join public.rental_crew_roles rr on rr.id = a.crew_role_id;

create or replace view public.rental_crew_payroll_overview as
select
  a.rental_id,
  r.reference_code,
  r.title as rental_title,
  r.status as rental_status,
  a.personnel_id,
  p.first_name,
  p.last_name,
  p.employment_type,
  a.assignment_status,
  a.expected_payment_model,
  a.expected_total_cost,
  a.actual_total_cost,
  a.actual_hours,
  coalesce(sum(pi.amount) filter (where pi.is_expense = false), 0)::numeric(12,2) as pay_items_gross,
  coalesce(sum(pi.amount) filter (where pi.is_expense = true), 0)::numeric(12,2) as pay_items_expenses,
  coalesce(sum(pi.amount), 0)::numeric(12,2) as pay_items_total,
  count(pi.id)::int as pay_item_count
from public.rental_crew_assignments a
join public.rentals r on r.id = a.rental_id
left join public.personnel p on p.id = a.personnel_id
left join public.rental_crew_pay_items pi on pi.assignment_id = a.id
group by
  a.rental_id,
  r.reference_code,
  r.title,
  r.status,
  a.personnel_id,
  p.first_name,
  p.last_name,
  p.employment_type,
  a.assignment_status,
  a.expected_payment_model,
  a.expected_total_cost,
  a.actual_total_cost,
  a.actual_hours;

create or replace view public.rental_crew_role_staffing_overview as
with assigned as (
  select
    a.rental_id,
    a.crew_role_id,
    count(*) filter (where a.assignment_status <> 'cancelled')::int as assigned_headcount
  from public.rental_crew_assignments a
  where a.crew_role_id is not null
  group by a.rental_id, a.crew_role_id
)
select
  req.id as requirement_id,
  req.rental_id,
  r.reference_code,
  r.title as rental_title,
  req.crew_role_id,
  rr.code as crew_role_code,
  rr.name as crew_role_name,
  req.required_headcount,
  coalesce(asg.assigned_headcount, 0)::int as assigned_headcount,
  greatest(req.required_headcount - coalesce(asg.assigned_headcount, 0), 0)::int as shortage,
  req.required_start_at,
  req.required_end_at,
  req.notes,
  req.metadata,
  req.created_at,
  req.updated_at
from public.rental_crew_role_requirements req
join public.rentals r on r.id = req.rental_id
join public.rental_crew_roles rr on rr.id = req.crew_role_id
left join assigned asg
  on asg.rental_id = req.rental_id
 and asg.crew_role_id = req.crew_role_id;

-- 11) Backfill and recompute
insert into public.rental_crew_assignments (
  rental_id,
  personnel_id,
  assignment_source,
  assignment_status,
  planned_start_at,
  planned_end_at,
  location_override,
  metadata
)
select
  ra.rental_id,
  ra.personnel_id,
  'rental_affectation_sync',
  'confirmed',
  r.start_date,
  r.end_date,
  r.location,
  jsonb_build_object('source', 'backfill_rental_affectation')
from public.rental_affectation ra
join public.rentals r on r.id = ra.rental_id and r.type = 'service'
on conflict (rental_id, personnel_id) do nothing;

do $$
declare
  v_assignment_id uuid;
begin
  for v_assignment_id in
    select id
    from public.rental_crew_assignments
  loop
    perform public.recompute_rental_crew_assignment_expected(v_assignment_id);
    perform public.refresh_rental_crew_assignment_auto_pay(v_assignment_id);
  end loop;
end;
$$;

-- 12) RLS / policies / grants (aligned with local permissive setup)
alter table public.personnel_compensation_profiles enable row level security;
alter table public.rental_crew_roles enable row level security;
alter table public.rental_crew_role_requirements enable row level security;
alter table public.rental_crew_assignments enable row level security;
alter table public.rental_crew_shifts enable row level security;
alter table public.rental_crew_shift_activity_links enable row level security;
alter table public.rental_crew_time_entries enable row level security;
alter table public.rental_crew_pay_items enable row level security;

drop policy if exists "Anon full access personnel_compensation_profiles" on public.personnel_compensation_profiles;
create policy "Anon full access personnel_compensation_profiles"
  on public.personnel_compensation_profiles
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_crew_roles" on public.rental_crew_roles;
create policy "Anon full access rental_crew_roles"
  on public.rental_crew_roles
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_crew_role_requirements" on public.rental_crew_role_requirements;
create policy "Anon full access rental_crew_role_requirements"
  on public.rental_crew_role_requirements
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_crew_assignments" on public.rental_crew_assignments;
create policy "Anon full access rental_crew_assignments"
  on public.rental_crew_assignments
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_crew_shifts" on public.rental_crew_shifts;
create policy "Anon full access rental_crew_shifts"
  on public.rental_crew_shifts
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_crew_shift_activity_links" on public.rental_crew_shift_activity_links;
create policy "Anon full access rental_crew_shift_activity_links"
  on public.rental_crew_shift_activity_links
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_crew_time_entries" on public.rental_crew_time_entries;
create policy "Anon full access rental_crew_time_entries"
  on public.rental_crew_time_entries
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_crew_pay_items" on public.rental_crew_pay_items;
create policy "Anon full access rental_crew_pay_items"
  on public.rental_crew_pay_items
  using (true)
  with check (true);

grant all on table public.personnel_compensation_profiles to anon;
grant all on table public.personnel_compensation_profiles to authenticated;
grant all on table public.personnel_compensation_profiles to service_role;

grant all on table public.rental_crew_roles to anon;
grant all on table public.rental_crew_roles to authenticated;
grant all on table public.rental_crew_roles to service_role;

grant all on table public.rental_crew_role_requirements to anon;
grant all on table public.rental_crew_role_requirements to authenticated;
grant all on table public.rental_crew_role_requirements to service_role;

grant all on table public.rental_crew_assignments to anon;
grant all on table public.rental_crew_assignments to authenticated;
grant all on table public.rental_crew_assignments to service_role;

grant all on table public.rental_crew_shifts to anon;
grant all on table public.rental_crew_shifts to authenticated;
grant all on table public.rental_crew_shifts to service_role;

grant all on table public.rental_crew_shift_activity_links to anon;
grant all on table public.rental_crew_shift_activity_links to authenticated;
grant all on table public.rental_crew_shift_activity_links to service_role;

grant all on table public.rental_crew_time_entries to anon;
grant all on table public.rental_crew_time_entries to authenticated;
grant all on table public.rental_crew_time_entries to service_role;

grant all on table public.rental_crew_pay_items to anon;
grant all on table public.rental_crew_pay_items to authenticated;
grant all on table public.rental_crew_pay_items to service_role;

grant select on public.rental_crew_assignment_overview to anon;
grant select on public.rental_crew_assignment_overview to authenticated;
grant select on public.rental_crew_assignment_overview to service_role;

grant select on public.rental_crew_calendar_view to anon;
grant select on public.rental_crew_calendar_view to authenticated;
grant select on public.rental_crew_calendar_view to service_role;

grant select on public.rental_crew_payroll_overview to anon;
grant select on public.rental_crew_payroll_overview to authenticated;
grant select on public.rental_crew_payroll_overview to service_role;

grant select on public.rental_crew_role_staffing_overview to anon;
grant select on public.rental_crew_role_staffing_overview to authenticated;
grant select on public.rental_crew_role_staffing_overview to service_role;

grant execute on function public.assert_rental_is_service_project(uuid) to anon;
grant execute on function public.assert_rental_is_service_project(uuid) to authenticated;
grant execute on function public.assert_rental_is_service_project(uuid) to service_role;

grant execute on function public.get_personnel_compensation_profile(uuid, date) to anon;
grant execute on function public.get_personnel_compensation_profile(uuid, date) to authenticated;
grant execute on function public.get_personnel_compensation_profile(uuid, date) to service_role;

grant execute on function public.recompute_rental_crew_assignment_expected(uuid) to anon;
grant execute on function public.recompute_rental_crew_assignment_expected(uuid) to authenticated;
grant execute on function public.recompute_rental_crew_assignment_expected(uuid) to service_role;

grant execute on function public.recompute_rental_crew_assignment_actual(uuid) to anon;
grant execute on function public.recompute_rental_crew_assignment_actual(uuid) to authenticated;
grant execute on function public.recompute_rental_crew_assignment_actual(uuid) to service_role;

grant execute on function public.refresh_rental_crew_assignment_auto_pay(uuid) to anon;
grant execute on function public.refresh_rental_crew_assignment_auto_pay(uuid) to authenticated;
grant execute on function public.refresh_rental_crew_assignment_auto_pay(uuid) to service_role;

grant execute on function public.recompute_rental_crew_rental_totals(uuid) to anon;
grant execute on function public.recompute_rental_crew_rental_totals(uuid) to authenticated;
grant execute on function public.recompute_rental_crew_rental_totals(uuid) to service_role;

grant execute on function public.upsert_rental_crew_assignment(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, text, numeric, numeric, numeric, text, uuid) to anon;
grant execute on function public.upsert_rental_crew_assignment(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, text, numeric, numeric, numeric, text, uuid) to authenticated;
grant execute on function public.upsert_rental_crew_assignment(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, text, numeric, numeric, numeric, text, uuid) to service_role;

grant execute on function public.upsert_rental_crew_shift(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, integer, text, text, uuid, text, jsonb) to anon;
grant execute on function public.upsert_rental_crew_shift(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, integer, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.upsert_rental_crew_shift(uuid, uuid, text, text, timestamp with time zone, timestamp with time zone, integer, text, text, uuid, text, jsonb) to service_role;

grant execute on function public.register_rental_crew_time_entry(uuid, uuid, timestamp with time zone, timestamp with time zone, integer, text, text, jsonb) to anon;
grant execute on function public.register_rental_crew_time_entry(uuid, uuid, timestamp with time zone, timestamp with time zone, integer, text, text, jsonb) to authenticated;
grant execute on function public.register_rental_crew_time_entry(uuid, uuid, timestamp with time zone, timestamp with time zone, integer, text, text, jsonb) to service_role;

grant execute on function public.approve_rental_crew_time_entry(uuid, uuid, boolean, text) to anon;
grant execute on function public.approve_rental_crew_time_entry(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.approve_rental_crew_time_entry(uuid, uuid, boolean, text) to service_role;
