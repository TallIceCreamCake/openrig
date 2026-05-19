ALTER TABLE public.rental_items
ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0 NOT NULL;
