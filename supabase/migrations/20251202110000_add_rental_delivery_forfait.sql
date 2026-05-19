alter table rentals
  add column if not exists delivery_offer_id uuid references delivery_offers(id) on delete set null,
  add column if not exists delivery_offer_name text,
  add column if not exists delivery_pricing_type text,
  add column if not exists delivery_rate_amount numeric,
  add column if not exists delivery_base_amount numeric,
  add column if not exists delivery_quantity numeric,
  add column if not exists delivery_round_trip boolean default false,
  add column if not exists delivery_total_amount numeric;
