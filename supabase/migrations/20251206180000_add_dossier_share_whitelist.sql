do $$
begin
  if to_regclass('public.rental_dossier_shares') is not null then
    alter table public.rental_dossier_shares
      add column if not exists whitelist_enabled boolean not null default false;
  end if;
end $$;

create table if not exists rental_dossier_whitelist_emails (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  constraint rental_dossier_whitelist_email_unique unique (rental_id, email)
);

create index if not exists rental_dossier_whitelist_emails_rental_id_idx
  on rental_dossier_whitelist_emails (rental_id);

create table if not exists rental_dossier_whitelist_verifications (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint rental_dossier_whitelist_verifications_unique unique (rental_id, email)
);

create index if not exists rental_dossier_whitelist_verifications_rental_id_idx
  on rental_dossier_whitelist_verifications (rental_id);

create table if not exists rental_dossier_share_access_codes (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references rental_dossier_shares(id) on delete cascade,
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint rental_dossier_share_access_codes_unique unique (share_id, email)
);

create index if not exists rental_dossier_share_access_codes_share_id_idx
  on rental_dossier_share_access_codes (share_id);

create table if not exists rental_dossier_share_access_sessions (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references rental_dossier_shares(id) on delete cascade,
  email text not null,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rental_dossier_share_access_sessions_share_id_idx
  on rental_dossier_share_access_sessions (share_id);
