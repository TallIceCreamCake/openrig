-- Real-time unit availability engine + serial maintenance + reporting + automated alerts

-- 1) Equipment-level thresholds used by reporting/alerts
alter table public.equipment
  add column if not exists critical_stock_threshold integer not null default 0;

-- 2) Detailed maintenance records at unit/serial level
create table if not exists public.equipment_unit_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  equipment_unit_id uuid references public.equipment_units(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  serial_number text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  maintenance_type text not null default 'corrective' check (maintenance_type in (
    'preventive',
    'corrective',
    'inspection',
    'repair',
    'calibration',
    'other'
  )),
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  issue_description text,
  root_cause text,
  action_taken text,
  due_at timestamp with time zone,
  started_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  downtime_minutes integer not null default 0,
  cost_labor numeric(12,2) not null default 0,
  cost_parts numeric(12,2) not null default 0,
  cost_external numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  legacy_maintenance_id uuid,
  legacy_task_id uuid references public.maintenance_tasks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists idx_eumr_legacy_maintenance_unique
  on public.equipment_unit_maintenance_records (legacy_maintenance_id)
  where legacy_maintenance_id is not null;

create index if not exists idx_eumr_unit_started_at
  on public.equipment_unit_maintenance_records (equipment_unit_id, started_at desc);

create index if not exists idx_eumr_equipment_started_at
  on public.equipment_unit_maintenance_records (equipment_id, started_at desc);

create index if not exists idx_eumr_status_due_at
  on public.equipment_unit_maintenance_records (status, due_at);

create or replace function public.touch_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_eumr_touch_updated_at on public.equipment_unit_maintenance_records;
create trigger trg_eumr_touch_updated_at
before update on public.equipment_unit_maintenance_records
for each row
execute function public.touch_updated_at_column();

-- 3) Unified maintenance history (new records + legacy fallback)
create or replace view public.equipment_unit_maintenance_history as
select
  r.id,
  'enhanced'::text as source,
  r.equipment_unit_id,
  r.equipment_id,
  r.serial_number,
  r.warehouse_id,
  r.maintenance_type,
  r.status,
  r.issue_description,
  r.root_cause,
  r.action_taken,
  r.due_at,
  r.started_at,
  r.completed_at,
  r.downtime_minutes,
  (coalesce(r.cost_labor, 0) + coalesce(r.cost_parts, 0) + coalesce(r.cost_external, 0))::numeric(12,2) as total_cost,
  r.currency,
  r.legacy_maintenance_id,
  r.legacy_task_id,
  r.metadata,
  r.created_by,
  r.created_at,
  r.updated_at
from public.equipment_unit_maintenance_records r

union all

select
  em.id,
  'legacy'::text as source,
  u.id as equipment_unit_id,
  em.equipment_id,
  em.serial_number,
  em.warehouse_id,
  case
    when em.maintenance_type = 'SAV' then 'corrective'
    when em.maintenance_type = 'Réparation dépôt' then 'repair'
    else 'other'
  end::text as maintenance_type,
  case
    when em.status = 'open' then 'in_progress'
    when em.status = 'closed' then 'completed'
    else 'scheduled'
  end::text as status,
  mt.description as issue_description,
  null::text as root_cause,
  mt.notes as action_taken,
  mt.scheduled_date as due_at,
  em.created_at as started_at,
  em.completed_at,
  greatest(
    0,
    floor(
      extract(epoch from coalesce(em.completed_at, now()) - em.created_at) / 60
    )::int
  ) as downtime_minutes,
  coalesce(mt.cost, 0)::numeric(12,2) as total_cost,
  'EUR'::text as currency,
  em.id as legacy_maintenance_id,
  em.task_id as legacy_task_id,
  '{}'::jsonb as metadata,
  null::uuid as created_by,
  em.created_at,
  em.created_at as updated_at
from public.equipment_maintenance em
left join public.maintenance_tasks mt on mt.id = em.task_id
left join public.equipment_units u
  on u.equipment_id = em.equipment_id
 and em.serial_number is not null
 and u.serial_number = em.serial_number
where not exists (
  select 1
  from public.equipment_unit_maintenance_records r
  where r.legacy_maintenance_id = em.id
);

-- 4) Scan errors by unit (preparation + return)
create or replace view public.equipment_unit_scan_errors as
select
  s.id,
  'preparation'::text as scan_stage,
  s.preparation_id as process_id,
  s.rental_id,
  s.equipment_id,
  s.equipment_unit_id,
  s.scanned_code,
  s.scan_result,
  s.error_message,
  s.forced,
  s.counted,
  s.metadata,
  s.scanned_by,
  s.scanned_at
