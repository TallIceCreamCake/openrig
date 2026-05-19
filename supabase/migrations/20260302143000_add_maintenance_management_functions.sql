create or replace function public.complete_maintenance_task(
  p_task_id uuid,
  p_completed_at timestamp with time zone default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_at timestamptz := coalesce(p_completed_at, now());
  v_maintenance record;
begin
  update public.maintenance_tasks
  set
    status = 'completed',
    completed_date = v_completed_at::date
  where id = p_task_id;

  for v_maintenance in
    update public.equipment_maintenance
    set
      status = 'closed',
      completed_at = v_completed_at
    where task_id = p_task_id
      and status = 'open'
    returning equipment_id, serial_number
  loop
    if v_maintenance.equipment_id is not null and v_maintenance.serial_number is not null then
      update public.equipment_units u
      set status = 'available'
      where u.equipment_id = v_maintenance.equipment_id
        and u.serial_number = v_maintenance.serial_number
        and u.status = 'maintenance'
        and not exists (
          select 1
          from public.equipment_maintenance em
          where em.equipment_id = v_maintenance.equipment_id
            and em.serial_number = v_maintenance.serial_number
            and em.status = 'open'
        );
    end if;
  end loop;
end;
$$;

create or replace function public.delete_maintenance_task(
  p_task_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked_maintenance_ids uuid[] := '{}'::uuid[];
  v_maintenance record;
begin
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_linked_maintenance_ids
  from public.equipment_maintenance
  where task_id = p_task_id;

  if coalesce(array_length(v_linked_maintenance_ids, 1), 0) > 0 then
    delete from public.equipment_unit_maintenance_records
    where legacy_task_id = p_task_id
       or legacy_maintenance_id = any(v_linked_maintenance_ids);
  else
    delete from public.equipment_unit_maintenance_records
    where legacy_task_id = p_task_id;
  end if;

  for v_maintenance in
    delete from public.equipment_maintenance
    where task_id = p_task_id
    returning equipment_id, serial_number
  loop
    if v_maintenance.equipment_id is not null and v_maintenance.serial_number is not null then
      update public.equipment_units u
      set status = 'available'
      where u.equipment_id = v_maintenance.equipment_id
        and u.serial_number = v_maintenance.serial_number
        and u.status = 'maintenance'
        and not exists (
          select 1
          from public.equipment_maintenance em
          where em.equipment_id = v_maintenance.equipment_id
            and em.serial_number = v_maintenance.serial_number
            and em.status = 'open'
        );
    end if;
  end loop;

  delete from public.maintenance_tasks
  where id = p_task_id;
end;
$$;

grant all on function public.complete_maintenance_task(uuid, timestamp with time zone) to anon;
grant all on function public.complete_maintenance_task(uuid, timestamp with time zone) to authenticated;
grant all on function public.complete_maintenance_task(uuid, timestamp with time zone) to service_role;

grant all on function public.delete_maintenance_task(uuid) to anon;
grant all on function public.delete_maintenance_task(uuid) to authenticated;
grant all on function public.delete_maintenance_task(uuid) to service_role;
