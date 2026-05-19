-- Precise unit-level QR tracking for serial-tracked equipment

-- 1) Extend equipment_units with unit-level QR data
alter table public.equipment_units
  add column if not exists qr_code_value text,
  add column if not exists qr_code_url text,
  add column if not exists qr_code_generated_at timestamp with time zone;

create or replace function public.build_equipment_unit_qr_value(p_unit_id uuid)
returns text
language sql
immutable
as $$
  select 'equipment_unit:' || p_unit_id::text;
$$;

create or replace function public.build_equipment_unit_qr_url(p_payload text)
returns text
language sql
immutable
as $$
  select 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' || replace(coalesce(p_payload, ''), ':', '%3A');
$$;

create or replace function public.ensure_equipment_unit_qr_fields()
returns trigger
language plpgsql
as $$
declare
  v_payload text;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  v_payload := coalesce(nullif(new.qr_code_value, ''), public.build_equipment_unit_qr_value(new.id));
  new.qr_code_value := v_payload;

  if tg_op = 'INSERT' then
    if coalesce(new.qr_code_url, '') = '' then
      new.qr_code_url := public.build_equipment_unit_qr_url(v_payload);
    end if;
    new.qr_code_generated_at := coalesce(new.qr_code_generated_at, now());
  elsif tg_op = 'UPDATE' then
    if new.qr_code_value is distinct from old.qr_code_value then
      new.qr_code_url := public.build_equipment_unit_qr_url(v_payload);
    elsif coalesce(new.qr_code_url, '') = '' then
      new.qr_code_url := public.build_equipment_unit_qr_url(v_payload);
    end if;

    if new.qr_code_value is distinct from old.qr_code_value
       or new.qr_code_url is distinct from old.qr_code_url
       or new.qr_code_generated_at is null then
      new.qr_code_generated_at := now();
    end if;
  end if;

  return new;
end;
$$;

update public.equipment_units
set qr_code_value = public.build_equipment_unit_qr_value(id)
where coalesce(qr_code_value, '') = '';

update public.equipment_units
set qr_code_url = public.build_equipment_unit_qr_url(qr_code_value)
where coalesce(qr_code_url, '') = '';

update public.equipment_units
set qr_code_generated_at = now()
where qr_code_generated_at is null;

drop trigger if exists trg_equipment_units_qr_fields on public.equipment_units;
create trigger trg_equipment_units_qr_fields
before insert or update on public.equipment_units
for each row
execute function public.ensure_equipment_unit_qr_fields();

create unique index if not exists idx_equipment_units_qr_code_value_unique
  on public.equipment_units (qr_code_value)
  where qr_code_value is not null;

create index if not exists idx_equipment_units_qr_generated_at
  on public.equipment_units (qr_code_generated_at desc);

