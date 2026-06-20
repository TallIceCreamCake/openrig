-- Public API keys for third-party and website integrations
-- Keys are stored hashed (SHA-256). Plaintext is shown once on creation.

create table if not exists public.public_api_keys (
  id                    uuid default gen_random_uuid() primary key,
  name                  text not null,
  key_hash              text not null unique,
  key_prefix            text not null,          -- e.g. "or_live_a1b2c3d4" (first 16 chars, shown in UI)
  permissions           text[] not null default array['catalog:read', 'availability:read'],
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 1000),
  expires_at            timestamptz,
  last_used_at          timestamptz,
  is_active             boolean not null default true,
  created_at            timestamptz default now() not null
);

comment on table public.public_api_keys is 'API keys for external website / integration access to OpenRig data';
comment on column public.public_api_keys.permissions is 'Scopes: catalog:read, availability:read, rentals:read, clients:read, equipment:read, invoices:read, stats:read, requests:write, * (all)';

create index if not exists idx_public_api_keys_hash   on public.public_api_keys(key_hash);
create index if not exists idx_public_api_keys_active on public.public_api_keys(is_active);

alter table public.public_api_keys enable row level security;

-- Only the service role can read/write (server-side only, never exposed to browser Supabase client)
create policy "Service role full access" on public.public_api_keys
  using (true) with check (true);
