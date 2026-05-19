-- Add optional access password hash to rental_document_requests
-- The password is set by the sender (not sent by email) and gates the approval page.

ALTER TABLE rental_document_requests
  ADD COLUMN IF NOT EXISTS access_password_hash text;
