-- Compliance/certifications management + what-if availability simulation

-- 1) Compliance requirement catalog
create table if not exists public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  default_validity_days integer not null default 365,
  blocking_on_expiry boolean not null default true,
  document_required boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

drop trigger if exists trg_compliance_requirements_touch_updated_at on public.compliance_requirements;
create trigger trg_compliance_requirements_touch_updated_at
before update on public.compliance_requirements
for each row
execute function public.touch_updated_at_column();

insert into public.compliance_requirements (
  code,
  name,
  description,
  default_validity_days,
  blocking_on_expiry,
  document_required
)
values
  ('vgp', 'VGP', 'Vérification Générale Périodique', 365, true, true),
  ('calibration', 'Calibration', 'Calibration périodique selon fabricant', 365, true, true),
  ('mandatory_document', 'Document obligatoire', 'Document administratif obligatoire', 365, true, true)
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description,
  default_validity_days = excluded.default_validity_days,
  blocking_on_expiry = excluded.blocking_on_expiry,
  document_required = excluded.document_required,
  updated_at = now();

-- 2) Compliance requirements assigned to each equipment
create table if not exists public.equipment_compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  requirement_id uuid not null references public.compliance_requirements(id) on delete cascade,
  is_mandatory boolean not null default true,
  validity_days_override integer,
  warning_days integer not null default 30,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (equipment_id, requirement_id)
);

create index if not exists idx_ecr_equipment_active
  on public.equipment_compliance_requirements (equipment_id, active);

drop trigger if exists trg_equipment_compliance_requirements_touch_updated_at on public.equipment_compliance_requirements;
create trigger trg_equipment_compliance_requirements_touch_updated_at
before update on public.equipment_compliance_requirements
for each row
execute function public.touch_updated_at_column();