from public.rental_preparation_unit_scans s
where s.equipment_unit_id is not null
  and (s.counted = false or coalesce(s.error_message, '') <> '')

union all

select
  s.id,
  'return'::text as scan_stage,
  s.return_id as process_id,
  s.rental_id,
  s.equipment_id,
  s.equipment_unit_id,
  s.scanned_code,
  s.scan_result,
  s.error_message,
  s.forced,
  s.counted,
  s.metadata,
  s.scanned_by,
  s.scanned_at
from public.rental_return_unit_scans s
where s.equipment_unit_id is not null
  and (s.counted = false or coalesce(s.error_message, '') <> '');

-- 5) Real-time unit operational status
create or replace view public.equipment_unit_operational_status as
with unit_base as (
  select
    u.id as equipment_unit_id,
    u.equipment_id,
    u.serial_number,
    u.status as raw_status,
    u.warehouse_id,
    w.name as warehouse_name
  from public.equipment_units u
  left join public.warehouses w on w.id = u.warehouse_id
),
active_reservations as (
  select
    rur.equipment_unit_id,
    count(*) filter (
      where r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    ) as active_reservation_count,
    bool_or(
      rur.start_date <= now()
      and rur.end_date >= now()
      and r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    ) as has_current_reservation,
    bool_or(
      rur.start_date > now()
      and r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    ) as has_future_reservation,
    max(rur.end_date) filter (
      where r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    ) as current_reservation_end_at,
    (array_agg(r.id order by rur.end_date desc) filter (
      where r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    ))[1] as current_rental_id,
    (array_agg(r.reference_code order by rur.end_date desc) filter (
      where r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    ))[1] as current_rental_reference_code,
    bool_or(
      rur.end_date <= rur.start_date
      or r.id is null
      or r.status in ('cancelled', 'archived')
    ) as has_invalid_reservation
  from public.rental_unit_reservations rur
  left join public.rentals r on r.id = rur.rental_id
  group by rur.equipment_unit_id
),
reservation_conflicts as (
  select
    a.equipment_unit_id,
    count(*)::int as conflict_pairs
  from public.rental_unit_reservations a
  join public.rental_unit_reservations b
    on b.equipment_unit_id = a.equipment_unit_id
   and b.id > a.id
   and a.start_date <= b.end_date
   and a.end_date >= b.start_date
  join public.rentals ar on ar.id = a.rental_id
  join public.rentals br on br.id = b.rental_id
  where ar.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    and br.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
  group by a.equipment_unit_id
),
prep as (
  select
    s.equipment_unit_id,
    s.rental_id,
    max(s.scanned_at) as prepared_at
  from public.rental_preparation_unit_scans s
  where s.counted = true
    and s.equipment_unit_id is not null
  group by s.equipment_unit_id, s.rental_id
),
ret as (
  select
    s.equipment_unit_id,
    s.rental_id,
    max(s.scanned_at) as returned_at
  from public.rental_return_unit_scans s
  where s.counted = true
    and s.equipment_unit_id is not null
  group by s.equipment_unit_id, s.rental_id
),
return_validation as (
  select
    p.equipment_unit_id,
    max(p.prepared_at) as last_prepared_at,
    max(r.returned_at) as last_returned_at,
    bool_or(coalesce(r.returned_at, 'epoch'::timestamptz) < p.prepared_at) as has_unreturned_cycle,
    (array_agg(p.rental_id order by p.prepared_at desc) filter (
      where coalesce(r.returned_at, 'epoch'::timestamptz) < p.prepared_at
    ))[1] as pending_rental_id
  from prep p
  left join ret r
    on r.equipment_unit_id = p.equipment_unit_id
   and r.rental_id = p.rental_id
  group by p.equipment_unit_id
),
pending_rental_meta as (
  select
    rv.equipment_unit_id,
    rv.pending_rental_id,
    r.reference_code as pending_rental_reference_code,
    r.status as pending_rental_status,
    r.end_date as pending_rental_end_at,
    (
      rv.has_unreturned_cycle
      and r.end_date is not null
      and now() > r.end_date
      and r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    ) as delayed_return
  from return_validation rv
  left join public.rentals r on r.id = rv.pending_rental_id
),
legacy_open_maintenance as (
  select
    u.id as equipment_unit_id,
    count(*)::int as open_count
  from public.equipment_units u
  join public.equipment_maintenance em
    on em.equipment_id = u.equipment_id
   and em.status = 'open'
   and em.serial_number is not null
   and em.serial_number = u.serial_number
  group by u.id
),
enhanced_open_maintenance as (
  select
    coalesce(r.equipment_unit_id, u.id) as equipment_unit_id,
    count(*)::int as open_count
  from public.equipment_unit_maintenance_records r
  left join public.equipment_units u
    on r.equipment_unit_id is null
   and r.equipment_id = u.equipment_id
   and r.serial_number is not null
   and r.serial_number = u.serial_number
  where r.status in ('scheduled', 'in_progress')
  group by coalesce(r.equipment_unit_id, u.id)
),
open_maintenance as (
  select
    equipment_unit_id,
    sum(open_count)::int as open_count
  from (
    select * from legacy_open_maintenance
    union all
    select * from enhanced_open_maintenance
  ) x
  where equipment_unit_id is not null
  group by equipment_unit_id
),
scan_error_agg as (
  select
    e.equipment_unit_id,
    count(*)::int as scan_error_count,
    max(e.scanned_at) as last_scan_error_at,
    (array_agg(e.scan_result order by e.scanned_at desc))[1] as last_scan_error_result,
    (array_agg(e.error_message order by e.scanned_at desc))[1] as last_scan_error_message
  from public.equipment_unit_scan_errors e
  group by e.equipment_unit_id
)
select
  u.equipment_unit_id,
  u.equipment_id,
  u.serial_number,
  u.warehouse_id,
  u.warehouse_name,
  u.raw_status,
  coalesce(ar.active_reservation_count, 0)::int as active_reservation_count,
  coalesce(ar.has_current_reservation, false) as has_current_reservation,
  coalesce(ar.has_future_reservation, false) as has_future_reservation,
  ar.current_reservation_end_at,
  ar.current_rental_id,
  ar.current_rental_reference_code,
  coalesce(ar.has_invalid_reservation, false) as has_invalid_reservation,
  coalesce(rc.conflict_pairs, 0)::int as reservation_conflict_count,
  coalesce(rv.has_unreturned_cycle, false) as pending_return_validation,
  rv.last_prepared_at,
  rv.last_returned_at,
  prm.pending_rental_id,
  prm.pending_rental_reference_code,
  prm.pending_rental_status,
  prm.pending_rental_end_at,
  coalesce(prm.delayed_return, false) as delayed_return,
  coalesce(om.open_count, 0)::int as open_maintenance_count,
  coalesce(se.scan_error_count, 0)::int as scan_error_count,
  se.last_scan_error_at,
  se.last_scan_error_result,
  se.last_scan_error_message,
  case
    when coalesce(u.raw_status, '') = 'broken' then 'broken'
    when coalesce(om.open_count, 0) > 0 then 'maintenance'
    when coalesce(prm.delayed_return, false) then 'delayed_return'
    when coalesce(rv.has_unreturned_cycle, false) then 'in_rental'
    when coalesce(ar.has_current_reservation, false) then 'in_rental'
    when coalesce(ar.has_future_reservation, false) then 'reserved'
    else 'available'
  end as operational_status
