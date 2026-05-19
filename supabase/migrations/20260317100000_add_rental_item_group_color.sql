-- Add color column to rental_item_groups for Rentman-style colored group indicators
alter table public.rental_item_groups
  add column if not exists color text default null;
