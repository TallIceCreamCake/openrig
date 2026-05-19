alter table rentals
  add column if not exists status_before_cancellation text null;