-- 3) Compliance records by unit/serial
create table if not exists public.equipment_unit_compliance_records (
  id uuid primary key default gen_random_uuid(),
  equipment_unit_id uuid not null references public.equipment_units(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  requirement_id uuid not null references public.compliance_requirements(id) on delete cascade,
  status text not null default 'valid' check (status in ('valid', 'pending_review', 'rejected', 'waived')),
  issued_at timestamp with time zone,
  expires_at timestamp with time zone,
  checked_by uuid,
  document_url text,
  document_name text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_eucr_unit_requirement_created_at
  on public.equipment_unit_compliance_records (equipment_unit_id, requirement_id, created_at desc);

create index if not exists idx_eucr_equipment_requirement_created_at
  on public.equipment_unit_compliance_records (equipment_id, requirement_id, created_at desc);

create index if not exists idx_eucr_expires_at
  on public.equipment_unit_compliance_records (expires_at);

drop trigger if exists trg_equipment_unit_compliance_records_touch_updated_at on public.equipment_unit_compliance_records;
create trigger trg_equipment_unit_compliance_records_touch_updated_at
before update on public.equipment_unit_compliance_records
for each row
execute function public.touch_updated_at_column();

create or replace function public.ensure_equipment_unit_compliance_record_fields()
returns trigger
language plpgsql
as $$
declare
  v_equipment_id uuid;
  v_validity_days integer;
begin
  select equipment_id into v_equipment_id
  from public.equipment_units
  where id = new.equipment_unit_id;

  if v_equipment_id is not null then
    new.equipment_id := v_equipment_id;
  end if;

  if new.issued_at is not null and new.expires_at is null then
    select coalesce(ecr.validity_days_override, cr.default_validity_days)
      into v_validity_days
    from public.equipment_compliance_requirements ecr
    join public.compliance_requirements cr on cr.id = ecr.requirement_id
    where ecr.equipment_id = new.equipment_id
      and ecr.requirement_id = new.requirement_id
    limit 1;

    if v_validity_days is not null and v_validity_days > 0 then
      new.expires_at := new.issued_at + make_interval(days => v_validity_days);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_equipment_unit_compliance_record_fields on public.equipment_unit_compliance_records;
create trigger trg_ensure_equipment_unit_compliance_record_fields
before insert or update on public.equipment_unit_compliance_records
for each row
execute function public.ensure_equipment_unit_compliance_record_fields();

-- 4) Compliance status per unit + requirement
create or replace view public.equipment_unit_compliance_status as
with units as (
  select
    u.id as equipment_unit_id,
    u.equipment_id,
    u.serial_number,
    u.warehouse_id
  from public.equipment_units u
),
required_rules as (
  select
    ecr.id as equipment_requirement_id,
    ecr.equipment_id,
    ecr.requirement_id,
    ecr.is_mandatory,
    ecr.warning_days,
    ecr.active,
    coalesce(ecr.validity_days_override, cr.default_validity_days) as validity_days,
    cr.code as requirement_code,
    cr.name as requirement_name,
    cr.blocking_on_expiry,
    cr.document_required
  from public.equipment_compliance_requirements ecr
  join public.compliance_requirements cr on cr.id = ecr.requirement_id
  where ecr.active = true
),
latest_records as (
  select distinct on (r.equipment_unit_id, r.requirement_id)
    r.id,
    r.equipment_unit_id,
    r.equipment_id,
    r.requirement_id,
    r.status as record_status,
    r.issued_at,
    r.expires_at,
    r.document_url,
    r.document_name,
    r.notes,
    r.created_at
  from public.equipment_unit_compliance_records r
  order by r.equipment_unit_id, r.requirement_id, coalesce(r.expires_at, r.issued_at, r.created_at) desc, r.created_at desc
)
select
  u.equipment_unit_id,
  u.equipment_id,
  u.serial_number,
  u.warehouse_id,
  rr.equipment_requirement_id,
  rr.requirement_id,
  rr.requirement_code,
  rr.requirement_name,
  rr.is_mandatory,
  rr.warning_days,
  rr.validity_days,
  rr.blocking_on_expiry,
  rr.document_required,
  lr.id as compliance_record_id,
  lr.record_status,
  lr.issued_at,
  lr.expires_at,
  lr.document_url,
  lr.document_name,
  lr.notes,
  case
    when lr.id is null and rr.is_mandatory then 'missing'
    when lr.record_status = 'waived' then 'waived'
    when lr.record_status = 'rejected' then 'rejected'
    when lr.expires_at is not null and lr.expires_at < now() then 'expired'
    when lr.expires_at is not null and lr.expires_at < now() + (rr.warning_days::text || ' days')::interval then 'expiring_soon'
    when lr.record_status = 'pending_review' then 'pending_review'
    when lr.id is null then 'optional_missing'
    else 'valid'
  end as compliance_state,
  case
    when rr.is_mandatory = false then false
    when rr.blocking_on_expiry = false then false
    when lr.record_status = 'waived' then false
    when lr.id is null then true
    when lr.record_status = 'rejected' then true
    when lr.expires_at is not null and lr.expires_at < now() then true
    else false
  end as is_blocking,
  case
    when lr.expires_at is null then null
    else ceil(extract(epoch from (lr.expires_at - now())) / 86400.0)::int
  end as days_until_expiry
from units u
join required_rules rr on rr.equipment_id = u.equipment_id
left join latest_records lr
  on lr.equipment_unit_id = u.equipment_unit_id
 and lr.requirement_id = rr.requirement_id;

create or replace view public.equipment_unit_compliance_overview as
select
  s.equipment_unit_id,
  s.equipment_id,
  max(s.serial_number) as serial_number,
  count(*)::int as total_requirements,
  count(*) filter (where s.compliance_state = 'missing')::int as missing_count,
  count(*) filter (where s.compliance_state = 'expired')::int as expired_count,
  count(*) filter (where s.compliance_state = 'expiring_soon')::int as expiring_soon_count,
  count(*) filter (where s.is_blocking)::int as blocking_requirement_count,
  bool_or(s.is_blocking) as has_compliance_block,
  min(s.expires_at) filter (where s.expires_at is not null) as next_expiry_at
from public.equipment_unit_compliance_status s
group by s.equipment_unit_id, s.equipment_id;

-- 5) Overlay compliance into live operational status
-- Keep current heavy view logic in equipment_unit_operational_status_base and expose a compliance-aware wrapper.
do $$
begin
  if to_regclass('public.equipment_unit_operational_status_base') is null
     and to_regclass('public.equipment_unit_operational_status') is not null then
    execute 'alter view public.equipment_unit_operational_status rename to equipment_unit_operational_status_base';
  end if;
end;
$$;

