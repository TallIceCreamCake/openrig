ALTER TABLE public.rentals
  DROP CONSTRAINT IF EXISTS rentals_type_check;

ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_type_check
  CHECK (type = ANY (ARRAY['rental'::text, 'service'::text, 'sale'::text]));

CREATE OR REPLACE FUNCTION public.generate_rental_reference(p_type text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text := CASE
    WHEN p_type = 'service' THEN 'PR'
    WHEN p_type = 'sale' THEN 'VEN'
    ELSE 'LOC'
  END;
  v_seq bigint;
BEGIN
  v_seq := nextval('rental_reference_seq');
  RETURN v_prefix || lpad(v_seq::text, 5, '0');
END;
$$;
