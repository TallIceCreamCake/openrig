create table if not exists rental_other_services (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  service_record_id uuid not null references service_records(id),
  quantity integer not null default 1,
  days integer not null default 1,
  created_at timestamptz not null default now(),
  constraint rental_other_services_quantity_check check (quantity > 0),
  constraint rental_other_services_days_check check (days > 0)
);

create index if not exists rental_other_services_rental_id_idx
  on rental_other_services (rental_id);

create index if not exists rental_other_services_service_record_id_idx
  on rental_other_services (service_record_id);