-- 2) Deep unit logs (mostly internal/audit)
create table if not exists public.equipment_unit_activity_logs (
  id uuid primary key default gen_random_uuid(),
  equipment_unit_id uuid references public.equipment_units(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  rental_id uuid references public.rentals(id) on delete set null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('debug', 'info', 'warning', 'error')),
  source text not null default 'app',
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_eual_unit_created_at
  on public.equipment_unit_activity_logs (equipment_unit_id, created_at desc);
create index if not exists idx_eual_rental_created_at
  on public.equipment_unit_activity_logs (rental_id, created_at desc);
create index if not exists idx_eual_event_type_created_at
  on public.equipment_unit_activity_logs (event_type, created_at desc);

create or replace function public.log_equipment_unit_event(
  p_equipment_unit_id uuid,
  p_equipment_id uuid,
  p_event_type text,
  p_message text,
  p_payload jsonb default '{}'::jsonb,
  p_severity text default 'info',
  p_source text default 'app',
  p_rental_id uuid default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.equipment_unit_activity_logs (
    equipment_unit_id,
    equipment_id,
    rental_id,
    event_type,
    severity,
    source,
    message,
    payload,
    created_by
  )
  values (
    p_equipment_unit_id,
    p_equipment_id,
    p_rental_id,
    coalesce(nullif(p_event_type, ''), 'unit_event'),
    case when p_severity in ('debug', 'info', 'warning', 'error') then p_severity else 'info' end,
    coalesce(nullif(p_source, ''), 'app'),
    coalesce(nullif(p_message, ''), 'Equipment unit event'),
    coalesce(p_payload, '{}'::jsonb),
    p_created_by
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.track_equipment_unit_changes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_equipment_unit_event(
      new.id,
      new.equipment_id,
      'unit_created',
      'Unité créée',
      jsonb_build_object(
        'serial_number', new.serial_number,
        'warehouse_id', new.warehouse_id,
        'status', new.status,
        'qr_code_value', new.qr_code_value
      ),
      'info',
      'db_trigger'
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.serial_number is distinct from old.serial_number then
      perform public.log_equipment_unit_event(
        new.id,
        new.equipment_id,
        'unit_serial_changed',
        'Numéro de suivi modifié',
        jsonb_build_object('from', old.serial_number, 'to', new.serial_number),
        'warning',
        'db_trigger'
      );
    end if;

    if new.warehouse_id is distinct from old.warehouse_id then
      perform public.log_equipment_unit_event(
        new.id,
        new.equipment_id,
        'unit_warehouse_changed',
        'Entrepôt de l''unité modifié',
        jsonb_build_object('from', old.warehouse_id, 'to', new.warehouse_id),
        'info',
        'db_trigger'
      );
    end if;

    if new.status is distinct from old.status then
      perform public.log_equipment_unit_event(
        new.id,
        new.equipment_id,
        'unit_status_changed',
        'Statut de l''unité modifié',
        jsonb_build_object('from', old.status, 'to', new.status),
        'warning',
        'db_trigger'
      );
    end if;

    if new.qr_code_value is distinct from old.qr_code_value then
      perform public.log_equipment_unit_event(
        new.id,
        new.equipment_id,
        'unit_qr_regenerated',
        'QR unitaire régénéré',
        jsonb_build_object('from', old.qr_code_value, 'to', new.qr_code_value),
        'info',
        'db_trigger'
      );
    end if;

    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_track_equipment_unit_changes on public.equipment_units;
create trigger trg_track_equipment_unit_changes
after insert or update on public.equipment_units
for each row
execute function public.track_equipment_unit_changes();

-- 3) Unit scans recorded during preparation
create table if not exists public.rental_preparation_unit_scans (
  id uuid primary key default gen_random_uuid(),
  preparation_id uuid not null references public.rental_preparation(id) on delete cascade,
  preparation_item_id uuid references public.rental_preparation_items(id) on delete set null,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  equipment_unit_id uuid references public.equipment_units(id) on delete set null,
  expected_equipment_id uuid references public.equipment(id) on delete set null,
  scanned_code text not null,
  scan_result text not null check (scan_result in (
    'accepted',
    'duplicate',
    'wrong_equipment',
    'wrong_code_type',
    'unknown_code',
    'already_completed',
    'forced_accept'
  )),
  error_message text,
  forced boolean not null default false,
  counted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  scanned_by uuid,
  scanned_at timestamp with time zone not null default now()
);

create index if not exists idx_rpus_preparation_scanned_at
  on public.rental_preparation_unit_scans (preparation_id, scanned_at desc);
create index if not exists idx_rpus_rental_scanned_at
  on public.rental_preparation_unit_scans (rental_id, scanned_at desc);
create index if not exists idx_rpus_unit_scanned_at
  on public.rental_preparation_unit_scans (equipment_unit_id, scanned_at desc);
create unique index if not exists idx_rpus_unique_counted_per_unit
  on public.rental_preparation_unit_scans (preparation_id, equipment_unit_id)
  where counted = true and equipment_unit_id is not null;

-- 4) Unit scans recorded during return
create table if not exists public.rental_return_unit_scans (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.rental_returns(id) on delete cascade,
  return_item_id uuid references public.rental_return_items(id) on delete set null,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  equipment_unit_id uuid references public.equipment_units(id) on delete set null,
  expected_equipment_id uuid references public.equipment(id) on delete set null,
  scanned_code text not null,
  scan_result text not null check (scan_result in (
    'accepted',
    'duplicate',
    'wrong_equipment',
    'wrong_code_type',
    'unknown_code',
    'already_returned',
    'not_prepared',
    'forced_accept'
  )),
  error_message text,
  forced boolean not null default false,
  counted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  scanned_by uuid,
  scanned_at timestamp with time zone not null default now()
);

create index if not exists idx_rrus_return_scanned_at
  on public.rental_return_unit_scans (return_id, scanned_at desc);
create index if not exists idx_rrus_rental_scanned_at
  on public.rental_return_unit_scans (rental_id, scanned_at desc);
create index if not exists idx_rrus_unit_scanned_at
  on public.rental_return_unit_scans (equipment_unit_id, scanned_at desc);
create unique index if not exists idx_rrus_unique_counted_per_unit
  on public.rental_return_unit_scans (return_id, equipment_unit_id)
  where counted = true and equipment_unit_id is not null;

-- 5) Unified per-unit prestation history
create or replace view public.equipment_unit_rental_history as
select
  s.equipment_unit_id,
  s.equipment_id,
  s.rental_id,
  r.reference_code,
  r.title as rental_title,
  c.name as client_name,
  'prepared'::text as event_type,
  s.scanned_at as event_at,
  s.scan_result,
  s.forced,
  s.metadata,
  s.id as source_id
from public.rental_preparation_unit_scans s
join public.rentals r on r.id = s.rental_id
left join public.clients c on c.id = r.client_id
where s.counted = true

union all

select
  s.equipment_unit_id,
  s.equipment_id,
  s.rental_id,
  r.reference_code,
  r.title as rental_title,
  c.name as client_name,
  'returned'::text as event_type,
  s.scanned_at as event_at,
  s.scan_result,
  s.forced,
  s.metadata,
  s.id as source_id
from public.rental_return_unit_scans s
join public.rentals r on r.id = s.rental_id
left join public.clients c on c.id = r.client_id
where s.counted = true;

-- 6) Access policies/grants (align with current permissive setup)
alter table public.equipment_unit_activity_logs enable row level security;
alter table public.rental_preparation_unit_scans enable row level security;
alter table public.rental_return_unit_scans enable row level security;