from unit_base u
left join active_reservations ar on ar.equipment_unit_id = u.equipment_unit_id
left join reservation_conflicts rc on rc.equipment_unit_id = u.equipment_unit_id
left join return_validation rv on rv.equipment_unit_id = u.equipment_unit_id
left join pending_rental_meta prm on prm.equipment_unit_id = u.equipment_unit_id
left join open_maintenance om on om.equipment_unit_id = u.equipment_unit_id
left join scan_error_agg se on se.equipment_unit_id = u.equipment_unit_id;

create index if not exists idx_rental_unit_reservations_unit_dates
  on public.rental_unit_reservations (equipment_unit_id, start_date, end_date);

-- 6) Sync physical unit status from operational status
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
        when os.operational_status = 'maintenance' then 'maintenance'
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

create or replace function public.sync_unit_maintenance_record_from_legacy()
returns trigger
language plpgsql
as $$
declare
  v_unit_id uuid;
  v_type text;
  v_status text;
  v_issue text;
  v_notes text;
  v_due_at timestamptz;
  v_cost numeric(12,2);
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select id
    into v_unit_id
  from public.equipment_units
  where equipment_id = new.equipment_id
    and (
      (new.serial_number is null and serial_number is null)
      or serial_number = new.serial_number
    )
  order by created_at asc
  limit 1;

  if new.maintenance_type = 'SAV' then
    v_type := 'corrective';
  elsif new.maintenance_type = 'Réparation dépôt' then
    v_type := 'repair';
  else
    v_type := 'other';
  end if;

  if new.status = 'open' then
    v_status := 'in_progress';
  elsif new.status = 'closed' then
    v_status := 'completed';
  else
    v_status := 'scheduled';
  end if;

  if new.task_id is not null then
    select description, notes, scheduled_date, coalesce(cost, 0)::numeric(12,2)
      into v_issue, v_notes, v_due_at, v_cost
    from public.maintenance_tasks
    where id = new.task_id;
  end if;

  insert into public.equipment_unit_maintenance_records (
    equipment_unit_id,
    equipment_id,
    serial_number,
    warehouse_id,
    maintenance_type,
    status,
    issue_description,
    action_taken,
    due_at,
    started_at,
    completed_at,
    downtime_minutes,
    cost_external,
    currency,
    legacy_maintenance_id,
    legacy_task_id,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_unit_id,
    new.equipment_id,
    new.serial_number,
    new.warehouse_id,
    v_type,
    v_status,
    v_issue,
    v_notes,
    v_due_at,
    coalesce(new.created_at, now()),
    new.completed_at,
    greatest(
      0,
      floor(extract(epoch from coalesce(new.completed_at, now()) - coalesce(new.created_at, now())) / 60)::int
    ),
    coalesce(v_cost, 0),
    'EUR',
    new.id,
    new.task_id,
    jsonb_build_object('source', 'legacy_sync'),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (legacy_maintenance_id)
  do update set
    equipment_unit_id = excluded.equipment_unit_id,
    equipment_id = excluded.equipment_id,
    serial_number = excluded.serial_number,
    warehouse_id = excluded.warehouse_id,
    maintenance_type = excluded.maintenance_type,
    status = excluded.status,
    issue_description = excluded.issue_description,
    action_taken = excluded.action_taken,
    due_at = excluded.due_at,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    downtime_minutes = excluded.downtime_minutes,
    cost_external = excluded.cost_external,
    legacy_task_id = excluded.legacy_task_id,
    metadata = excluded.metadata,
    updated_at = now();

  if v_unit_id is not null then
    perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_unit_maintenance_record_from_legacy on public.equipment_maintenance;
create trigger trg_sync_unit_maintenance_record_from_legacy
after insert or update on public.equipment_maintenance
for each row
execute function public.sync_unit_maintenance_record_from_legacy();

create or replace function public.trg_sync_equipment_unit_status_from_scan()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(new.equipment_unit_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.equipment_unit_id is not null and old.equipment_unit_id is distinct from new.equipment_unit_id then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    end if;
    if new.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(new.equipment_unit_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    end if;
    return old;
  end if;

  return null;
end;
$$;

create or replace function public.trg_sync_equipment_unit_status_from_reservation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(new.equipment_unit_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.equipment_unit_id is not null and old.equipment_unit_id is distinct from new.equipment_unit_id then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    end if;
    if new.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(new.equipment_unit_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    end if;
    return old;
  end if;

  return null;
end;
$$;

create or replace function public.trg_sync_equipment_unit_status_from_rental_return()
returns trigger
language plpgsql
as $$
declare
  v_unit_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_unit_id in
      select distinct equipment_unit_id
      from public.rental_unit_reservations
      where rental_id = new.rental_id
        and equipment_unit_id is not null
    loop
      perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
    end loop;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       or new.completed_at is distinct from old.completed_at then
      for v_unit_id in
        (
          select distinct equipment_unit_id
          from public.rental_unit_reservations
          where rental_id = new.rental_id
            and equipment_unit_id is not null
          union
          select distinct equipment_unit_id
          from public.rental_return_unit_scans
          where return_id = new.id
            and equipment_unit_id is not null
        )
      loop
        perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
      end loop;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.trg_sync_equipment_unit_status_from_maintenance_record()
returns trigger
language plpgsql
as $$
declare
  v_unit_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(new.equipment_unit_id);
    elsif new.equipment_id is not null and new.serial_number is not null then
      for v_unit_id in
        select id from public.equipment_units
        where equipment_id = new.equipment_id
          and serial_number = new.serial_number
      loop
        perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
      end loop;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.equipment_unit_id is not null and old.equipment_unit_id is distinct from new.equipment_unit_id then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    end if;

    if new.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(new.equipment_unit_id);
    elsif new.equipment_id is not null and new.serial_number is not null then
      for v_unit_id in
        select id from public.equipment_units
        where equipment_id = new.equipment_id
          and serial_number = new.serial_number
      loop
        perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
      end loop;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.equipment_unit_id is not null then
      perform public.sync_equipment_unit_status_from_live_state(old.equipment_unit_id);
    elsif old.equipment_id is not null and old.serial_number is not null then
      for v_unit_id in
        select id from public.equipment_units
        where equipment_id = old.equipment_id
          and serial_number = old.serial_number
      loop
        perform public.sync_equipment_unit_status_from_live_state(v_unit_id);
      end loop;
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_unit_status_from_preparation_scans on public.rental_preparation_unit_scans;
create trigger trg_sync_unit_status_from_preparation_scans
after insert or update or delete on public.rental_preparation_unit_scans
for each row
execute function public.trg_sync_equipment_unit_status_from_scan();

drop trigger if exists trg_sync_unit_status_from_return_scans on public.rental_return_unit_scans;
create trigger trg_sync_unit_status_from_return_scans
after insert or update or delete on public.rental_return_unit_scans
for each row
execute function public.trg_sync_equipment_unit_status_from_scan();

drop trigger if exists trg_sync_unit_status_from_reservations on public.rental_unit_reservations;
create trigger trg_sync_unit_status_from_reservations
after insert or update or delete on public.rental_unit_reservations
for each row
execute function public.trg_sync_equipment_unit_status_from_reservation();

drop trigger if exists trg_sync_unit_status_from_returns on public.rental_returns;
create trigger trg_sync_unit_status_from_returns
after insert or update on public.rental_returns
for each row
execute function public.trg_sync_equipment_unit_status_from_rental_return();

drop trigger if exists trg_sync_unit_status_from_maintenance_records on public.equipment_unit_maintenance_records;
create trigger trg_sync_unit_status_from_maintenance_records
after insert or update or delete on public.equipment_unit_maintenance_records
for each row
execute function public.trg_sync_equipment_unit_status_from_maintenance_record();

-- 7) Availability functions now honor return validation + live operational state
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

create or replace function public.get_equipment_availability(
  p_equipment_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
returns integer
language plpgsql
as $$
declare
  v_category text := null;
  v_series_available int := 0;
  v_stock int := 0;
  v_rented int := 0;
  v_maint int := 0;
begin
  select inventory_category into v_category
  from public.equipment
  where id = p_equipment_id;

  if v_category = 'series' then
    select count(*)::int into v_series_available
    from public.get_available_units(p_equipment_id, p_start, p_end);
    return coalesce(v_series_available, 0);
  end if;

  select coalesce(sum(quantity), 0)::int into v_stock
  from public.equipment_stock
  where equipment_id = p_equipment_id;

  select coalesce(sum(ri.quantity), 0)::int into v_rented
  from public.rental_items ri
  join public.rentals r on r.id = ri.rental_id
  where ri.equipment_id = p_equipment_id
    and r.status in ('pending', 'confirmed', 'preparing', 'in_progress', 'delivered', 'in_return', 'return_delivery', 'paid')
    and r.type <> 'sale'
    and r.start_date <= p_end
    and r.end_date >= p_start;

  select coalesce(count(*), 0)::int into v_maint
  from public.equipment_unit_maintenance_history mh
  where mh.equipment_id = p_equipment_id
    and mh.status in ('scheduled', 'in_progress');

  return greatest(0, v_stock - v_rented - v_maint);
end;
$$;

create or replace function public.get_units_availability_for_equipment(
  p_ids uuid[],
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
returns table(equipment_id uuid, available integer)
language sql
as $$
  select
    e.id as equipment_id,
    public.get_equipment_availability(e.id, p_start, p_end) as available
  from public.equipment e
  where e.id = any(p_ids);
$$;

-- 8) Reporting (direction-level)
create or replace view public.equipment_unit_reporting_kpis as
with prep as (
  select
    s.equipment_unit_id,
    s.rental_id,
    max(s.scanned_at) as prepared_at
  from public.rental_preparation_unit_scans s
  where s.counted = true
    and s.equipment_unit_id is not null
  group by s.equipment_unit_id, s.rental_id
),
ret as (
  select
    s.equipment_unit_id,
    s.rental_id,
    max(s.scanned_at) as returned_at
  from public.rental_return_unit_scans s
  where s.counted = true
    and s.equipment_unit_id is not null
  group by s.equipment_unit_id, s.rental_id
),
cycles as (
  select
    p.equipment_unit_id,
    p.rental_id,
    p.prepared_at,
    r.returned_at
  from prep p
  left join ret r
    on r.equipment_unit_id = p.equipment_unit_id
   and r.rental_id = p.rental_id
),
cycle_enriched as (
  select
    c.equipment_unit_id,
    c.rental_id,
    c.prepared_at,
    c.returned_at,
    (coalesce(c.returned_at, now()) - c.prepared_at) as active_duration,
    (coalesce(c.returned_at, now()) > rt.end_date and rt.end_date is not null) as delayed_cycle,
    (c.returned_at is not null and rt.end_date is not null and c.returned_at < rt.end_date) as early_return_cycle,
    case
      when ri.quantity is null or ri.quantity <= 0 then 0::numeric
      else (
        (
          coalesce(ri.price_per_day, 0)
          * greatest(
              1,
              ceil(extract(epoch from coalesce(rt.end_date, rt.start_date) - rt.start_date) / 86400.0)::int
            )
          * (1 - (coalesce(ri.discount_percent, 0) / 100.0))
        ) / greatest(ri.quantity, 1)
      )::numeric(12,2)
    end as allocated_revenue
  from cycles c
  left join public.rentals rt on rt.id = c.rental_id
  left join public.equipment_units u on u.id = c.equipment_unit_id
  left join public.rental_items ri
    on ri.rental_id = c.rental_id
   and ri.equipment_id = u.equipment_id
),
cycle_agg as (
  select
    equipment_unit_id,
    count(*)::int as total_cycles,
    count(*) filter (where returned_at is null or returned_at < prepared_at)::int as open_cycles,
    sum(extract(epoch from active_duration) / 3600.0)::numeric(12,2) as utilization_hours,
    count(*) filter (where delayed_cycle)::int as delayed_cycles,
    count(*) filter (where early_return_cycle)::int as early_return_cycles,
    sum(coalesce(allocated_revenue, 0))::numeric(12,2) as estimated_revenue
  from cycle_enriched
  group by equipment_unit_id
),
maintenance_agg as (
  select
    h.equipment_unit_id,
    count(*)::int as maintenance_events,
    count(*) filter (where h.status in ('scheduled', 'in_progress'))::int as open_maintenance_events,
    count(*) filter (where h.maintenance_type in ('corrective', 'repair'))::int as failure_events,
    (sum(coalesce(h.downtime_minutes, 0)) / 60.0)::numeric(12,2) as immobilization_hours,
    sum(coalesce(h.total_cost, 0))::numeric(12,2) as maintenance_cost
  from public.equipment_unit_maintenance_history h
  group by h.equipment_unit_id
),
scan_error_agg as (
  select
    e.equipment_unit_id,
    count(*)::int as scan_error_count
  from public.equipment_unit_scan_errors e
  group by e.equipment_unit_id
),
unit_counts as (
  select equipment_id, count(*)::int as unit_count
  from public.equipment_units
  group by equipment_id
)
select
  u.id as equipment_unit_id,
  u.equipment_id,
  u.serial_number,
  e.name as equipment_name,
  e.type as equipment_type,
  e.subtype as equipment_subtype,
  coalesce(c.total_cycles, 0)::int as total_cycles,
  coalesce(c.open_cycles, 0)::int as open_cycles,
  coalesce(c.utilization_hours, 0)::numeric(12,2) as utilization_hours,
  round((coalesce(c.utilization_hours, 0) / (24.0 * 30.0))::numeric, 4) as utilization_ratio_30d_estimated,
  coalesce(c.delayed_cycles, 0)::int as delayed_cycles,
  coalesce(c.early_return_cycles, 0)::int as early_return_cycles,
  coalesce(m.maintenance_events, 0)::int as maintenance_events,
  coalesce(m.open_maintenance_events, 0)::int as open_maintenance_events,
  coalesce(m.failure_events, 0)::int as failure_events,
  coalesce(m.immobilization_hours, 0)::numeric(12,2) as immobilization_hours,
  coalesce(m.maintenance_cost, 0)::numeric(12,2) as maintenance_cost,
  coalesce(c.estimated_revenue, 0)::numeric(12,2) as estimated_revenue,
  case
    when coalesce(uc.unit_count, 0) > 0 then (coalesce(e.purchase_price, 0)::numeric / uc.unit_count::numeric)::numeric(12,2)
    else coalesce(e.purchase_price, 0)::numeric(12,2)
  end as allocated_purchase_cost,
  (
    coalesce(c.estimated_revenue, 0)
    - coalesce(m.maintenance_cost, 0)
    - case
        when coalesce(uc.unit_count, 0) > 0 then (coalesce(e.purchase_price, 0)::numeric / uc.unit_count::numeric)
        else coalesce(e.purchase_price, 0)::numeric
      end
  )::numeric(12,2) as roi_estimated,
  coalesce(se.scan_error_count, 0)::int as scan_error_count
from public.equipment_units u
join public.equipment e on e.id = u.equipment_id
left join cycle_agg c on c.equipment_unit_id = u.id
left join maintenance_agg m on m.equipment_unit_id = u.id
left join scan_error_agg se on se.equipment_unit_id = u.id
left join unit_counts uc on uc.equipment_id = u.equipment_id;

create or replace view public.equipment_reporting_kpis as
select
  k.equipment_id,
  max(k.equipment_name) as equipment_name,
  max(k.equipment_type) as equipment_type,
  max(k.equipment_subtype) as equipment_subtype,
  count(*)::int as unit_count,
  sum(k.total_cycles)::int as total_cycles,
  sum(k.open_cycles)::int as open_cycles,
  sum(k.utilization_hours)::numeric(12,2) as utilization_hours,
  round(avg(k.utilization_ratio_30d_estimated)::numeric, 4) as avg_utilization_ratio_30d_estimated,
  sum(k.delayed_cycles)::int as delayed_cycles,
  sum(k.early_return_cycles)::int as early_return_cycles,
  sum(k.maintenance_events)::int as maintenance_events,
  sum(k.open_maintenance_events)::int as open_maintenance_events,
  sum(k.failure_events)::int as failure_events,
  sum(k.immobilization_hours)::numeric(12,2) as immobilization_hours,
  sum(k.maintenance_cost)::numeric(12,2) as maintenance_cost,
  sum(k.estimated_revenue)::numeric(12,2) as estimated_revenue,
  sum(k.allocated_purchase_cost)::numeric(12,2) as allocated_purchase_cost,
  sum(k.roi_estimated)::numeric(12,2) as roi_estimated,
  sum(k.scan_error_count)::int as scan_error_count
from public.equipment_unit_reporting_kpis k
group by k.equipment_id;

-- 9) Automated operational alerts
create table if not exists public.equipment_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  alert_type text not null check (alert_type in (
    'late_return',
    'maintenance_due',
    'critical_stock',
    'invalid_reservation',
    'reservation_conflict'
  )),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  equipment_id uuid references public.equipment(id) on delete set null,
  equipment_unit_id uuid references public.equipment_units(id) on delete set null,
  rental_id uuid references public.rentals(id) on delete set null,
  title text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'resolved')),
  source text not null default 'automation',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  resolved_at timestamp with time zone
);

create index if not exists idx_eoa_status_created_at
  on public.equipment_operational_alerts (status, created_at desc);

create index if not exists idx_eoa_type_status
  on public.equipment_operational_alerts (alert_type, status);

drop trigger if exists trg_eoa_touch_updated_at on public.equipment_operational_alerts;
create trigger trg_eoa_touch_updated_at
before update on public.equipment_operational_alerts
for each row
execute function public.touch_updated_at_column();

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

create or replace function public.trg_refresh_equipment_operational_alerts()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_equipment_operational_alerts();
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_refresh_alerts_from_prep_scan on public.rental_preparation_unit_scans;
create trigger trg_refresh_alerts_from_prep_scan
after insert or update or delete on public.rental_preparation_unit_scans
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_return_scan on public.rental_return_unit_scans;
create trigger trg_refresh_alerts_from_return_scan
after insert or update or delete on public.rental_return_unit_scans
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_reservations on public.rental_unit_reservations;
create trigger trg_refresh_alerts_from_reservations
after insert or update or delete on public.rental_unit_reservations
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_maintenance_records on public.equipment_unit_maintenance_records;
create trigger trg_refresh_alerts_from_maintenance_records
after insert or update or delete on public.equipment_unit_maintenance_records
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_legacy_maintenance on public.equipment_maintenance;
create trigger trg_refresh_alerts_from_legacy_maintenance
after insert or update or delete on public.equipment_maintenance
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_stock on public.equipment_stock;
create trigger trg_refresh_alerts_from_stock
after insert or update or delete on public.equipment_stock
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_equipment on public.equipment;
create trigger trg_refresh_alerts_from_equipment
after insert or update on public.equipment
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

drop trigger if exists trg_refresh_alerts_from_rentals on public.rentals;
create trigger trg_refresh_alerts_from_rentals
after insert or update on public.rentals
for each statement
execute function public.trg_refresh_equipment_operational_alerts();

-- 10) One-shot backfill from legacy maintenance + initial recompute
insert into public.equipment_unit_maintenance_records (
  equipment_unit_id,
  equipment_id,
  serial_number,
  warehouse_id,
  maintenance_type,
  status,
  issue_description,
  action_taken,
  due_at,
  started_at,
  completed_at,
  downtime_minutes,
  cost_external,
  currency,
  legacy_maintenance_id,
  legacy_task_id,
  metadata,
  created_at,
  updated_at
)
select
  u.id as equipment_unit_id,
  em.equipment_id,
  em.serial_number,
  em.warehouse_id,
  case
    when em.maintenance_type = 'SAV' then 'corrective'
    when em.maintenance_type = 'Réparation dépôt' then 'repair'
    else 'other'
  end::text as maintenance_type,
  case
    when em.status = 'open' then 'in_progress'
    when em.status = 'closed' then 'completed'
    else 'scheduled'
  end::text as status,
  mt.description as issue_description,
  mt.notes as action_taken,
  mt.scheduled_date as due_at,
  em.created_at as started_at,
  em.completed_at,
  greatest(
    0,
    floor(extract(epoch from coalesce(em.completed_at, now()) - em.created_at) / 60)::int
  ) as downtime_minutes,
  coalesce(mt.cost, 0)::numeric(12,2) as cost_external,
  'EUR'::text as currency,
  em.id as legacy_maintenance_id,
  em.task_id as legacy_task_id,
  jsonb_build_object('source', 'legacy_backfill') as metadata,
  em.created_at,
  now() as updated_at
