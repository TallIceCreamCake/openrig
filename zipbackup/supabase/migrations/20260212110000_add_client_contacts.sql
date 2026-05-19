create table if not exists client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  contact_type text not null,
  title text null,
  value text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint client_contacts_contact_type_check
    check (contact_type = any (array['email'::text, 'phone'::text, 'social'::text, 'website'::text, 'other'::text]))
);

create index if not exists client_contacts_client_id_idx
  on client_contacts (client_id);

create index if not exists client_contacts_contact_type_idx
  on client_contacts (contact_type);
