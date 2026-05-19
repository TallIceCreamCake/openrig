create table if not exists service_records (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  cost_per_person numeric null,
  provider text null,
  coverage text[] null,
  start_date date null,
  end_date date null,
  amount_per_day numeric null,
  status text not null default 'active',
  proof_file_url text null,
  proof_file_name text null,
  proof_file_type text null,
  proof_file_size integer null,
  notes text null,
  created_at timestamptz not null default now(),
  constraint service_records_category_check check (category = any (array['personnel'::text, 'insurance'::text])),
  constraint service_records_status_check check (status = any (array['active'::text, 'pending'::text, 'expired'::text, 'cancelled'::text]))
);

create index if not exists service_records_category_idx
  on service_records (category);

create index if not exists service_records_status_idx
  on service_records (status);

create index if not exists service_records_end_date_idx
  on service_records (end_date);

create table if not exists rental_personnel_services (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  service_record_id uuid not null references service_records(id),
  quantity integer not null default 1,
  days integer not null default 1,
  discount_percent numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint rental_personnel_services_quantity_check check (quantity > 0),
  constraint rental_personnel_services_days_check check (days > 0),
  constraint rental_personnel_services_discount_check check (discount_percent >= 0 and discount_percent <= 100)
);

create index if not exists rental_personnel_services_rental_id_idx
  on rental_personnel_services (rental_id);

create index if not exists rental_personnel_services_service_record_id_idx
  on rental_personnel_services (service_record_id);
