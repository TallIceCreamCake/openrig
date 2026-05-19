ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS capital text,
  ADD COLUMN IF NOT EXISTS siret text,
  ADD COLUMN IF NOT EXISTS naf text;
