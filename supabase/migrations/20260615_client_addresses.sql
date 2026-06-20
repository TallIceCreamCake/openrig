-- Adresse de facturation distincte de l'adresse de contact
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_address text;

-- Adresse de livraison par défaut (pré-remplit le champ livraison des projets)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS default_delivery_address text;
