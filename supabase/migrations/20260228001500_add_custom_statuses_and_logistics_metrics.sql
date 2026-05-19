-- Custom equipment statuses (unit-level for serial inventory, equipment-level otherwise)
-- + starter logistics metrics (weight/volume)

-- 1) Custom status catalog
create table if not exists public.equipment_custom_statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]+$'),
  name text not null,
  description text,
  color text not null default '#64748b' check (color ~ '^#([0-9a-fA-F]{6})$'),
  applies_to text not null default 'all' check (applies_to in ('all', 'series_unit', 'non_series_equipment')),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_equipment_custom_statuses_active_sort
  on public.equipment_custom_statuses (is_active, sort_order, name);

drop trigger if exists trg_equipment_custom_statuses_touch_updated_at on public.equipment_custom_statuses;
create trigger trg_equipment_custom_statuses_touch_updated_at
before update on public.equipment_custom_statuses
for each row
execute function public.touch_updated_at_column();

insert into public.equipment_custom_statuses (code, name, description, color, applies_to, sort_order)
values
  ('ready_pickup', 'Prêt au départ', 'Équipement prêt en entrepôt pour préparation/expédition', '#16a34a', 'all', 10),
  ('cleaning', 'Nettoyage', 'Équipement en nettoyage après retour', '#0ea5e9', 'series_unit', 20),
  ('qc_hold', 'Contrôle qualité', 'Bloqué en attente de validation qualité', '#f59e0b', 'all', 30),
  ('transit', 'En transit interne', 'Mouvement interne entre entrepôts', '#8b5cf6', 'all', 40)
on conflict (code) do nothing;

-- 2) Assignment columns + logistics metrics columns
alter table public.equipment
  add column if not exists custom_status_id uuid references public.equipment_custom_statuses(id) on delete set null,
  add column if not exists unit_weight_kg numeric(12,3) check (unit_weight_kg is null or unit_weight_kg >= 0),
  add column if not exists unit_volume_m3 numeric(12,5) check (unit_volume_m3 is null or unit_volume_m3 >= 0);

alter table public.equipment_units
  add column if not exists custom_status_id uuid references public.equipment_custom_statuses(id) on delete set null,
  add column if not exists logistics_weight_kg numeric(12,3) check (logistics_weight_kg is null or logistics_weight_kg >= 0),
  add column if not exists logistics_volume_m3 numeric(12,5) check (logistics_volume_m3 is null or logistics_volume_m3 >= 0);

create index if not exists idx_equipment_custom_status_id
  on public.equipment (custom_status_id);

create index if not exists idx_equipment_units_custom_status_id
  on public.equipment_units (custom_status_id);

-- 3) Scope enforcement
create or replace function public.enforce_equipment_custom_status_scope()
returns trigger
language plpgsql
as $$
declare
  v_applies_to text;
  v_inventory_category text;
begin
  if tg_table_name = 'equipment' then
    -- For serial inventory, custom statuses are managed per unit only.
    if coalesce(new.inventory_category, 'series') = 'series' then
      new.custom_status_id := null;
      return new;
    end if;

    if new.custom_status_id is not null then
      select applies_to
        into v_applies_to
      from public.equipment_custom_statuses
      where id = new.custom_status_id
        and is_active = true
      limit 1;

      if v_applies_to is null or v_applies_to = 'series_unit' then
        new.custom_status_id := null;
      end if;
    end if;

    return new;
  end if;

  if tg_table_name = 'equipment_units' then
    select inventory_category
      into v_inventory_category
    from public.equipment
    where id = new.equipment_id
    limit 1;

    -- For non-serial inventory, custom statuses are managed per equipment only.
    if coalesce(v_inventory_category, 'series') <> 'series' then
      new.custom_status_id := null;
      return new;
    end if;

    if new.custom_status_id is not null then
      select applies_to
        into v_applies_to
      from public.equipment_custom_statuses
      where id = new.custom_status_id
        and is_active = true
      limit 1;

      if v_applies_to is null or v_applies_to = 'non_series_equipment' then
        new.custom_status_id := null;
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_equipment_custom_status_scope_on_equipment on public.equipment;
create trigger trg_enforce_equipment_custom_status_scope_on_equipment
before insert or update of custom_status_id, inventory_category on public.equipment
for each row
execute function public.enforce_equipment_custom_status_scope();

drop trigger if exists trg_enforce_equipment_custom_status_scope_on_units on public.equipment_units;
create trigger trg_enforce_equipment_custom_status_scope_on_units
before insert or update of custom_status_id, equipment_id on public.equipment_units
for each row
execute function public.enforce_equipment_custom_status_scope();

-- 4) Custom status views
create or replace view public.equipment_unit_custom_status as
select
  u.id as equipment_unit_id,
  u.equipment_id,
  u.serial_number,
  u.custom_status_id,
  s.code as custom_status_code,
  s.name as custom_status_name,
  s.color as custom_status_color,
  s.applies_to as custom_status_applies_to
from public.equipment_units u
left join public.equipment_custom_statuses s
  on s.id = u.custom_status_id;

create or replace view public.equipment_custom_status_overview as
select
  e.id as equipment_id,
  e.name as equipment_name,
  e.inventory_category,
  e.custom_status_id as equipment_custom_status_id,
  s.code as equipment_custom_status_code,
  s.name as equipment_custom_status_name,
  s.color as equipment_custom_status_color,
  count(u.id)::int as unit_count,
  count(u.id) filter (where u.custom_status_id is not null)::int as units_with_custom_status_count