create or replace view public.equipment_unit_operational_status as
select
  b.equipment_unit_id,
  b.equipment_id,
  b.serial_number,
  b.warehouse_id,
  b.warehouse_name,
  b.raw_status,
  b.active_reservation_count,
  b.has_current_reservation,
  b.has_future_reservation,
  b.current_reservation_end_at,
  b.current_rental_id,
  b.current_rental_reference_code,
  b.has_invalid_reservation,
  b.reservation_conflict_count,
  b.pending_return_validation,
  b.last_prepared_at,
  b.last_returned_at,
  b.pending_rental_id,
  b.pending_rental_reference_code,
  b.pending_rental_status,
  b.pending_rental_end_at,
  b.delayed_return,
  b.open_maintenance_count,
  b.scan_error_count,
  b.last_scan_error_at,
  b.last_scan_error_result,
  b.last_scan_error_message,
  coalesce(c.has_compliance_block, false) as has_compliance_block,
  coalesce(c.blocking_requirement_count, 0)::int as compliance_blocking_requirement_count,
  coalesce(c.expiring_soon_count, 0)::int as compliance_expiring_soon_count,
  c.next_expiry_at as compliance_next_expiry_at,
  case
    when coalesce(b.raw_status, '') = 'broken' then 'broken'
    when coalesce(b.open_maintenance_count, 0) > 0 then 'maintenance'
    when coalesce(c.has_compliance_block, false) then 'compliance_blocked'
    else b.operational_status
  end as operational_status
from public.equipment_unit_operational_status_base b
left join public.equipment_unit_compliance_overview c on c.equipment_unit_id = b.equipment_unit_id;

-- 6) Sync status rules include compliance block
create or replace function public.sync_equipment_unit_status_from_live_state(p_unit_id uuid default null)
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  with targets as (
    select
      u.id,
      case
        when u.status = 'broken' then 'broken'
        when os.operational_status in ('maintenance', 'compliance_blocked') then 'maintenance'
        when os.operational_status in ('in_rental', 'delayed_return') then 'in_use'
        when os.operational_status = 'available' then 'available'
        when os.operational_status = 'reserved' then 'available'
        else coalesce(u.status, 'available')
      end as next_status
    from public.equipment_units u
    left join public.equipment_unit_operational_status os
      on os.equipment_unit_id = u.id
    where p_unit_id is null or u.id = p_unit_id
  ),
  updated as (
    update public.equipment_units u
    set status = t.next_status
    from targets t
    where u.id = t.id
      and u.status is distinct from t.next_status
    returning 1
  )
  select count(*) into v_count from updated;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.trg_sync_equipment_unit_status_from_compliance_record()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(new.equipment_unit_id);
    end if;
    if tg_op = 'UPDATE' and old.equipment_unit_id is not null and old.equipment_unit_id is distinct from new.equipment_unit_id then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    end if;
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.trg_sync_equipment_unit_status_from_compliance_requirement()
returns trigger
language plpgsql
as $$
declare
  v_unit_id uuid;
  v_equipment_id uuid;
begin
  v_equipment_id := coalesce(new.equipment_id, old.equipment_id);
  if v_equipment_id is null then
    return coalesce(new, old);
  end if;

  for v_unit_id in
    select id
    from public.equipment_units
    where equipment_id = v_equipment_id
  loop
    perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
  end loop;

  return coalesce(new, old);
end;
$$;

create or replace function public.trg_sync_equipment_unit_status_from_compliance_catalog()
returns trigger
language plpgsql
as $$
declare
  v_requirement_id uuid;
  v_unit_id uuid;
begin
  v_requirement_id := coalesce(new.id, old.id);
  if v_requirement_id is null then
    return coalesce(new, old);
  end if;

  for v_unit_id in
    select distinct u.id
    from public.equipment_units u
    join public.equipment_compliance_requirements ecr
      on ecr.equipment_id = u.equipment_id
     and ecr.requirement_id = v_requirement_id
  loop
    perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
  end loop;

  return coalesce(new, old);
end;
$$;

create or replace function public.trg_sync_equipment_unit_status_from_unit_insert()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_equipment_unit_status_from_live_state(new.id);
    return new;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_unit_status_from_compliance_records on public.equipment_unit_compliance_records;
create trigger trg_sync_unit_status_from_compliance_records
after insert or update or delete on public.equipment_unit_compliance_records
for each row
execute function public.trg_sync_equipment_unit_status_from_compliance_record();

drop trigger if exists trg_sync_unit_status_from_compliance_requirements on public.equipment_compliance_requirements;
create trigger trg_sync_unit_status_from_compliance_requirements
after insert or update or delete on public.equipment_compliance_requirements
for each row
execute function public.trg_sync_equipment_unit_status_from_compliance_requirement();

