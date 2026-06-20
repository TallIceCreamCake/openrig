-- Public product flag on equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false NOT NULL;

-- Client portal project requests
CREATE TABLE IF NOT EXISTS client_portal_requests (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'converted', 'rejected')),
  start_date      date        NOT NULL,
  end_date        date        NOT NULL,
  message         text,
  equipment_items jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  converted_at    timestamptz,
  rental_id       uuid        REFERENCES rentals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cpr_client ON client_portal_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_cpr_status  ON client_portal_requests (status);

-- Link rentals back to a portal request + track admin validation
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS portal_request_id  uuid REFERENCES client_portal_requests(id) ON DELETE SET NULL;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS portal_validated   boolean DEFAULT false NOT NULL;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS portal_validated_at timestamptz;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS portal_validated_by_id uuid REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS portal_validation_notes text;
