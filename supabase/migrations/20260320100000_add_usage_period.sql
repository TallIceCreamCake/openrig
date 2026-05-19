-- Add usage period columns to rentals
-- usage_start_date / usage_end_date are optional
-- When set, they drive equipment reservation instead of billing period
-- Billing period (start_date / end_date) always drives pricing / coefficient

ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS usage_start_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS usage_end_date timestamp with time zone;

-- Update get_equipment_availability to use usage period for overlap detection
-- COALESCE falls back to billing period when usage period is not set
CREATE OR REPLACE FUNCTION public.get_equipment_availability(
  p_equipment_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
RETURNS integer
LANGUAGE plpgsql
AS $$
declare
  v_stock int := 0;
  v_rented int := 0;
  v_maint int := 0;
begin
  -- total stock across warehouses
  select coalesce(sum(quantity), 0) into v_stock
  from equipment_stock
  where equipment_id = p_equipment_id;

  -- quantity reserved by rentals overlapping the period
  -- uses usage_start_date / usage_end_date when set, falls back to billing period
  select coalesce(sum(ri.quantity), 0) into v_rented
  from rental_items ri
  join rentals r on r.id = ri.rental_id
  where ri.equipment_id = p_equipment_id
    and r.status in ('pending', 'confirmed', 'in_progress')
    and coalesce(r.usage_start_date, r.start_date) <= p_end
    and coalesce(r.usage_end_date, r.end_date) >= p_start;

  -- units in maintenance (open entries)
  select coalesce(count(*), 0) into v_maint
  from equipment_maintenance em
  where em.equipment_id = p_equipment_id
    and em.status = 'open';

  return greatest(0, v_stock - v_rented - v_maint);
end;
$$;

-- Update get_next_return_date to use usage period
CREATE OR REPLACE FUNCTION public.get_next_return_date(
  p_equipment_id uuid,
  p_start timestamp with time zone
)
RETURNS timestamp with time zone
LANGUAGE sql
AS $$
  select min(coalesce(r.usage_end_date, r.end_date))
  from rental_items ri
  join rentals r on r.id = ri.rental_id
  where ri.equipment_id = p_equipment_id
    and r.status in ('pending', 'confirmed', 'in_progress')
    and coalesce(r.usage_end_date, r.end_date) >= p_start
$$;
