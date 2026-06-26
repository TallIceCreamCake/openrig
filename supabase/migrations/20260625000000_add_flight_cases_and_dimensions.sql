-- Flight cases + physical dimensions for the 3D loading module.
--
-- A flight case mirrors a pack: it is an equipment row (type = 'Flight') with a
-- metadata row (equipment_flight_cases) and a list of contained equipment
-- (equipment_flight_case_items). The flight's own unit_weight_kg is its EMPTY
-- weight; the loaded weight is empty + Σ(content unit_weight_kg × quantity).
--
-- Physical dimensions (length/width/height, in cm) live on equipment so flight
-- cases and packs can be drag-dropped and sized in the 3D loading view.

-- 1) Physical dimensions on equipment (used mainly by flight cases & packs).
alter table public.equipment
  add column if not exists length_cm numeric(8,1),
  add column if not exists width_cm  numeric(8,1),
  add column if not exists height_cm numeric(8,1);

-- 2) Flight case metadata (PK = the equipment row representing the flight).
create table if not exists public.equipment_flight_cases (
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  constraint equipment_flight_cases_pkey primary key (equipment_id)
);

-- 3) Contents of a flight case (which equipment, and how many, are inside).
create table if not exists public.equipment_flight_case_items (
  id uuid not null default gen_random_uuid(),
  flight_case_id uuid not null references public.equipment(id) on delete cascade,
  equipment_id   uuid not null references public.equipment(id) on delete cascade,
  quantity   integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint equipment_flight_case_items_pkey primary key (id)
);

create index if not exists equipment_flight_case_items_flight_idx
  on public.equipment_flight_case_items (flight_case_id);
create index if not exists equipment_flight_case_items_equipment_idx
  on public.equipment_flight_case_items (equipment_id);