drop trigger if exists trg_sync_unit_status_from_compliance_catalog on public.compliance_requirements;
create trigger trg_sync_unit_status_from_compliance_catalog
after insert or update or delete on public.compliance_requirements
for each row
execute function public.trg_sync_equipment_unit_status_from_compliance_catalog();

drop trigger if exists trg_sync_unit_status_from_units_for_compliance on public.equipment_units;
create trigger trg_sync_unit_status_from_units_for_compliance
after insert or update of equipment_id on public.equipment_units
for each row
execute function public.trg_sync_equipment_unit_status_from_unit_insert();

-- 7) Availability helpers must exclude compliance block
create or replace function public.get_available_units(
  p_equipment_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
returns table(unit_id uuid)
language sql
as $$
  select os.equipment_unit_id as unit_id
  from public.equipment_unit_operational_status os
  where os.equipment_id = p_equipment_id
    and os.operational_status = 'available'
    and os.pending_return_validation = false
    and coalesce(os.has_compliance_block, false) = false
    and not exists (
      select 1
      from public.rental_unit_reservations rur
      join public.rentals r on r.id = rur.rental_id
      where rur.equipment_unit_id = os.equipment_unit_id
        and r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
        and rur.start_date <= p_end
        and rur.end_date >= p_start
    )
  order by os.serial_number asc nulls last, os.equipment_unit_id;
$$;

-- 8) What-if simulation RPC for period demand forecasting
create or replace function public.simulate_equipment_availability(
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_demands jsonb default '[]'::jsonb
)
returns table(
  equipment_id uuid,
  equipment_name text,
  inventory_category text,
  requested integer,
  available integer,
  projected_remaining integer,
  projected_shortage integer
)
language sql
as $$
  with demand_rows as (
    select
      (row->>'equipment_id')::uuid as equipment_id,
      greatest(coalesce((row->>'requested_qty')::int, 0), 0)::int as requested_qty
    from jsonb_array_elements(coalesce(p_demands, '[]'::jsonb)) row
    where (row->>'equipment_id') is not null
  ),
  demand_agg as (
    select equipment_id, sum(requested_qty)::int as requested_qty
    from demand_rows
    group by equipment_id
  ),
  calc as (
    select
      e.id as equipment_id,
      e.name as equipment_name,
      e.inventory_category::text as inventory_category,
      coalesce(d.requested_qty, 0)::int as requested,
      public.get_equipment_availability(e.id, p_start, p_end)::int as available
    from demand_agg d
    join public.equipment e on e.id = d.equipment_id
  )
  select
    c.equipment_id,
    c.equipment_name,
    c.inventory_category,
    c.requested,
    c.available,
    greatest(0, c.available - c.requested)::int as projected_remaining,
    greatest(0, c.requested - c.available)::int as projected_shortage
  from calc c
  order by projected_shortage desc, equipment_name asc;
$$;