from public.equipment_maintenance em
left join public.maintenance_tasks mt on mt.id = em.task_id
left join public.equipment_units u
  on u.equipment_id = em.equipment_id
 and em.serial_number is not null
 and u.serial_number = em.serial_number
where not exists (
  select 1
  from public.equipment_unit_maintenance_records r
  where r.legacy_maintenance_id = em.id
);

select public.sync_equipment_unit_status_from_live_state(null);
select public.refresh_equipment_operational_alerts();

-- 11) Access policies/grants (aligned with current permissive local setup)
alter table public.equipment_unit_maintenance_records enable row level security;
alter table public.equipment_operational_alerts enable row level security;

drop policy if exists "Anon full access equipment_unit_maintenance_records" on public.equipment_unit_maintenance_records;
create policy "Anon full access equipment_unit_maintenance_records"
  on public.equipment_unit_maintenance_records
  using (true)
  with check (true);

drop policy if exists "Anon full access equipment_operational_alerts" on public.equipment_operational_alerts;
create policy "Anon full access equipment_operational_alerts"
  on public.equipment_operational_alerts
  using (true)
  with check (true);

grant all on table public.equipment_unit_maintenance_records to anon;
grant all on table public.equipment_unit_maintenance_records to authenticated;
grant all on table public.equipment_unit_maintenance_records to service_role;

