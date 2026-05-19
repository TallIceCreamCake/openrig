alter table rentals
  add column delivered_at timestamptz null;

alter table rentals
  add column delivery_confirmation_note text null;