-- 9) Operational alerts add compliance types (expired + due soon)
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.equipment_operational_alerts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%alert_type%';

  if v_constraint_name is not null then
    execute format('alter table public.equipment_operational_alerts drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table public.equipment_operational_alerts
  add constraint equipment_operational_alerts_alert_type_check
  check (alert_type in (
    'late_return',
    'maintenance_due',
    'critical_stock',
    'invalid_reservation',
    'reservation_conflict',
    'compliance_expired',
    'compliance_due_soon'
  ));

create or replace function public.refresh_equipment_operational_alerts()
returns jsonb
language plpgsql
as $$
declare
  v_total int := 0;
begin
  delete from public.equipment_operational_alerts
  where source = 'automation';

  insert into public.equipment_operational_alerts (
    alert_key,
    alert_type,
    severity,
    equipment_id,
    equipment_unit_id,
    rental_id,
    title,
    message,
    payload
  )
  select
    'late_return:' || os.equipment_unit_id::text || ':' || coalesce(os.pending_rental_id::text, 'none') as alert_key,
    'late_return',
    'critical',
    os.equipment_id,
    os.equipment_unit_id,
    os.pending_rental_id,
    'Retour en retard',
    'Le numéro ' || coalesce(os.serial_number, os.equipment_unit_id::text) || ' est en retard de retour.',
    jsonb_build_object(
      'pending_rental_id', os.pending_rental_id,
      'pending_rental_reference_code', os.pending_rental_reference_code,
      'pending_rental_end_at', os.pending_rental_end_at
    )
  from public.equipment_unit_operational_status os
  where os.delayed_return = true;

  insert into public.equipment_operational_alerts (
    alert_key,
    alert_type,
    severity,
    equipment_id,
    equipment_unit_id,
    title,
    message,
    payload
  )
  select
    'maintenance_due:' || coalesce(r.equipment_unit_id::text, 'none') || ':' || r.id::text as alert_key,
    'maintenance_due',
    'warning',
    r.equipment_id,
    r.equipment_unit_id,
    'Maintenance en retard',
    'Maintenance due dépassée pour le numéro ' || coalesce(r.serial_number, r.equipment_unit_id::text),
    jsonb_build_object(
      'due_at', r.due_at,
      'status', r.status,
      'maintenance_type', r.maintenance_type
    )
  from public.equipment_unit_maintenance_records r
  where r.status in ('scheduled', 'in_progress')
    and r.due_at is not null
    and r.due_at < now();

  insert into public.equipment_operational_alerts (
    alert_key,
    alert_type,
    severity,
    equipment_id,
    title,
    message,
    payload
  )
  select
    'critical_stock:' || e.id::text as alert_key,
    'critical_stock',
    case when available_units = 0 then 'critical' else 'warning' end as severity,
    e.id,
    'Stock critique',
    'Stock série critique pour ' || e.name || ' (' || available_units::text || '/' || e.critical_stock_threshold::text || ').',
    jsonb_build_object(
      'available_units', available_units,
      'critical_stock_threshold', e.critical_stock_threshold
    )
  from (
    select
      e.id,
      e.name,
      e.critical_stock_threshold,
      count(*) filter (where os.operational_status = 'available')::int as available_units
    from public.equipment e
    left join public.equipment_units u on u.equipment_id = e.id
    left join public.equipment_unit_operational_status os on os.equipment_unit_id = u.id
    where e.inventory_category = 'series'
    group by e.id, e.name, e.critical_stock_threshold
  ) e
  where e.critical_stock_threshold > 0
    and e.available_units < e.critical_stock_threshold;

  insert into public.equipment_operational_alerts (
    alert_key,
    alert_type,
    severity,
    equipment_id,
    equipment_unit_id,
    rental_id,
    title,
    message,
    payload
  )
  select
    'invalid_reservation:' || os.equipment_unit_id::text as alert_key,
    'invalid_reservation',
    'warning',
    os.equipment_id,
    os.equipment_unit_id,
    os.current_rental_id,
    'Réservation invalide',
    'Réservation invalide détectée pour le numéro ' || coalesce(os.serial_number, os.equipment_unit_id::text),
    jsonb_build_object(
      'current_rental_id', os.current_rental_id,
      'current_rental_reference_code', os.current_rental_reference_code
    )
  from public.equipment_unit_operational_status os
  where os.has_invalid_reservation = true;

  insert into public.equipment_operational_alerts (
    alert_key,
    alert_type,
    severity,
    equipment_id,
    equipment_unit_id,
    rental_id,
    title,
    message,
    payload
  )
  select
    'reservation_conflict:' || os.equipment_unit_id::text as alert_key,
    'reservation_conflict',
    'critical',
    os.equipment_id,
    os.equipment_unit_id,
    os.current_rental_id,
    'Conflit de réservation',
    'Conflit de réservation détecté pour le numéro ' || coalesce(os.serial_number, os.equipment_unit_id::text),
    jsonb_build_object(
      'reservation_conflict_count', os.reservation_conflict_count,
      'current_rental_id', os.current_rental_id
    )
  from public.equipment_unit_operational_status os
  where os.reservation_conflict_count > 0;

  insert into public.equipment_operational_alerts (
    alert_key,
    alert_type,
    severity,
    equipment_id,
    equipment_unit_id,
    title,
    message,
    payload
  )
  select
    'compliance_expired:' || s.equipment_unit_id::text || ':' || s.requirement_id::text as alert_key,
    'compliance_expired',
    'critical',
    s.equipment_id,
    s.equipment_unit_id,
    'Conformité expirée',
    'Conformité expirée (' || s.requirement_name || ') pour le numéro ' || coalesce(s.serial_number, s.equipment_unit_id::text) || '.',
    jsonb_build_object(
      'requirement_id', s.requirement_id,
      'requirement_code', s.requirement_code,
      'requirement_name', s.requirement_name,
      'expires_at', s.expires_at,
      'compliance_state', s.compliance_state
    )
  from public.equipment_unit_compliance_status s
  where s.compliance_state = 'expired'
    and s.is_blocking = true;

  insert into public.equipment_operational_alerts (
    alert_key,
    alert_type,
    severity,
    equipment_id,
    equipment_unit_id,
    title,
    message,
    payload
  )
  select
    'compliance_due_soon:' || s.equipment_unit_id::text || ':' || s.requirement_id::text as alert_key,
    'compliance_due_soon',
    'warning',
    s.equipment_id,
    s.equipment_unit_id,
    'Conformité à renouveler',
    'Conformité bientôt expirée (' || s.requirement_name || ') pour le numéro ' || coalesce(s.serial_number, s.equipment_unit_id::text) || '.',
    jsonb_build_object(
      'requirement_id', s.requirement_id,
      'requirement_code', s.requirement_code,
      'requirement_name', s.requirement_name,
      'expires_at', s.expires_at,
      'days_until_expiry', s.days_until_expiry,
      'compliance_state', s.compliance_state
    )
  from public.equipment_unit_compliance_status s
  where s.compliance_state = 'expiring_soon'
    and s.is_blocking = true;

  select count(*) into v_total
  from public.equipment_operational_alerts
  where source = 'automation'
    and status = 'active';

  return jsonb_build_object(
    'ok', true,
    'alerts', coalesce(v_total, 0),
    'refreshed_at', now()
  );
end;
$$;

-- 10) Auto refresh alerts on compliance events
drop trigger if exists trg_refresh_alerts_from_compliance_records on public.equipment_unit_compliance_records;
create trigger trg_refresh_alerts_from_compliance_records
after insert or update or delete on public.equipment_unit_compliance_records
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_compliance_requirements on public.equipment_compliance_requirements;
create trigger trg_refresh_alerts_from_compliance_requirements
after insert or update or delete on public.equipment_compliance_requirements
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_compliance_catalog on public.compliance_requirements;
create trigger trg_refresh_alerts_from_compliance_catalog
after insert or update or delete on public.compliance_requirements
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