drop policy if exists "Anon full access equipment_unit_activity_logs" on public.equipment_unit_activity_logs;
create policy "Anon full access equipment_unit_activity_logs"
  on public.equipment_unit_activity_logs
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_preparation_unit_scans" on public.rental_preparation_unit_scans;
create policy "Anon full access rental_preparation_unit_scans"
  on public.rental_preparation_unit_scans
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_return_unit_scans" on public.rental_return_unit_scans;
create policy "Anon full access rental_return_unit_scans"
  on public.rental_return_unit_scans
  using (true)
  with check (true);

grant all on table public.equipment_unit_activity_logs to anon;
grant all on table public.equipment_unit_activity_logs to authenticated;
grant all on table public.equipment_unit_activity_logs to service_role;

grant all on table public.rental_preparation_unit_scans to anon;
grant all on table public.rental_preparation_unit_scans to authenticated;
grant all on table public.rental_preparation_unit_scans to service_role;

grant all on table public.rental_return_unit_scans to anon;
grant all on table public.rental_return_unit_scans to authenticated;
grant all on table public.rental_return_unit_scans to service_role;

grant select on public.equipment_unit_rental_history to anon;
grant select on public.equipment_unit_rental_history to authenticated;
grant select on public.equipment_unit_rental_history to service_role;

grant execute on function public.log_equipment_unit_event(uuid, uuid, text, text, jsonb, text, text, uuid, uuid) to anon;
grant execute on function public.log_equipment_unit_event(uuid, uuid, text, text, jsonb, text, text, uuid, uuid) to authenticated;
grant execute on function public.log_equipment_unit_event(uuid, uuid, text, text, jsonb, text, text, uuid, uuid) to service_role;
