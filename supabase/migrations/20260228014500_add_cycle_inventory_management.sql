-- Complete cycle inventory management
-- - Company cadence settings (cycle period + full inventory frequency)
-- - Inventory count sessions, lines, scans, adjustments
-- - RPC helpers for session creation, counting, scanning, and finalization

-- 1) Company settings for cycle inventory cadence
alter table if exists public.company_settings
  add column if not exists inventory_cycle_period_days integer not null default 30,
  add column if not exists inventory_cycle_full_every integer not null default 6,
  add column if not exists inventory_cycle_anchor_date date not null default current_date;

do $$
begin
  if to_regclass('public.company_settings') is not null then
    alter table public.company_settings
      drop constraint if exists company_settings_inventory_cycle_period_days_check;

    alter table public.company_settings
      add constraint company_settings_inventory_cycle_period_days_check
      check (inventory_cycle_period_days >= 1 and inventory_cycle_period_days <= 3650);

    alter table public.company_settings
      drop constraint if exists company_settings_inventory_cycle_full_every_check;

    alter table public.company_settings
      add constraint company_settings_inventory_cycle_full_every_check
      check (inventory_cycle_full_every >= 1 and inventory_cycle_full_every <= 120);
  end if;
end;
$$;

-- 2) Session and line tables
create table if not exists public.inventory_count_sessions (
  id uuid primary key default gen_random_uuid(),
  session_code text not null unique,
  session_type text not null default 'cycle' check (session_type in ('cycle', 'full')),
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'cancelled')),
  warehouse_id uuid references public.warehouses(id) on delete set null,
  cycle_index integer not null default 0,
  period_start date,
  period_end date,
  expected_lines integer not null default 0,
  counted_lines integer not null default 0,
  expected_quantity integer not null default 0,
  counted_quantity integer not null default 0,
  discrepancy_quantity integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  started_by uuid,
  started_at timestamp with time zone,
  completed_by uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create or replace function public.generate_inventory_count_session_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    v_code := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (
      select 1
      from public.inventory_count_sessions s
      where s.session_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

alter table public.inventory_count_sessions
  alter column session_code set default public.generate_inventory_count_session_code();

update public.inventory_count_sessions
set session_code = public.generate_inventory_count_session_code()
where coalesce(session_code, '') = '';

create index if not exists idx_inventory_count_sessions_status_created_at
  on public.inventory_count_sessions (status, created_at desc);

create index if not exists idx_inventory_count_sessions_warehouse_status
  on public.inventory_count_sessions (warehouse_id, status, created_at desc);

drop trigger if exists trg_inventory_count_sessions_touch_updated_at on public.inventory_count_sessions;
create trigger trg_inventory_count_sessions_touch_updated_at
before update on public.inventory_count_sessions
for each row
execute function public.touch_updated_at_column();

create table if not exists public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.inventory_count_sessions(id) on delete cascade,
  line_type text not null check (line_type in ('stock', 'unit')),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  equipment_unit_id uuid references public.equipment_units(id) on delete cascade,
  expected_warehouse_id uuid references public.warehouses(id) on delete set null,
  counted_warehouse_id uuid references public.warehouses(id) on delete set null,
  serial_number text,
  expected_quantity integer not null default 0,
  counted_quantity integer not null default 0,
  line_status text not null default 'pending' check (line_status in ('pending', 'counted', 'skipped')),
  counted_by uuid,
  counted_at timestamp with time zone,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists idx_inventory_count_lines_unique_unit
  on public.inventory_count_lines (session_id, equipment_unit_id)
  where equipment_unit_id is not null;

create unique index if not exists idx_inventory_count_lines_unique_stock
  on public.inventory_count_lines (session_id, equipment_id, expected_warehouse_id, line_type)
  where equipment_unit_id is null and line_type = 'stock';

create index if not exists idx_inventory_count_lines_session_type
  on public.inventory_count_lines (session_id, line_type, line_status);

create index if not exists idx_inventory_count_lines_equipment
  on public.inventory_count_lines (equipment_id, line_status);

drop trigger if exists trg_inventory_count_lines_touch_updated_at on public.inventory_count_lines;
create trigger trg_inventory_count_lines_touch_updated_at
before update on public.inventory_count_lines
for each row
execute function public.touch_updated_at_column();

create or replace function public.enforce_inventory_count_line_consistency()
returns trigger
language plpgsql
as $$
declare
  v_equipment_id uuid;
  v_serial text;
  v_warehouse_id uuid;
begin
  if new.line_type = 'unit' then
    if new.equipment_unit_id is null then
      raise exception 'equipment_unit_id is required for unit lines';
    end if;

    select u.equipment_id, u.serial_number, u.warehouse_id
      into v_equipment_id, v_serial, v_warehouse_id
    from public.equipment_units u
    where u.id = new.equipment_unit_id;

    if v_equipment_id is null then
      raise exception 'Unknown equipment unit %', new.equipment_unit_id;
    end if;

    new.equipment_id := v_equipment_id;
    new.serial_number := coalesce(new.serial_number, v_serial);
    new.expected_warehouse_id := coalesce(new.expected_warehouse_id, v_warehouse_id);
    new.counted_warehouse_id := coalesce(new.counted_warehouse_id, new.expected_warehouse_id, v_warehouse_id);
    new.expected_quantity := 1;
    new.counted_quantity := least(greatest(coalesce(new.counted_quantity, 0), 0), 1);
  else
    new.equipment_unit_id := null;
    new.serial_number := null;
    new.expected_quantity := greatest(coalesce(new.expected_quantity, 0), 0);
    new.counted_quantity := greatest(coalesce(new.counted_quantity, 0), 0);
    new.counted_warehouse_id := coalesce(new.counted_warehouse_id, new.expected_warehouse_id);
  end if;

  new.line_status := coalesce(new.line_status, 'pending');

  if new.line_status = 'pending' then
    new.counted_at := null;
    new.counted_by := null;
  elsif new.counted_at is null then
    new.counted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_inventory_count_line_consistency on public.inventory_count_lines;
create trigger trg_enforce_inventory_count_line_consistency
before insert or update on public.inventory_count_lines
for each row
execute function public.enforce_inventory_count_line_consistency();

create table if not exists public.inventory_count_unit_scans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.inventory_count_sessions(id) on delete cascade,
  line_id uuid references public.inventory_count_lines(id) on delete set null,
  equipment_unit_id uuid references public.equipment_units(id) on delete set null,
  scanned_code text not null,
  scan_result text not null check (scan_result in ('counted', 'duplicate', 'out_of_scope', 'unknown_code')),
  scanned_by uuid,
  scanned_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_inventory_count_unit_scans_session_scanned_at
  on public.inventory_count_unit_scans (session_id, scanned_at desc);

create index if not exists idx_inventory_count_unit_scans_unit
  on public.inventory_count_unit_scans (equipment_unit_id, scanned_at desc);

create table if not exists public.inventory_count_adjustments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.inventory_count_sessions(id) on delete cascade,
  line_id uuid references public.inventory_count_lines(id) on delete set null,
  adjustment_type text not null check (adjustment_type in ('stock_quantity', 'unit_warehouse')),
  equipment_id uuid references public.equipment(id) on delete set null,
  equipment_unit_id uuid references public.equipment_units(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  from_value text,
  to_value text,
  delta_quantity integer,
  applied_by uuid,
  applied_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_inventory_count_adjustments_session_applied_at
  on public.inventory_count_adjustments (session_id, applied_at desc);

create index if not exists idx_inventory_count_adjustments_type
  on public.inventory_count_adjustments (adjustment_type, applied_at desc);

-- 3) Session totals and lifecycle helpers
create or replace function public.recompute_inventory_count_session_totals(p_session_id uuid)
returns void
language plpgsql
as $$
declare
  v_expected_lines integer := 0;
  v_counted_lines integer := 0;
  v_expected_quantity integer := 0;
  v_counted_quantity integer := 0;
  v_discrepancy integer := 0;
begin
  select
    count(*)::int as expected_lines,
    count(*) filter (where line_status <> 'pending')::int as counted_lines,
    coalesce(sum(expected_quantity), 0)::int as expected_quantity,
    coalesce(sum(counted_quantity), 0)::int as counted_quantity,
    coalesce(sum(counted_quantity - expected_quantity), 0)::int as discrepancy
  into
    v_expected_lines,
    v_counted_lines,
    v_expected_quantity,
    v_counted_quantity,
    v_discrepancy
  from public.inventory_count_lines
  where session_id = p_session_id;

  update public.inventory_count_sessions
  set
    expected_lines = coalesce(v_expected_lines, 0),
    counted_lines = coalesce(v_counted_lines, 0),
    expected_quantity = coalesce(v_expected_quantity, 0),
    counted_quantity = coalesce(v_counted_quantity, 0),
    discrepancy_quantity = coalesce(v_discrepancy, 0),
    updated_at = now()
  where id = p_session_id;
end;
$$;

create or replace function public.trg_recompute_inventory_count_session_totals()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_inventory_count_session_totals(new.session_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.session_id is distinct from new.session_id then
      perform public.recompute_inventory_count_session_totals(old.session_id);
    end if;
    perform public.recompute_inventory_count_session_totals(new.session_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_inventory_count_session_totals(old.session_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recompute_inventory_count_session_totals on public.inventory_count_lines;
create trigger trg_recompute_inventory_count_session_totals
after insert or update or delete on public.inventory_count_lines
for each row
execute function public.trg_recompute_inventory_count_session_totals();

create or replace function public.populate_inventory_count_session_lines(p_session_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_full_every integer := 1;
  v_inserted_stock integer := 0;
  v_inserted_units integer := 0;
begin
  select *
    into v_session
  from public.inventory_count_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Inventory session % not found', p_session_id;
  end if;

  if v_session.status = 'completed' then
    raise exception 'Cannot repopulate lines for completed session %', p_session_id;
  end if;

  if exists (
    select 1
    from public.inventory_count_lines l
    where l.session_id = p_session_id
      and l.line_status <> 'pending'
  ) then
    raise exception 'Cannot repopulate lines: session % already has counted lines', p_session_id;
  end if;

  select greatest(coalesce(cs.inventory_cycle_full_every, 6), 1)
    into v_full_every
  from public.company_settings cs
  where cs.id = 1
  limit 1;

  v_full_every := greatest(coalesce(v_full_every, 1), 1);

  delete from public.inventory_count_lines
  where session_id = p_session_id;

  with scoped_equipment as (
    select e.id, e.inventory_category
    from public.equipment e
    where
      v_session.session_type = 'full'
      or v_full_every <= 1
      or mod(abs((('x' || substr(md5(e.id::text), 1, 16))::bit(64)::bigint)), v_full_every) = mod(v_session.cycle_index, v_full_every)
  ),
  inserted_stock as (
    insert into public.inventory_count_lines (
      session_id,
      line_type,
      equipment_id,
      expected_warehouse_id,
      counted_warehouse_id,
      expected_quantity,
      counted_quantity,
      line_status,
      metadata
    )
    select
      p_session_id,
      'stock',
      se.id,
      es.warehouse_id,
      es.warehouse_id,
      greatest(coalesce(es.quantity, 0), 0),
      0,
      'pending',
      jsonb_build_object('source', 'stock_snapshot')
    from scoped_equipment se
    join public.equipment_stock es on es.equipment_id = se.id
    where se.inventory_category <> 'series'
      and (v_session.warehouse_id is null or es.warehouse_id = v_session.warehouse_id)
    returning 1
  ),
  inserted_units as (
    insert into public.inventory_count_lines (
      session_id,
      line_type,
      equipment_id,
      equipment_unit_id,
      expected_warehouse_id,
      counted_warehouse_id,
      serial_number,
      expected_quantity,
      counted_quantity,
      line_status,
      metadata
    )
    select
      p_session_id,
      'unit',
      u.equipment_id,
      u.id,
      u.warehouse_id,
      u.warehouse_id,
      u.serial_number,
      1,
      0,
      'pending',
      jsonb_build_object('source', 'unit_snapshot')
    from scoped_equipment se
    join public.equipment_units u on u.equipment_id = se.id
    where se.inventory_category = 'series'
      and (v_session.warehouse_id is null or u.warehouse_id = v_session.warehouse_id)
    returning 1
  )
  select
    coalesce((select count(*) from inserted_stock), 0)::int,
    coalesce((select count(*) from inserted_units), 0)::int
  into v_inserted_stock, v_inserted_units;

  perform public.recompute_inventory_count_session_totals(p_session_id);

  return jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'inserted_stock_lines', coalesce(v_inserted_stock, 0),
    'inserted_unit_lines', coalesce(v_inserted_units, 0),
    'inserted_total', coalesce(v_inserted_stock, 0) + coalesce(v_inserted_units, 0)
  );
end;
$$;

create or replace function public.create_inventory_count_session(
  p_warehouse_id uuid default null,
  p_force_full boolean default false,
  p_notes text default null,
  p_started_by uuid default null
)
returns public.inventory_count_sessions
language plpgsql
as $$
declare
  v_period_days integer := 30;
  v_full_every integer := 6;
  v_anchor_date date := current_date;
  v_cycle_index integer := 0;
  v_is_full boolean := false;
  v_period_start date;
  v_period_end date;
  v_session public.inventory_count_sessions%rowtype;
begin
  select
    coalesce(cs.inventory_cycle_period_days, 30),
    coalesce(cs.inventory_cycle_full_every, 6),
    coalesce(cs.inventory_cycle_anchor_date, current_date)
  into
    v_period_days,
    v_full_every,
    v_anchor_date
  from public.company_settings cs
  where cs.id = 1
  limit 1;

  v_period_days := greatest(coalesce(v_period_days, 30), 1);
  v_full_every := greatest(coalesce(v_full_every, 6), 1);
  v_anchor_date := coalesce(v_anchor_date, current_date);

  v_cycle_index := floor(greatest((current_date - v_anchor_date), 0)::numeric / v_period_days)::int;
  v_period_start := v_anchor_date + (v_cycle_index * v_period_days);
  v_period_end := v_period_start + (v_period_days - 1);
  v_is_full := p_force_full or v_full_every <= 1 or mod(v_cycle_index, v_full_every) = 0;

  insert into public.inventory_count_sessions (
    session_type,
    status,
    warehouse_id,
    cycle_index,
    period_start,
    period_end,
    notes,
    started_by,
    started_at,
    metadata
  )
  values (
    case when v_is_full then 'full' else 'cycle' end,
    'in_progress',
    p_warehouse_id,
    v_cycle_index,
    v_period_start,
    v_period_end,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_started_by,
    now(),
    jsonb_build_object(
      'period_days', v_period_days,
      'full_every', v_full_every,
      'anchor_date', v_anchor_date,
      'force_full', p_force_full
    )
  )
  returning * into v_session;

  perform public.populate_inventory_count_session_lines(v_session.id);

  select *
    into v_session
  from public.inventory_count_sessions
  where id = v_session.id;

  return v_session;
end;
$$;

create or replace function public.set_inventory_count_stock_line(
  p_line_id uuid,
  p_counted_quantity integer,
  p_counted_by uuid default null,
  p_notes text default null,
  p_counted_warehouse_id uuid default null
)
returns public.inventory_count_lines
language plpgsql
as $$
declare
  v_line public.inventory_count_lines%rowtype;
  v_session_status text;
begin
  select l.*
    into v_line
  from public.inventory_count_lines l
  where l.id = p_line_id;

  if v_line.id is null then
    raise exception 'Inventory line % not found', p_line_id;
  end if;

  select s.status
    into v_session_status
  from public.inventory_count_sessions s
  where s.id = v_line.session_id;

  if v_line.line_type <> 'stock' then
    raise exception 'Line % is not a stock line', p_line_id;
  end if;

  if v_session_status in ('completed', 'cancelled') then
    raise exception 'Session is % and cannot be modified', v_session_status;
  end if;

  update public.inventory_count_lines
  set
    counted_quantity = greatest(coalesce(p_counted_quantity, 0), 0),
    counted_by = p_counted_by,
    counted_at = now(),
    line_status = 'counted',
    counted_warehouse_id = coalesce(p_counted_warehouse_id, counted_warehouse_id, expected_warehouse_id),
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  where id = p_line_id
  returning * into v_line;

  return v_line;
end;
$$;

create or replace function public.set_inventory_count_unit_line(
  p_line_id uuid,
  p_present boolean,
  p_counted_by uuid default null,
  p_counted_warehouse_id uuid default null,
  p_notes text default null
)
returns public.inventory_count_lines
language plpgsql
as $$
declare
  v_line public.inventory_count_lines%rowtype;
  v_session_status text;
begin
  select l.*
    into v_line
  from public.inventory_count_lines l
  where l.id = p_line_id;

  if v_line.id is null then
    raise exception 'Inventory line % not found', p_line_id;
  end if;

  select s.status
    into v_session_status
  from public.inventory_count_sessions s
  where s.id = v_line.session_id;

  if v_line.line_type <> 'unit' then
    raise exception 'Line % is not a unit line', p_line_id;
  end if;

  if v_session_status in ('completed', 'cancelled') then
    raise exception 'Session is % and cannot be modified', v_session_status;
  end if;

  update public.inventory_count_lines
  set
    counted_quantity = case when coalesce(p_present, false) then 1 else 0 end,
    counted_by = p_counted_by,
    counted_at = now(),
    line_status = 'counted',
    counted_warehouse_id = coalesce(p_counted_warehouse_id, counted_warehouse_id, expected_warehouse_id),
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  where id = p_line_id
  returning * into v_line;

  return v_line;
end;
$$;

create or replace function public.scan_inventory_count_unit(
  p_session_id uuid,
  p_scanned_code text,
  p_scanned_by uuid default null,
  p_counted_warehouse_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_unit record;
  v_line public.inventory_count_lines%rowtype;
  v_session_status text;
begin
  select status
    into v_session_status
  from public.inventory_count_sessions
  where id = p_session_id;

  if v_session_status is null then
    raise exception 'Inventory session % not found', p_session_id;
  end if;

  if v_session_status in ('completed', 'cancelled') then
    raise exception 'Session is % and cannot be modified', v_session_status;
  end if;

  select
    u.id,
    u.equipment_id,
    u.warehouse_id,
    u.serial_number,
    u.qr_code_value
  into v_unit
  from public.equipment_units u
  where
    u.id::text = p_scanned_code
    or u.qr_code_value = p_scanned_code
    or u.serial_number = p_scanned_code
  order by
    case
      when u.qr_code_value = p_scanned_code then 0
      when u.serial_number = p_scanned_code then 1
      else 2
    end,
    u.created_at desc
  limit 1;

  if v_unit.id is null then
    insert into public.inventory_count_unit_scans (
      session_id,
      scanned_code,
      scan_result,
      scanned_by,
      metadata
    )
    values (
      p_session_id,
      p_scanned_code,
      'unknown_code',
      p_scanned_by,
      jsonb_build_object('reason', 'unit_not_found')
    );

    return jsonb_build_object(
      'ok', false,
      'scan_result', 'unknown_code',
      'message', 'Code non reconnu pour cette session.'
    );
  end if;

  select *
    into v_line
  from public.inventory_count_lines l
  where l.session_id = p_session_id
    and l.equipment_unit_id = v_unit.id
  limit 1;

  if v_line.id is null then
    insert into public.inventory_count_unit_scans (
      session_id,
      equipment_unit_id,
      scanned_code,
      scan_result,
      scanned_by,
      metadata
    )
    values (
      p_session_id,
      v_unit.id,
      p_scanned_code,
      'out_of_scope',
      p_scanned_by,
      jsonb_build_object('reason', 'unit_not_in_session')
    );

    return jsonb_build_object(
      'ok', false,
      'scan_result', 'out_of_scope',
      'equipment_unit_id', v_unit.id,
      'serial_number', v_unit.serial_number,
      'message', 'Ce numéro n''est pas attendu dans cet inventaire.'
    );
  end if;

  if v_line.line_status = 'counted' and v_line.counted_quantity = 1 then
    insert into public.inventory_count_unit_scans (
      session_id,
      line_id,
      equipment_unit_id,
      scanned_code,
      scan_result,
      scanned_by,
      metadata
    )
    values (
      p_session_id,
      v_line.id,
      v_unit.id,
      p_scanned_code,
      'duplicate',
      p_scanned_by,
      jsonb_build_object('reason', 'already_counted')
    );

    return jsonb_build_object(
      'ok', false,
      'scan_result', 'duplicate',
      'line_id', v_line.id,
      'equipment_unit_id', v_unit.id,
      'serial_number', v_unit.serial_number,
      'message', 'Ce numéro a déjà été comptabilisé.'
    );
  end if;

  update public.inventory_count_lines
  set
    counted_quantity = 1,
    counted_by = p_scanned_by,
    counted_at = now(),
    line_status = 'counted',
    counted_warehouse_id = coalesce(p_counted_warehouse_id, counted_warehouse_id, expected_warehouse_id, v_unit.warehouse_id)
  where id = v_line.id
  returning * into v_line;

  insert into public.inventory_count_unit_scans (
    session_id,
    line_id,
    equipment_unit_id,
    scanned_code,
    scan_result,
    scanned_by,
    metadata
  )
  values (
    p_session_id,
    v_line.id,
    v_unit.id,
    p_scanned_code,
    'counted',
    p_scanned_by,
    jsonb_build_object('line_type', 'unit')
  );

  return jsonb_build_object(
    'ok', true,
    'scan_result', 'counted',
    'line_id', v_line.id,
    'equipment_unit_id', v_unit.id,
    'serial_number', v_unit.serial_number,
    'counted_warehouse_id', v_line.counted_warehouse_id
  );
end;
$$;

create or replace function public.finalize_inventory_count_session(
  p_session_id uuid,
  p_completed_by uuid default null,
  p_mark_pending_as_zero boolean default true
)
returns jsonb
language plpgsql
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
begin
  select *
    into v_session
  from public.inventory_count_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Inventory session % not found', p_session_id;
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'Session % is already %', p_session_id, v_session.status;
  end if;

  if p_mark_pending_as_zero then
    update public.inventory_count_lines
    set
      line_status = 'counted',
      counted_at = coalesce(counted_at, now()),
      counted_by = coalesce(counted_by, p_completed_by),
      counted_quantity = case
        when line_type = 'unit' then least(greatest(coalesce(counted_quantity, 0), 0), 1)
        else greatest(coalesce(counted_quantity, 0), 0)
      end
    where session_id = p_session_id
      and line_status = 'pending';
  elsif exists (
    select 1
    from public.inventory_count_lines
    where session_id = p_session_id
      and line_status = 'pending'
  ) then
    raise exception 'Session % still has pending lines', p_session_id;
  end if;

  insert into public.inventory_count_adjustments (
    session_id,
    line_id,
    adjustment_type,
    equipment_id,
    warehouse_id,
    from_value,
    to_value,
    delta_quantity,
    applied_by,
    metadata
  )
  select
    p_session_id,
    l.id,
    'stock_quantity',
    l.equipment_id,
    coalesce(l.counted_warehouse_id, l.expected_warehouse_id),
    l.expected_quantity::text,
    l.counted_quantity::text,
    l.counted_quantity - l.expected_quantity,
    p_completed_by,
    jsonb_build_object('line_type', 'stock')
  from public.inventory_count_lines l
  where l.session_id = p_session_id
    and l.line_type = 'stock'
    and l.expected_quantity is distinct from l.counted_quantity;

  insert into public.equipment_stock (
    equipment_id,
    warehouse_id,
    quantity
  )
  select
    l.equipment_id,
    coalesce(l.counted_warehouse_id, l.expected_warehouse_id),
    greatest(l.counted_quantity, 0)
  from public.inventory_count_lines l
  where l.session_id = p_session_id
    and l.line_type = 'stock'
    and coalesce(l.counted_warehouse_id, l.expected_warehouse_id) is not null
  on conflict (equipment_id, warehouse_id)
  do update set
    quantity = excluded.quantity;

  insert into public.inventory_count_adjustments (
    session_id,
    line_id,
    adjustment_type,
    equipment_id,
    equipment_unit_id,
    warehouse_id,
    from_value,
    to_value,
    applied_by,
    metadata
  )
  select
    p_session_id,
    l.id,
    'unit_warehouse',
    l.equipment_id,
    l.equipment_unit_id,
    coalesce(l.counted_warehouse_id, l.expected_warehouse_id),
    u.warehouse_id::text,
    coalesce(l.counted_warehouse_id, l.expected_warehouse_id)::text,
    p_completed_by,
    jsonb_build_object('serial_number', l.serial_number)
  from public.inventory_count_lines l
  join public.equipment_units u on u.id = l.equipment_unit_id
  where l.session_id = p_session_id
    and l.line_type = 'unit'
    and l.counted_quantity = 1
    and coalesce(l.counted_warehouse_id, l.expected_warehouse_id) is not null
    and u.warehouse_id is distinct from coalesce(l.counted_warehouse_id, l.expected_warehouse_id);

  update public.equipment_units u
  set warehouse_id = coalesce(l.counted_warehouse_id, l.expected_warehouse_id)
  from public.inventory_count_lines l
  where l.session_id = p_session_id
    and l.line_type = 'unit'
    and l.counted_quantity = 1
    and l.equipment_unit_id = u.id
    and coalesce(l.counted_warehouse_id, l.expected_warehouse_id) is not null
    and u.warehouse_id is distinct from coalesce(l.counted_warehouse_id, l.expected_warehouse_id);

  perform public.recompute_inventory_count_session_totals(p_session_id);

  update public.inventory_count_sessions
  set
    status = 'completed',
    completed_at = now(),
    completed_by = p_completed_by,
    updated_at = now()
  where id = p_session_id;

  select *
    into v_session
  from public.inventory_count_sessions
  where id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'status', v_session.status,
    'expected_lines', v_session.expected_lines,
    'counted_lines', v_session.counted_lines,
    'expected_quantity', v_session.expected_quantity,
    'counted_quantity', v_session.counted_quantity,
    'discrepancy_quantity', v_session.discrepancy_quantity,
    'completed_at', v_session.completed_at
  );
end;
$$;

-- 4) Planning and reporting views
create or replace view public.inventory_cycle_planning as
with cfg as (
  select
    coalesce(cs.inventory_cycle_period_days, 30) as period_days,
    coalesce(cs.inventory_cycle_full_every, 6) as full_every,
    coalesce(cs.inventory_cycle_anchor_date, current_date) as anchor_date
  from public.company_settings cs
  where cs.id = 1
  limit 1
),
calc as (
  select
    greatest(c.period_days, 1) as period_days,
    greatest(c.full_every, 1) as full_every,
    c.anchor_date,
    floor(greatest((current_date - c.anchor_date), 0)::numeric / greatest(c.period_days, 1))::int as current_cycle_index
  from cfg c
)
select
  c.period_days,
  c.full_every,
  c.anchor_date,
  c.current_cycle_index,
  (c.anchor_date + (c.current_cycle_index * c.period_days))::date as current_cycle_start,
  (c.anchor_date + ((c.current_cycle_index + 1) * c.period_days) - 1)::date as current_cycle_end,
  (c.anchor_date + ((c.current_cycle_index + 1) * c.period_days))::date as next_cycle_start,
  (c.current_cycle_index + 1)::int as next_cycle_index,
  (
    c.current_cycle_index
    + case
        when c.full_every <= 1 then 1
        when mod(c.current_cycle_index, c.full_every) = 0 then c.full_every
        else c.full_every - mod(c.current_cycle_index, c.full_every)
      end
  )::int as next_full_cycle_index,
  (
    c.anchor_date
    + (
      (
        c.current_cycle_index
        + case
            when c.full_every <= 1 then 1
            when mod(c.current_cycle_index, c.full_every) = 0 then c.full_every
            else c.full_every - mod(c.current_cycle_index, c.full_every)
          end
      ) * c.period_days
    )
  )::date as next_full_cycle_start
from calc c;

create or replace view public.inventory_count_session_lines_view as
select
  l.id,
  l.session_id,
  s.session_code,
  s.session_type,
  s.status as session_status,
  l.line_type,
  l.equipment_id,
  e.name as equipment_name,
  e.type as equipment_type,
  e.inventory_category,
  l.equipment_unit_id,
  l.serial_number,
  l.expected_warehouse_id,
  ew.name as expected_warehouse_name,
  l.counted_warehouse_id,
  cw.name as counted_warehouse_name,
  l.expected_quantity,
  l.counted_quantity,
  (l.counted_quantity - l.expected_quantity)::int as discrepancy_quantity,
  l.line_status,
  l.counted_by,
  l.counted_at,
  l.notes,
  l.metadata,
  l.created_at,
  l.updated_at
from public.inventory_count_lines l
join public.inventory_count_sessions s on s.id = l.session_id
join public.equipment e on e.id = l.equipment_id
left join public.warehouses ew on ew.id = l.expected_warehouse_id
left join public.warehouses cw on cw.id = l.counted_warehouse_id;

-- 5) RLS/policies/grants (aligned with local permissive setup)
alter table public.inventory_count_sessions enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.inventory_count_unit_scans enable row level security;
alter table public.inventory_count_adjustments enable row level security;

drop policy if exists "Anon full access inventory_count_sessions" on public.inventory_count_sessions;
create policy "Anon full access inventory_count_sessions"
  on public.inventory_count_sessions
  using (true)
  with check (true);

drop policy if exists "Anon full access inventory_count_lines" on public.inventory_count_lines;
create policy "Anon full access inventory_count_lines"
  on public.inventory_count_lines
  using (true)
  with check (true);

drop policy if exists "Anon full access inventory_count_unit_scans" on public.inventory_count_unit_scans;
create policy "Anon full access inventory_count_unit_scans"
  on public.inventory_count_unit_scans
  using (true)
  with check (true);

drop policy if exists "Anon full access inventory_count_adjustments" on public.inventory_count_adjustments;
create policy "Anon full access inventory_count_adjustments"
  on public.inventory_count_adjustments
  using (true)
  with check (true);

grant all on table public.inventory_count_sessions to anon;
grant all on table public.inventory_count_sessions to authenticated;
grant all on table public.inventory_count_sessions to service_role;

grant all on table public.inventory_count_lines to anon;
grant all on table public.inventory_count_lines to authenticated;
grant all on table public.inventory_count_lines to service_role;

grant all on table public.inventory_count_unit_scans to anon;
grant all on table public.inventory_count_unit_scans to authenticated;
grant all on table public.inventory_count_unit_scans to service_role;

grant all on table public.inventory_count_adjustments to anon;
grant all on table public.inventory_count_adjustments to authenticated;
grant all on table public.inventory_count_adjustments to service_role;

grant select on public.inventory_cycle_planning to anon;
grant select on public.inventory_cycle_planning to authenticated;
grant select on public.inventory_cycle_planning to service_role;

grant select on public.inventory_count_session_lines_view to anon;
grant select on public.inventory_count_session_lines_view to authenticated;
grant select on public.inventory_count_session_lines_view to service_role;

grant execute on function public.populate_inventory_count_session_lines(uuid) to anon;
grant execute on function public.populate_inventory_count_session_lines(uuid) to authenticated;
grant execute on function public.populate_inventory_count_session_lines(uuid) to service_role;

grant execute on function public.create_inventory_count_session(uuid, boolean, text, uuid) to anon;
grant execute on function public.create_inventory_count_session(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.create_inventory_count_session(uuid, boolean, text, uuid) to service_role;

grant execute on function public.set_inventory_count_stock_line(uuid, integer, uuid, text, uuid) to anon;
grant execute on function public.set_inventory_count_stock_line(uuid, integer, uuid, text, uuid) to authenticated;
grant execute on function public.set_inventory_count_stock_line(uuid, integer, uuid, text, uuid) to service_role;

grant execute on function public.set_inventory_count_unit_line(uuid, boolean, uuid, uuid, text) to anon;
grant execute on function public.set_inventory_count_unit_line(uuid, boolean, uuid, uuid, text) to authenticated;
grant execute on function public.set_inventory_count_unit_line(uuid, boolean, uuid, uuid, text) to service_role;

grant execute on function public.scan_inventory_count_unit(uuid, text, uuid, uuid) to anon;
grant execute on function public.scan_inventory_count_unit(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.scan_inventory_count_unit(uuid, text, uuid, uuid) to service_role;

grant execute on function public.finalize_inventory_count_session(uuid, uuid, boolean) to anon;
grant execute on function public.finalize_inventory_count_session(uuid, uuid, boolean) to authenticated;
grant execute on function public.finalize_inventory_count_session(uuid, uuid, boolean) to service_role;
