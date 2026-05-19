alter table public.equipment
  add column if not exists internal_location text;

alter table public.equipment_units
  add column if not exists internal_location text,
  add column if not exists internal_location_override boolean not null default false;

update public.equipment
set internal_location = nullif(btrim(coalesce(internal_location, '')), '')
where internal_location is not null;

update public.equipment_units
set internal_location = nullif(btrim(coalesce(internal_location, '')), '')
where internal_location is not null;

update public.equipment_units u
set internal_location = e.internal_location
from public.equipment e
where e.id = u.equipment_id
  and coalesce(u.internal_location_override, false) = false
  and (u.internal_location is null or btrim(u.internal_location) = '');

create or replace function public.apply_equipment_internal_location_to_units()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.internal_location is distinct from old.internal_location then
    update public.equipment_units
    set internal_location = new.internal_location
    where equipment_id = new.id
      and coalesce(internal_location_override, false) = false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_equipment_internal_location_to_units on public.equipment;
create trigger trg_apply_equipment_internal_location_to_units
after insert or update of internal_location on public.equipment
for each row
execute function public.apply_equipment_internal_location_to_units();

create or replace function public.default_equipment_unit_internal_location()
returns trigger
language plpgsql
as $$
declare
  v_equipment_location text;
begin
  new.internal_location := nullif(btrim(coalesce(new.internal_location, '')), '');

  if new.equipment_id is null then
    return new;
  end if;

  if coalesce(new.internal_location_override, false) = false then
    if new.internal_location is null then
      select nullif(btrim(coalesce(e.internal_location, '')), '')
        into v_equipment_location
      from public.equipment e
      where e.id = new.equipment_id;

      new.internal_location := v_equipment_location;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_default_equipment_unit_internal_location on public.equipment_units;
create trigger trg_default_equipment_unit_internal_location
before insert or update of equipment_id, internal_location, internal_location_override
on public.equipment_units
for each row
execute function public.default_equipment_unit_internal_location();
