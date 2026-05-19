create table if not exists public.rental_task_card_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.rental_task_cards(id) on delete cascade,
  title text not null,
  description text not null default '',
  is_completed boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text not null default 'Systeme',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint rental_task_card_items_title_not_blank check (btrim(title) <> '')
);

create index if not exists idx_rental_task_card_items_card_sort
  on public.rental_task_card_items (card_id, sort_order, created_at);

drop trigger if exists trg_rental_task_card_items_touch_updated_at on public.rental_task_card_items;
create trigger trg_rental_task_card_items_touch_updated_at
before update on public.rental_task_card_items
for each row
execute function public.touch_updated_at_column();

alter table public.rental_task_card_items enable row level security;

drop policy if exists "Anon full access rental_task_card_items" on public.rental_task_card_items;
create policy "Anon full access rental_task_card_items"
  on public.rental_task_card_items
  using (true)
  with check (true);

grant all on table public.rental_task_card_items to anon;
grant all on table public.rental_task_card_items to authenticated;
grant all on table public.rental_task_card_items to service_role;