grant all on table public.equipment_operational_alerts to anon;
grant all on table public.equipment_operational_alerts to authenticated;
grant all on table public.equipment_operational_alerts to service_role;

grant select on public.equipment_unit_maintenance_history to anon;
grant select on public.equipment_unit_maintenance_history to authenticated;
grant select on public.equipment_unit_maintenance_history to service_role;

grant select on public.equipment_unit_scan_errors to anon;
grant select on public.equipment_unit_scan_errors to authenticated;
grant select on public.equipment_unit_scan_errors to service_role;

grant select on public.equipment_unit_operational_status to anon;
grant select on public.equipment_unit_operational_status to authenticated;
grant select on public.equipment_unit_operational_status to service_role;

grant select on public.equipment_unit_reporting_kpis to anon;
grant select on public.equipment_unit_reporting_kpis to authenticated;
grant select on public.equipment_unit_reporting_kpis to service_role;

grant select on public.equipment_reporting_kpis to anon;
grant select on public.equipment_reporting_kpis to authenticated;
grant select on public.equipment_reporting_kpis to service_role;

grant execute on function public.sync_equipment_unit_status_from_live_state(uuid) to anon;
grant execute on function public.sync_equipment_unit_status_from_live_state(uuid) to authenticated;
grant execute on function public.sync_equipment_unit_status_from_live_state(uuid) to service_role;

grant execute on function public.refresh_equipment_operational_alerts() to anon;
grant execute on function public.refresh_equipment_operational_alerts() to authenticated;
grant execute on function public.refresh_equipment_operational_alerts() to service_role;
