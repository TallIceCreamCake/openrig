create table if not exists rental_document_requests (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  document_id uuid null references rental_documents(id) on delete set null,
  doc_type text not null,
  recipient_email text null,
  recipient_name text null,
  token text not null unique,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz null,
  response_ip text null,
  response_user_agent text null,
  expires_at timestamptz null default (now() + interval '30 days'),
  constraint rental_document_requests_status_check
    check (status = any (array['pending'::text, 'accepted'::text, 'refused'::text, 'expired'::text, 'cancelled'::text])),
  constraint rental_document_requests_doc_type_check
    check (doc_type = any (array['devis'::text, 'facture'::text, 'bon_prepa'::text]))
);

create index if not exists rental_document_requests_rental_id_idx
  on rental_document_requests (rental_id);

create index if not exists rental_document_requests_token_idx
  on rental_document_requests (token);

create index if not exists rental_document_requests_status_idx
  on rental_document_requests (status);
