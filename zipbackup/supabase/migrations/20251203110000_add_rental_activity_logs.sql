create table if not exists rental_activity_logs (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  actor_id uuid null references app_users(id) on delete set null,
  actor_name text not null,
  action text not null,
  details text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists rental_activity_logs_rental_id_idx
  on rental_activity_logs (rental_id, created_at desc);
