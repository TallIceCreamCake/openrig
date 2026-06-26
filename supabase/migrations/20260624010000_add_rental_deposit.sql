-- Security deposit (caution) tracking on rental projects.
--
-- Distinct from advance payments (acomptes / deposit_invoice): a caution is a
-- refundable guarantee taken at the start of a rental and returned at the end,
-- minus any amount retained for damage/loss. Lifecycle:
--   none → pending → held → returned | partially_retained | retained

alter table public.rentals
  add column if not exists deposit_amount          numeric(12,2) not null default 0,
  add column if not exists deposit_method          text,
  add column if not exists deposit_status          text not null default 'none',
  add column if not exists deposit_reference        text,
  add column if not exists deposit_held_at          date,
  add column if not exists deposit_returned_at      date,
  add column if not exists deposit_retained_amount  numeric(12,2) not null default 0,
  add column if not exists deposit_notes            text;

alter table public.rentals
  drop constraint if exists rentals_deposit_status_check;
alter table public.rentals
  add constraint rentals_deposit_status_check
  check (deposit_status in ('none', 'pending', 'held', 'partially_retained', 'retained', 'returned'));

alter table public.rentals
  drop constraint if exists rentals_deposit_method_check;
alter table public.rentals
  add constraint rentals_deposit_method_check
  check (deposit_method is null or deposit_method in ('cash', 'check', 'transfer', 'card_preauth', 'bank_hold', 'other'));
