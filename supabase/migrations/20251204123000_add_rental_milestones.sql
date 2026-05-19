create table if not exists rental_milestones (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  title text not null,
  description text null,
  start_at timestamptz not null,
  end_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists rental_milestones_rental_idx
  on rental_milestones (rental_id, start_at);

create table if not exists rental_milestone_personnel (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references rental_milestones(id) on delete cascade,
  personnel_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (milestone_id, personnel_id)
);

create index if not exists rental_milestone_personnel_idx
  on rental_milestone_personnel (milestone_id);

create table if not exists rental_milestone_vehicles (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references rental_milestones(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (milestone_id, vehicle_id)
);

create index if not exists rental_milestone_vehicles_idx
  on rental_milestone_vehicles (milestone_id);

create table if not exists rental_milestone_items (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references rental_milestones(id) on delete cascade,
  rental_item_id uuid not null references rental_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (milestone_id, rental_item_id)
);

create index if not exists rental_milestone_items_idx
  on rental_milestone_items (milestone_id);
