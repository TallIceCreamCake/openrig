do $$
begin
  if to_regclass('public.rental_task_lists') is not null
    and to_regclass('public.rental_task_cards') is null then
    alter table public.rental_task_lists rename to rental_task_cards;
  end if;
end $$;

create table if not exists public.rental_task_cards (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  name text not null,
  base_color text,
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text not null default 'Systeme',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.rental_task_cards
  add column if not exists base_color text;

create index if not exists idx_rental_task_cards_rental_sort
  on public.rental_task_cards (rental_id, sort_order, created_at);

drop trigger if exists trg_rental_task_lists_touch_updated_at on public.rental_task_cards;
drop trigger if exists trg_rental_task_cards_touch_updated_at on public.rental_task_cards;
create trigger trg_rental_task_cards_touch_updated_at
before update on public.rental_task_cards
for each row
execute function public.touch_updated_at_column();

alter table public.rental_task_cards enable row level security;

drop policy if exists "Anon full access rental_task_lists" on public.rental_task_cards;
drop policy if exists "Anon full access rental_task_cards" on public.rental_task_cards;
create policy "Anon full access rental_task_cards"
  on public.rental_task_cards
  using (true)
  with check (true);

grant all on table public.rental_task_cards to anon;
grant all on table public.rental_task_cards to authenticated;
grant all on table public.rental_task_cards to service_role;
