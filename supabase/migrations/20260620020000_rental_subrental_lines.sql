create table if not exists public.rental_subrental_lines (
  id                 uuid    default gen_random_uuid() primary key,
  rental_id          uuid    references public.rentals(id) on delete cascade not null,
  subrental_item_id  uuid    references public.subrental_items(id) on delete set null,

  -- Infos copiées depuis le catalogue ou saisies manuellement
  name               text    not null,
  supplier_name      text    not null,

  -- Quantité et durée
  quantity           integer not null default 1 check (quantity > 0),
  days               integer not null default 1 check (days > 0),

  -- Coût que l'on paie au fournisseur (par unité par jour)
  unit_cost          numeric(10,2) not null default 0,

  -- Prix de vente au client (optionnel, pour refacturation)
  sell_price         numeric(10,2),

  -- Statut de commande
  status             text    not null default 'planned'
                     check (status in ('planned','ordered','confirmed','delivered','returned')),

  notes              text,
  created_at         timestamptz default now() not null
);

create index if not exists idx_rsl_rental   on public.rental_subrental_lines(rental_id);
create index if not exists idx_rsl_item     on public.rental_subrental_lines(subrental_item_id);

alter table public.rental_subrental_lines enable row level security;

create policy "Authenticated users manage rental_subrental_lines"
  on public.rental_subrental_lines for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
