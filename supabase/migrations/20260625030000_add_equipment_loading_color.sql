-- Per-equipment colour used in the 3D loading view / PDF plots.
-- (Dimensions length_cm/width_cm/height_cm already exist from a prior migration.)

alter table public.equipment
  add column if not exists loading_color text;
