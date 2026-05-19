alter table public.rental_task_card_items
  add column if not exists check_state text;

update public.rental_task_card_items
set check_state = case
  when is_completed then 'green'
  else 'empty'
end
where check_state is null
   or btrim(check_state) = ''
   or check_state not in ('empty', 'red', 'orange', 'green');

alter table public.rental_task_card_items
  alter column check_state set default 'empty';

update public.rental_task_card_items
set check_state = 'empty'
where check_state is null;

alter table public.rental_task_card_items
  alter column check_state set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rental_task_card_items_check_state_check'
      and conrelid = 'public.rental_task_card_items'::regclass
  ) then
    alter table public.rental_task_card_items
      add constraint rental_task_card_items_check_state_check
      check (check_state in ('empty', 'red', 'orange', 'green'));
  end if;
end $$;

create or replace function public.sync_rental_task_card_item_check_state()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and new.check_state is not distinct from old.check_state
    and new.is_completed is distinct from old.is_completed then
    new.check_state := case when coalesce(new.is_completed, false) then 'green' else 'empty' end;
  end if;

  new.check_state := lower(btrim(coalesce(new.check_state, '')));
  if new.check_state = '' then
    new.check_state := case when coalesce(new.is_completed, false) then 'green' else 'empty' end;
  end if;

  if new.check_state not in ('empty', 'red', 'orange', 'green') then
    raise exception 'Invalid check_state value: %', new.check_state;
  end if;

  new.is_completed := (new.check_state = 'green');
  return new;
end;
$$;

drop trigger if exists trg_sync_rental_task_card_item_check_state on public.rental_task_card_items;
create trigger trg_sync_rental_task_card_item_check_state
before insert or update of check_state, is_completed
on public.rental_task_card_items
for each row
execute function public.sync_rental_task_card_item_check_state();
