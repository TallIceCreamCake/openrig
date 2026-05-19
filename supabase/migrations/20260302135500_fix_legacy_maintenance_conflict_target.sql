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
  where legacy_maintenance_id is not null
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
