-- Billing module additions:
-- • proof_url on payments (optional payment proof document URL)
-- • penalty tracking on schedule installments
-- • use_payment_schedule flag on invoices

alter table public.payments
  add column if not exists proof_url text;

alter table public.invoice_payment_schedules
  add column if not exists penalty_amount numeric(12,2) not null default 0,
  add column if not exists penalty_rate   numeric(5,2)  not null default 0;

alter table public.invoices
  add column if not exists use_payment_schedule boolean not null default false;
