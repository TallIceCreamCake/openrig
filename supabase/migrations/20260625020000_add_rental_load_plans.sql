-- 3D loading plan persisted per rental project.
--
-- Stored as a single JSON document: the list of vehicles (referencing catalog
-- presets) and, per vehicle, the placed objects with their transform
-- (position x/y/z, yaw rotation) and a self-contained snapshot of their
-- dimensions / weight / name. Editable only when the project is in edit mode;
-- read-only "preview" otherwise.

create table if not exists public.rental_load_plans (
  rental_id  uuid not null references public.rentals(id) on delete cascade,
  plan       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint rental_load_plans_pkey primary key (rental_id)
);
