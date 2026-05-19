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
    and coalesce(os.raw_status, 'available') not in ('broken', 'maintenance')
    and os.pending_return_validation = false
    and coalesce(os.has_compliance_block, false) = false
    and coalesce(os.open_maintenance_count, 0) = 0
    and not exists (
      select 1
      from public.equipment_unit_maintenance_history mh
      where mh.equipment_id = p_equipment_id
        and mh.equipment_unit_id is null
        and mh.status in ('scheduled', 'in_progress')
    )
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
