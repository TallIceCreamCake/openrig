ALTER TABLE clients ADD COLUMN IF NOT EXISTS financial_conditions text[] NOT NULL DEFAULT '{}';
