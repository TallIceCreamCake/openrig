-- Fix: activer/désactiver le mode auto-entrepreneur échouait avec
-- "UPDATE requires a WHERE clause" (extension safeupdate de PostgREST) car le
-- backfill faisait des UPDATE globaux sans WHERE. Ces UPDATE touchaient aussi
-- les factures finalisées, désormais immuables. Les clauses WHERE ne ciblent
-- plus que les lignes réellement non conformes, et les factures finalisées
-- sont exclues du backfill comme de la normalisation par ligne.

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
    -- Une facture finalisée est immuable : on ne touche plus à ses montants.
    if new.finalized_at is not null then
      return new;
    end if;
    v_amount := coalesce(new.amount_ttc, new.amount_ht, 0);
    new.amount_ttc := v_amount;
    new.amount_ht := v_amount;
    new.vat_amount := 0;
    return new;
  end if;

  return new;
end;
$$;

create or replace function public.apply_auto_entrepreneur_ttc_only_backfill()
returns trigger
language plpgsql
as $$
declare
  v_just_enabled boolean := false;
begin
  if tg_op = 'INSERT' then
    v_just_enabled := coalesce(new.is_auto_entrepreneur, false);
  elsif tg_op = 'UPDATE' then
    v_just_enabled := coalesce(new.is_auto_entrepreneur, false)
      and coalesce(old.is_auto_entrepreneur, false) is distinct from true;
  end if;

  if v_just_enabled then
    update public.equipment
    set
      rental_price_ttc = coalesce(rental_price_ttc, rental_price_ht, 0),
      rental_price_ht = coalesce(rental_price_ttc, rental_price_ht, 0)
    where rental_price_ht is distinct from coalesce(rental_price_ttc, rental_price_ht, 0)
       or rental_price_ttc is distinct from coalesce(rental_price_ttc, rental_price_ht, 0);

    update public.invoices
    set
      amount_ttc = coalesce(amount_ttc, amount_ht, 0),
      amount_ht = coalesce(amount_ttc, amount_ht, 0),
      vat_amount = 0
    where finalized_at is null
      and (
        amount_ht is distinct from coalesce(amount_ttc, amount_ht, 0)
        or vat_amount is distinct from 0
      );
  end if;

  return new;
end;
$$;
