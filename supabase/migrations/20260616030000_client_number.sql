-- Séquence auto-incrémentée pour les numéros de compte clients
CREATE SEQUENCE IF NOT EXISTS client_number_seq;

-- Ajout de la colonne (nullable d'abord pour le backfill)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_number integer UNIQUE;

-- Backfill des clients existants
UPDATE clients SET client_number = nextval('client_number_seq') WHERE client_number IS NULL;

-- Défaut automatique pour les nouveaux clients
ALTER TABLE clients ALTER COLUMN client_number SET DEFAULT nextval('client_number_seq');

-- Contrainte NOT NULL une fois backfillé
ALTER TABLE clients ALTER COLUMN client_number SET NOT NULL;
