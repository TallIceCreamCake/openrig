-- Add modification request support to rental_document_requests
-- Adds modification_comment and modification_seen_at columns
-- and updates the status CHECK constraint to allow 'modification_requested'

ALTER TABLE rental_document_requests
  ADD COLUMN IF NOT EXISTS modification_comment text,
  ADD COLUMN IF NOT EXISTS modification_seen_at timestamptz;

-- Drop old status constraint and add updated one
ALTER TABLE rental_document_requests
  DROP CONSTRAINT IF EXISTS rental_document_requests_status_check;

ALTER TABLE rental_document_requests
  ADD CONSTRAINT rental_document_requests_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'accepted'::text,
      'refused'::text,
      'expired'::text,
      'cancelled'::text,
      'modification_requested'::text
    ]));