select public.sync_equipment_unit_status_from_live_state(null);
select public.refresh_equipment_operational_alerts();

-- 11) RLS/policies/grants
alter table public.compliance_requirements enable row level security;
alter table public.equipment_compliance_requirements enable row level security;
alter table public.equipment_unit_compliance_records enable row level security;

drop policy if exists "Anon full access compliance_requirements" on public.compliance_requirements;
create policy "Anon full access compliance_requirements"
  on public.compliance_requirements
  using (true)
  with check (true);

drop policy if exists "Anon full access equipment_compliance_requirements" on public.equipment_compliance_requirements;
create policy "Anon full access equipment_compliance_requirements"
  on public.equipment_compliance_requirements
  using (true)
  with check (true);

drop policy if exists "Anon full access equipment_unit_compliance_records" on public.equipment_unit_compliance_records;
create policy "Anon full access equipment_unit_compliance_records"
  on public.equipment_unit_compliance_records
  using (true)
  with check (true);

grant all on table public.compliance_requirements to anon;
grant all on table public.compliance_requirements to authenticated;
grant all on table public.compliance_requirements to service_role;

grant all on table public.equipment_compliance_requirements to anon;
grant all on table public.equipment_compliance_requirements to authenticated;
grant all on table public.equipment_compliance_requirements to service_role;

grant all on table public.equipment_unit_compliance_records to anon;
grant all on table public.equipment_unit_compliance_records to authenticated;
grant all on table public.equipment_unit_compliance_records to service_role;

grant select on public.equipment_unit_compliance_status to anon;
grant select on public.equipment_unit_compliance_status to authenticated;
grant select on public.equipment_unit_compliance_status to service_role;

grant select on public.equipment_unit_compliance_overview to anon;
grant select on public.equipment_unit_compliance_overview to authenticated;
grant select on public.equipment_unit_compliance_overview to service_role;

grant execute on function public.simulate_equipment_availability(timestamp with time zone, timestamp with time zone, jsonb) to anon;
grant execute on function public.simulate_equipment_availability(timestamp with time zone, timestamp with time zone, jsonb) to authenticated;
grant execute on function public.simulate_equipment_availability(timestamp with time zone, timestamp with time zone, jsonb) to service_role;
