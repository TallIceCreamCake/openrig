ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS siret text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS legal_form text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS share_capital decimal(15,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rcs_number text;
