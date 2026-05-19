-- Enforce TTC-only accounting values when auto-entrepreneur mode is enabled

alter table if exists public.company_settings
  add column if not exists is_auto_entrepreneur boolean not null default false;

create or replace function public.is_auto_entrepreneur_mode_enabled()
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select cs.is_auto_entrepreneur
      from public.company_settings cs
      where cs.id = 1
      limit 1
    ),
    false
  );
$$;

create or replace function public.enforce_auto_entrepreneur_ttc_only()
returns trigger
language plpgsql
as $$
declare
  v_mode_enabled boolean := false;
  v_amount numeric;
begin
  select public.is_auto_entrepreneur_mode_enabled()
    into v_mode_enabled;

  if v_mode_enabled is not true then
    return new;
  end if;

  if tg_table_name = 'equipment' then
    v_amount := coalesce(new.rental_price_ttc, new.rental_price_ht, 0);
    new.rental_price_ttc := v_amount;
    new.rental_price_ht := v_amount;
    return new;
  end if;

  if tg_table_name = 'invoices' then
    v_amount := coalesce(new.amount_ttc, new.amount_ht, 0);
    new.amount_ttc := v_amount;
    new.amount_ht := v_amount;
    new.vat_amount := 0;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_auto_entrepreneur_ttc_on_equipment on public.equipment;
create trigger trg_enforce_auto_entrepreneur_ttc_on_equipment
before insert or update on public.equipment
for each row
execute function public.enforce_auto_entrepreneur_ttc_only();

drop trigger if exists trg_enforce_auto_entrepreneur_ttc_on_invoices on public.invoices;
create trigger trg_enforce_auto_entrepreneur_ttc_on_invoices
before insert or update on public.invoices
for each row
execute function public.enforce_auto_entrepreneur_ttc_only();

create or replace function public.apply_auto_entrepreneur_ttc_only_backfill()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_auto_entrepreneur, false) then
      update public.equipment
      set
        rental_price_ttc = coalesce(rental_price_ttc, rental_price_ht, 0),
        rental_price_ht = coalesce(rental_price_ttc, rental_price_ht, 0);

      update public.invoices
      set
        amount_ttc = coalesce(amount_ttc, amount_ht, 0),
        amount_ht = coalesce(amount_ttc, amount_ht, 0),
        vat_amount = 0;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(new.is_auto_entrepreneur, false)
       and coalesce(old.is_auto_entrepreneur, false) is distinct from true then
      update public.equipment
      set
        rental_price_ttc = coalesce(rental_price_ttc, rental_price_ht, 0),
        rental_price_ht = coalesce(rental_price_ttc, rental_price_ht, 0);

      update public.invoices
      set
        amount_ttc = coalesce(amount_ttc, amount_ht, 0),
        amount_ht = coalesce(amount_ttc, amount_ht, 0),
        vat_amount = 0;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_auto_entrepreneur_ttc_only_backfill on public.company_settings;
create trigger trg_apply_auto_entrepreneur_ttc_only_backfill
after insert or update of is_auto_entrepreneur on public.company_settings
for each row
execute function public.apply_auto_entrepreneur_ttc_only_backfill();

do $$
begin
  if public.is_auto_entrepreneur_mode_enabled() then
    update public.equipment
    set
      rental_price_ttc = coalesce(rental_price_ttc, rental_price_ht, 0),
      rental_price_ht = coalesce(rental_price_ttc, rental_price_ht, 0);

    update public.invoices
    set
      amount_ttc = coalesce(amount_ttc, amount_ht, 0),
      amount_ht = coalesce(amount_ttc, amount_ht, 0),
      vat_amount = 0;
  end if;
end;
$$;
