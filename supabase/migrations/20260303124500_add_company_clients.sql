alter table public.clients
  add column if not exists client_type text not null default 'person',
  add column if not exists company_client_id uuid references public.clients(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_client_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_client_type_check
      check (client_type in ('person', 'company'));
  end if;
end $$;

create index if not exists idx_clients_client_type
  on public.clients (client_type, created_at desc);

create index if not exists idx_clients_company_client_id
  on public.clients (company_client_id);

update public.clients
set client_type = 'person'
where client_type is null;

create or replace function public.sync_client_company_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_company_name text;
begin
  new.name := nullif(btrim(coalesce(new.name, '')), '');
  new.email := nullif(btrim(coalesce(new.email, '')), '');
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.address := nullif(btrim(coalesce(new.address, '')), '');
  new.image_url := nullif(btrim(coalesce(new.image_url, '')), '');
  new.company := nullif(btrim(coalesce(new.company, '')), '');
  new.client_type := coalesce(new.client_type, 'person');

  if new.client_type = 'company' then
    new.company_client_id := null;
    new.company := null;
    return new;
  end if;

  if new.company_client_id is not null then
    select c.name
      into v_company_name
    from public.clients c
    where c.id = new.company_client_id
      and c.client_type = 'company';

    if v_company_name is null then
      raise exception 'Linked company client does not exist: %', new.company_client_id;
    end if;

    new.company := v_company_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_client_company_fields on public.clients;
create trigger trg_sync_client_company_fields
before insert or update of name, email, phone, address, image_url, company, client_type, company_client_id
on public.clients
for each row
execute function public.sync_client_company_fields();

create or replace function public.propagate_company_client_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_type = 'company' and (tg_op = 'INSERT' or new.name is distinct from old.name) then
    update public.clients
    set company = new.name
    where company_client_id = new.id
      and client_type = 'person';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_propagate_company_client_name on public.clients;
create trigger trg_propagate_company_client_name
after insert or update of name on public.clients
for each row
execute function public.propagate_company_client_name();

create or replace function public.clear_deleted_company_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.client_type = 'company' then
    update public.clients
    set company = null
    where company_client_id = old.id
      and client_type = 'person';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_clear_deleted_company_links on public.clients;
create trigger trg_clear_deleted_company_links
before delete on public.clients
for each row
execute function public.clear_deleted_company_links();

update public.clients person
set company = company_row.name
from public.clients company_row
where person.company_client_id = company_row.id
  and person.client_type = 'person'
  and company_row.client_type = 'company';
