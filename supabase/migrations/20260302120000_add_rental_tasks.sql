create table if not exists public.rental_tasks (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  title text not null,
  description text,
  image_url text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text not null default 'Systeme',
  updated_by uuid references public.app_users(id) on delete set null,
  updated_by_name text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists idx_rental_tasks_rental_status
  on public.rental_tasks (rental_id, status, created_at desc);

create index if not exists idx_rental_tasks_rental_dates
  on public.rental_tasks (rental_id, starts_at, ends_at);

drop trigger if exists trg_rental_tasks_touch_updated_at on public.rental_tasks;
create trigger trg_rental_tasks_touch_updated_at
before update on public.rental_tasks
for each row
execute function public.touch_updated_at_column();

create table if not exists public.rental_task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.rental_tasks(id) on delete cascade,
  personnel_id uuid not null,
  created_at timestamp with time zone not null default now(),
  unique (task_id, personnel_id)
);

create index if not exists idx_rental_task_assignees_task
  on public.rental_task_assignees (task_id);

create index if not exists idx_rental_task_assignees_personnel
  on public.rental_task_assignees (personnel_id);

create table if not exists public.rental_task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.rental_tasks(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  is_completed boolean not null default false,
  completed_at timestamp with time zone,
  completed_by uuid references public.app_users(id) on delete set null,
  completed_by_name text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_rental_task_checklist_items_task_sort
  on public.rental_task_checklist_items (task_id, sort_order, created_at);

drop trigger if exists trg_rental_task_checklist_items_touch_updated_at on public.rental_task_checklist_items;
create trigger trg_rental_task_checklist_items_touch_updated_at
before update on public.rental_task_checklist_items
for each row
execute function public.touch_updated_at_column();

alter table public.rental_tasks enable row level security;
alter table public.rental_task_assignees enable row level security;
alter table public.rental_task_checklist_items enable row level security;

drop policy if exists "Anon full access rental_tasks" on public.rental_tasks;
create policy "Anon full access rental_tasks"
  on public.rental_tasks
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_task_assignees" on public.rental_task_assignees;
create policy "Anon full access rental_task_assignees"
  on public.rental_task_assignees
  using (true)
  with check (true);

drop policy if exists "Anon full access rental_task_checklist_items" on public.rental_task_checklist_items;
create policy "Anon full access rental_task_checklist_items"
  on public.rental_task_checklist_items
  using (true)
  with check (true);

grant all on table public.rental_tasks to anon;
grant all on table public.rental_tasks to authenticated;
grant all on table public.rental_tasks to service_role;

grant all on table public.rental_task_assignees to anon;
grant all on table public.rental_task_assignees to authenticated;
grant all on table public.rental_task_assignees to service_role;

grant all on table public.rental_task_checklist_items to anon;
grant all on table public.rental_task_checklist_items to authenticated;
grant all on table public.rental_task_checklist_items to service_role;
