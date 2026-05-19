alter table rentals
  add column if not exists cancelled_at timestamptz null,
  add column if not exists cancellation_reason text null,
  add column if not exists cancellation_payment_policy text null,
  add column if not exists cancellation_refund_amount numeric null;
