-- Client portal accounts (one per client, only for non-company clients)
CREATE TABLE IF NOT EXISTS client_portal_accounts (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email           text        NOT NULL,
  password_hash   text        NOT NULL,
  password_salt   text        NOT NULL,
  must_change_password boolean DEFAULT true NOT NULL,
  created_at      timestamptz DEFAULT now() NOT NULL,
  activated_at    timestamptz,
  last_login_at   timestamptz,
  UNIQUE (client_id)
);

-- Sessions (token-based, 30-day TTL)
CREATE TABLE IF NOT EXISTS client_portal_sessions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES client_portal_accounts(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  created_at  timestamptz DEFAULT now() NOT NULL,
  expires_at  timestamptz NOT NULL
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_token ON client_portal_sessions (token);
