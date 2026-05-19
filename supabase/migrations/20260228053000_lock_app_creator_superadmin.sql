alter table if exists public.app_users
  add column if not exists is_app_creator boolean not null default false;

with first_user as (
  select u.id
  from public.app_users u
  order by u.created_at asc, u.id asc
  limit 1
)
update public.app_users u
set is_app_creator = true
from first_user
where u.id = first_user.id
  and not exists (
    select 1
    from public.app_users existing_creator
    where existing_creator.is_app_creator = true
  );

create or replace function public.assign_app_creator_on_first_user()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.app_users u
    where u.is_app_creator = true
  ) then
    new.is_app_creator := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_app_creator_on_first_user on public.app_users;
create trigger trg_assign_app_creator_on_first_user
before insert on public.app_users
for each row
execute function public.assign_app_creator_on_first_user();

insert into public.app_permissions (user_id, superadmin)
select u.id, true
from public.app_users u
where u.is_app_creator = true
on conflict (user_id)
do update set superadmin = true;

create or replace function public.enforce_app_creator_superadmin()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.app_users u
    where u.id = new.user_id
      and u.is_app_creator = true
  ) then
    new.superadmin := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_app_creator_superadmin on public.app_permissions;
create trigger trg_enforce_app_creator_superadmin
before insert or update on public.app_permissions
for each row
execute function public.enforce_app_creator_superadmin();

create or replace function public.prevent_app_creator_permissions_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.app_users u
    where u.id = old.user_id
      and u.is_app_creator = true
  ) then
    raise exception 'Cannot delete permissions for app creator';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_app_creator_permissions_delete on public.app_permissions;
create trigger trg_prevent_app_creator_permissions_delete
before delete on public.app_permissions
for each row
execute function public.prevent_app_creator_permissions_delete();