from public.equipment e
left join public.equipment_custom_statuses s
  on s.id = e.custom_status_id
left join public.equipment_units u
  on u.equipment_id = e.id
group by
  e.id,
  e.name,
  e.inventory_category,
  e.custom_status_id,
  s.code,
  s.name,
  s.color;

-- 5) Logistics metrics views
create or replace view public.equipment_logistics_metrics as
with stock_qty as (
  select
    es.equipment_id,
    coalesce(sum(es.quantity), 0)::int as stock_quantity
  from public.equipment_stock es
  group by es.equipment_id
),
series_agg as (
  select
    u.equipment_id,
    count(*)::int as unit_quantity,
    sum(coalesce(u.logistics_weight_kg, e.unit_weight_kg, 0))::numeric(14,3) as total_weight_kg,
    sum(coalesce(u.logistics_volume_m3, e.unit_volume_m3, 0))::numeric(14,5) as total_volume_m3
  from public.equipment_units u
  join public.equipment e on e.id = u.equipment_id
  group by u.equipment_id
)
select
  e.id as equipment_id,
  e.name as equipment_name,
  e.inventory_category,
  e.unit_weight_kg,
  e.unit_volume_m3,
  case
    when e.inventory_category = 'series' then coalesce(sa.unit_quantity, 0)
    else coalesce(sq.stock_quantity, 0)
  end::int as tracked_quantity,
  case
    when e.inventory_category = 'series' then coalesce(sa.total_weight_kg, 0)
    else (coalesce(sq.stock_quantity, 0) * coalesce(e.unit_weight_kg, 0))::numeric(14,3)
  end as total_weight_kg,
  case
    when e.inventory_category = 'series' then coalesce(sa.total_volume_m3, 0)
    else (coalesce(sq.stock_quantity, 0) * coalesce(e.unit_volume_m3, 0))::numeric(14,5)
  end as total_volume_m3
from public.equipment e
left join stock_qty sq on sq.equipment_id = e.id
left join series_agg sa on sa.equipment_id = e.id;

create or replace view public.equipment_logistics_metrics_by_warehouse as
with series_rows as (
  select
    u.equipment_id,
    u.warehouse_id,
    count(*)::int as tracked_quantity,
    sum(coalesce(u.logistics_weight_kg, e.unit_weight_kg, 0))::numeric(14,3) as total_weight_kg,
    sum(coalesce(u.logistics_volume_m3, e.unit_volume_m3, 0))::numeric(14,5) as total_volume_m3
  from public.equipment_units u
  join public.equipment e on e.id = u.equipment_id
  where e.inventory_category = 'series'
  group by u.equipment_id, u.warehouse_id
),
bulk_rows as (
  select
    es.equipment_id,
    es.warehouse_id,
    coalesce(sum(es.quantity), 0)::int as tracked_quantity,
    (coalesce(sum(es.quantity), 0) * coalesce(e.unit_weight_kg, 0))::numeric(14,3) as total_weight_kg,
    (coalesce(sum(es.quantity), 0) * coalesce(e.unit_volume_m3, 0))::numeric(14,5) as total_volume_m3
  from public.equipment_stock es
  join public.equipment e on e.id = es.equipment_id
  where e.inventory_category <> 'series'
  group by es.equipment_id, es.warehouse_id, e.unit_weight_kg, e.unit_volume_m3
),
merged as (
  select * from series_rows
  union all
  select * from bulk_rows
)
select
  m.equipment_id,
  e.name as equipment_name,
  e.inventory_category,
  m.warehouse_id,
  w.name as warehouse_name,
  m.tracked_quantity,
  m.total_weight_kg,
  m.total_volume_m3
from merged m
join public.equipment e on e.id = m.equipment_id
left join public.warehouses w on w.id = m.warehouse_id;

-- 6) Safety cleanup for existing data scope
update public.equipment
set custom_status_id = null
where inventory_category = 'series'
  and custom_status_id is not null;

update public.equipment_units u
set custom_status_id = null
from public.equipment e
where e.id = u.equipment_id
  and e.inventory_category <> 'series'
  and u.custom_status_id is not null;

-- 7) RLS / policies / grants (aligned with local permissive setup)
alter table public.equipment_custom_statuses enable row level security;

drop policy if exists "Anon full access equipment_custom_statuses" on public.equipment_custom_statuses;
create policy "Anon full access equipment_custom_statuses"
  on public.equipment_custom_statuses
  using (true)
  with check (true);

grant all on table public.equipment_custom_statuses to anon;
grant all on table public.equipment_custom_statuses to authenticated;
grant all on table public.equipment_custom_statuses to service_role;

grant select on public.equipment_unit_custom_status to anon;
grant select on public.equipment_unit_custom_status to authenticated;
grant select on public.equipment_unit_custom_status to service_role;

grant select on public.equipment_custom_status_overview to anon;
grant select on public.equipment_custom_status_overview to authenticated;
grant select on public.equipment_custom_status_overview to service_role;

grant select on public.equipment_logistics_metrics to anon;
grant select on public.equipment_logistics_metrics to authenticated;
grant select on public.equipment_logistics_metrics to service_role;

grant select on public.equipment_logistics_metrics_by_warehouse to anon;
grant select on public.equipment_logistics_metrics_by_warehouse to authenticated;
grant select on public.equipment_logistics_metrics_by_warehouse to service_role;
