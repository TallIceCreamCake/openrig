ALTER TABLE clients ADD COLUMN IF NOT EXISTS trust_score integer;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS trust_score_computed_at timestamptz;
