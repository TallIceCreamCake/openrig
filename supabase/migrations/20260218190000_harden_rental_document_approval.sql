alter table if exists rental_document_requests
  add column if not exists decision_code_hash text null,
  add column if not exists decision_attempts integer not null default 0,
  add column if not exists decision_last_attempt_at timestamptz null,
  add column if not exists signer_name text null,
  add column if not exists consent_text text null,
  add column if not exists consented_at timestamptz null;

create index if not exists rental_document_requests_decision_attempts_idx
  on rental_document_requests (decision_attempts);
