create table if not exists public.subrental_items (
  id                uuid    default gen_random_uuid() primary key,

  -- Identification
  name              text    not null,
  category          text,
  description       text,

  -- Provenance / fournisseur
  supplier_name     text    not null,
  supplier_contact  text,
  supplier_email    text,
  supplier_phone    text,

  -- Tarifs que l'on paie au fournisseur
  day_rate          numeric(10,2),
  week_rate         numeric(10,2),

  -- Meta
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

create index if not exists idx_subrental_items_supplier  on public.subrental_items(supplier_name);
create index if not exists idx_subrental_items_active    on public.subrental_items(is_active);

alter table public.subrental_items enable row level security;

create policy "Authenticated users manage subrental_items"
  on public.subrental_items for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create or replace function public.set_subrental_items_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_subrental_items_updated_at
  before update on public.subrental_items
  for each row execute function public.set_subrental_items_updated_at();
