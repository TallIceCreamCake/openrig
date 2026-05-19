create table if not exists rental_dossier_shares (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  root_entry_id uuid null references rental_dossier_entries(id) on delete cascade,
  token text not null unique,
  status text not null default 'active',
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint rental_dossier_shares_status_check
    check (status = any (array['active'::text, 'revoked'::text, 'expired'::text]))
);

create index if not exists rental_dossier_shares_rental_id_idx
  on rental_dossier_shares (rental_id);

create index if not exists rental_dossier_shares_token_idx
  on rental_dossier_shares (token);
