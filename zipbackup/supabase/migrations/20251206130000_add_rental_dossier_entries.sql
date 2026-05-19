create table if not exists rental_dossier_entries (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  parent_id uuid null references rental_dossier_entries(id) on delete cascade,
  entry_type text not null,
  name text not null,
  file_url text null,
  file_name text null,
  file_type text null,
  file_size integer null,
  created_at timestamptz not null default now(),
  constraint rental_dossier_entries_type_check
    check (entry_type = any (array['folder'::text, 'file'::text]))
);

create index if not exists rental_dossier_entries_rental_id_idx
  on rental_dossier_entries (rental_id);

create index if not exists rental_dossier_entries_parent_id_idx
  on rental_dossier_entries (parent_id);
