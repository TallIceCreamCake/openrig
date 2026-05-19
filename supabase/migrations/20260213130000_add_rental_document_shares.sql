create table if not exists rental_document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references rental_documents(id) on delete cascade,
  token text not null unique,
  status text not null default 'active',
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint rental_document_shares_status_check
    check (status = any (array['active'::text, 'revoked'::text, 'expired'::text]))
);

create index if not exists rental_document_shares_document_id_idx
  on rental_document_shares (document_id);

create index if not exists rental_document_shares_token_idx
  on rental_document_shares (token);
