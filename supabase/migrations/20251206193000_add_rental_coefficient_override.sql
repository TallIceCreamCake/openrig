alter table public.rentals
  add column if not exists rental_coefficient_override numeric null;
