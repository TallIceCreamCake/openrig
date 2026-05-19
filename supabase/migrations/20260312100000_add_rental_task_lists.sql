create table if not exists public.rental_task_lists (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  name text not null,
  semantic_key text check (semantic_key in ('todo', 'in_progress', 'done')),
  color text,
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text not null default 'Systeme',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_rental_task_lists_rental_sort
  on public.rental_task_lists (rental_id, sort_order, created_at);

create unique index if not exists idx_rental_task_lists_rental_semantic_key
  on public.rental_task_lists (rental_id, semantic_key)
  where semantic_key is not null;

drop trigger if exists trg_rental_task_lists_touch_updated_at on public.rental_task_lists;
create trigger trg_rental_task_lists_touch_updated_at
before update on public.rental_task_lists
for each row
execute function public.touch_updated_at_column();

alter table public.rental_tasks
  add column if not exists list_id uuid references public.rental_task_lists(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_rental_tasks_rental_list_sort
  on public.rental_tasks (rental_id, list_id, sort_order, created_at);

create or replace function public.ensure_rental_task_default_lists(
  p_rental_id uuid,
  p_actor_id uuid default null,
  p_actor_name text default 'Systeme'
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_actor_name text := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'Systeme');
begin
  if p_rental_id is null then
    return;
  end if;

  insert into public.rental_task_lists (rental_id, name, semantic_key, sort_order, created_by, created_by_name)
  select
    p_rental_id,
    defaults.name,
    defaults.semantic_key,
    defaults.sort_order,
    p_actor_id,
    v_actor_name
  from (
    values
      ('A faire'::text, 'todo'::text, 0),
      ('En cours'::text, 'in_progress'::text, 100),
      ('Termine'::text, 'done'::text, 200)
  ) as defaults(name, semantic_key, sort_order)
  where not exists (
    select 1
    from public.rental_task_lists l
    where l.rental_id = p_rental_id
      and l.semantic_key = defaults.semantic_key
  );

  update public.rental_tasks t
  set list_id = l.id
  from public.rental_task_lists l
  where t.rental_id = p_rental_id
    and l.rental_id = p_rental_id
    and t.list_id is null
    and l.semantic_key = t.status;
end;
$$;

create or replace function public.validate_rental_task_list_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_list_rental_id uuid;
  v_semantic_key text;
begin
  if new.list_id is null then
    return new;
  end if;

  select rental_id, semantic_key
    into v_list_rental_id, v_semantic_key
  from public.rental_task_lists
  where id = new.list_id;

  if v_list_rental_id is null then
    raise exception 'Linked task list does not exist: %', new.list_id;
  end if;

  if new.rental_id is not null and v_list_rental_id <> new.rental_id then
    raise exception 'Task list % is not linked to rental %', new.list_id, new.rental_id;
  end if;

  if v_semantic_key is not null then
    new.status := v_semantic_key::text;
  end if;

  new.sort_order := coalesce(new.sort_order, 0);
  return new;
end;
$$;

drop trigger if exists trg_validate_rental_task_list_link on public.rental_tasks;
create trigger trg_validate_rental_task_list_link
before insert or update of rental_id, list_id, status, sort_order
on public.rental_tasks
for each row
execute function public.validate_rental_task_list_link();

create or replace function public.propagate_rental_task_list_semantic_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.semantic_key is distinct from old.semantic_key and new.semantic_key is not null then
    update public.rental_tasks
    set status = new.semantic_key
    where list_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_propagate_rental_task_list_semantic_key on public.rental_task_lists;
create trigger trg_propagate_rental_task_list_semantic_key
after update of semantic_key
on public.rental_task_lists
for each row
execute function public.propagate_rental_task_list_semantic_key();

with rentals_with_tasks as (
  select distinct rental_id
  from public.rental_tasks
)
select public.ensure_rental_task_default_lists(rental_id) from rentals_with_tasks;

with ranked as (
  select
    t.id,
    row_number() over (
      partition by t.rental_id, t.list_id
      order by coalesce(t.starts_at, t.created_at), t.created_at, t.id
    ) as rn
  from public.rental_tasks t
)
update public.rental_tasks t
set sort_order = ranked.rn * 10
from ranked
where ranked.id = t.id;

alter table public.rental_task_lists enable row level security;

drop policy if exists "Anon full access rental_task_lists" on public.rental_task_lists;
create policy "Anon full access rental_task_lists"
  on public.rental_task_lists
  using (true)
  with check (true);

grant all on table public.rental_task_lists to anon;
grant all on table public.rental_task_lists to authenticated;
grant all on table public.rental_task_lists to service_role;

grant all on function public.ensure_rental_task_default_lists(uuid, uuid, text) to anon;
grant all on function public.ensure_rental_task_default_lists(uuid, uuid, text) to authenticated;
grant all on function public.ensure_rental_task_default_lists(uuid, uuid, text) to service_role;
