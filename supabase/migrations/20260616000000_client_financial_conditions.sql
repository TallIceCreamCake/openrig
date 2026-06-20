ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_equipment_discount decimal(5,2) NOT NULL DEFAULT 0;
