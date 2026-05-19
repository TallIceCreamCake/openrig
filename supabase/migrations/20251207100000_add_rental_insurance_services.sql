create table if not exists rental_insurance_services (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  service_record_id uuid not null references service_records(id),
  days integer not null default 1,
  created_at timestamptz not null default now(),
  constraint rental_insurance_services_days_check check (days > 0)
);

create index if not exists rental_insurance_services_rental_id_idx
  on rental_insurance_services (rental_id);

create index if not exists rental_insurance_services_service_record_id_idx
  on rental_insurance_services (service_record_id);
