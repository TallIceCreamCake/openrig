CREATE OR REPLACE FUNCTION public.get_equipment_availability(p_equipment_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
AS $$
declare
  v_stock int := 0;
  v_rented int := 0;
  v_maint int := 0;
begin
  -- total stock across warehouses
  select coalesce(sum(quantity),0) into v_stock
  from equipment_stock
  where equipment_id = p_equipment_id;

  -- quantity reserved by rentals overlapping the period (exclude sales)
  select coalesce(sum(ri.quantity),0) into v_rented
  from rental_items ri
  join rentals r on r.id = ri.rental_id
  where ri.equipment_id = p_equipment_id
    and r.status in ('pending','confirmed','in_progress')
    and r.type <> 'sale'
    and r.start_date <= p_end
    and r.end_date >= p_start;

  -- units in maintenance (open entries)
  select coalesce(count(*),0) into v_maint
  from equipment_maintenance em
  where em.equipment_id = p_equipment_id
    and em.status = 'open';

  return greatest(0, v_stock - v_rented - v_maint);
end;
$$;

CREATE OR REPLACE FUNCTION public.get_next_return_date(p_equipment_id uuid, p_start timestamp with time zone)
RETURNS timestamp with time zone
LANGUAGE sql
AS $$
  select min(r.end_date)
  from rental_items ri
  join rentals r on r.id = ri.rental_id
  where ri.equipment_id = p_equipment_id
    and r.status in ('pending','confirmed','in_progress')
    and r.type <> 'sale'
    and r.end_date >= p_start
$$;
