-- =====================================================================
-- E-invoicing compliance groundwork (réforme facture électronique FR)
-- - Legal identification fields on company_settings and clients
-- - Compliance fields on invoices (delivery date, VAT breakdown,
--   immutable party snapshots, finalization timestamp)
-- - Gapless yearly numbering sequence + RPC
-- - Immutability of finalized invoices (core fields + line items)
-- =====================================================================

-- 1. Seller identification ---------------------------------------------------
alter table public.company_settings
  add column if not exists vat_number text,
  add column if not exists legal_form text,
  add column if not exists rcs text;

-- 2. Buyer identification ----------------------------------------------------
alter table public.clients
  add column if not exists siren text,
  add column if not exists siret text,
  add column if not exists vat_number text,
  add column if not exists billing_address text,
  add column if not exists billing_email text;

-- 3. Invoice compliance fields ----------------------------------------------
alter table public.invoices
  add column if not exists delivery_date date,
  add column if not exists purchase_order_ref text,
  add column if not exists vat_breakdown jsonb,
  add column if not exists seller_snapshot jsonb,
  add column if not exists buyer_snapshot jsonb,
  add column if not exists finalized_at timestamp with time zone,
  add column if not exists finalized_by uuid references public.app_users(id) on delete set null;

-- 4. Gapless yearly numbering -------------------------------------------------
create table if not exists public.invoice_number_sequences (
  doc_kind text not null,
  year integer not null,
  counter integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  primary key (doc_kind, year)
);

-- Returns the next official number for a document kind ('invoice', 'quote',
-- 'credit_note', 'deposit_invoice'), gapless per kind and per year.
create or replace function public.next_invoice_number(p_doc_kind text default 'invoice')
returns text
language plpgsql
security definer
as $$
declare
  v_kind text := case
    when p_doc_kind in ('invoice', 'quote', 'credit_note', 'deposit_invoice') then p_doc_kind
    else 'invoice'
  end;
  v_year integer := extract(year from current_date)::integer;
  v_counter integer;
  v_prefix text := case v_kind
    when 'quote' then 'DE'
    when 'credit_note' then 'AV'
    when 'deposit_invoice' then 'FA'
    else 'FA'
  end;
begin
  insert into public.invoice_number_sequences as s (doc_kind, year, counter)
  values (v_kind, v_year, 1)
  on conflict (doc_kind, year)
  do update set counter = s.counter + 1, updated_at = now()
  returning counter into v_counter;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_counter::text, 5, '0');
end;
$$;

-- 5. Finalization -------------------------------------------------------------
-- Freezes an invoice: assigns an official gapless number when the current one
-- is missing or still a draft placeholder, snapshots both parties, computes
-- the VAT breakdown per rate from line items, and stamps finalized_at.
create or replace function public.finalize_invoice(
  p_invoice_id uuid,
  p_user_id uuid default null
)
returns public.invoices
language plpgsql
security definer
as $$
declare
  v_invoice public.invoices;
  v_company record;
  v_client record;
  v_breakdown jsonb;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  if v_invoice.finalized_at is not null then
    return v_invoice;
  end if;
  if v_invoice.document_type = 'quote' then
    raise exception 'cannot_finalize_quote';
  end if;

  select name, email, phone, address, siret, naf, capital, vat_number, legal_form, rcs
    into v_company
  from public.company_settings where id = 1;

  select id, name, company, email, phone, address, siren, siret, vat_number, billing_address, billing_email
    into v_client
  from public.clients where id = v_invoice.client_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'rate', t.tax_rate,
      'base_ht', t.base_ht,
      'vat_amount', t.vat_amount
    ) order by t.tax_rate),
    '[]'::jsonb
  )
  into v_breakdown
  from (
    select
      coalesce(tax_rate, 0) as tax_rate,
      round(sum(coalesce(total_ht, 0))::numeric, 2) as base_ht,
      round(sum(coalesce(total_ttc, 0) - coalesce(total_ht, 0))::numeric, 2) as vat_amount
    from public.invoice_line_items
    where invoice_id = p_invoice_id
      and line_type <> 'comment'
    group by coalesce(tax_rate, 0)
  ) t;

  update public.invoices
  set
    invoice_number = case
      when invoice_number is null or invoice_number = '' or invoice_number ilike 'brouillon%' or invoice_number ilike 'draft%'
        then public.next_invoice_number(document_type)
      else invoice_number
    end,
    seller_snapshot = to_jsonb(v_company),
    buyer_snapshot = to_jsonb(v_client),
    vat_breakdown = v_breakdown,
    delivery_date = coalesce(delivery_date, issue_date),
    finalized_at = now(),
    finalized_by = p_user_id,
    status = case when status = 'draft' then 'sent' else status end
  where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$;

-- 6. Immutability of finalized invoices ---------------------------------------
-- Core financial/identification fields are frozen once finalized; payment
-- tracking, status lifecycle and metadata stay writable.
create or replace function public.protect_finalized_invoice()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.finalized_at is not null then
      raise exception 'finalized_invoice_immutable';
    end if;
    return old;
  end if;

  if old.finalized_at is not null then
    if new.invoice_number is distinct from old.invoice_number
       or new.client_id is distinct from old.client_id
       or new.document_type is distinct from old.document_type
       or new.issue_date is distinct from old.issue_date
       or new.delivery_date is distinct from old.delivery_date
       or new.amount_ht is distinct from old.amount_ht
       or new.amount_ttc is distinct from old.amount_ttc
       or new.vat_amount is distinct from old.vat_amount
       or new.vat_breakdown is distinct from old.vat_breakdown
       or new.seller_snapshot is distinct from old.seller_snapshot
       or new.buyer_snapshot is distinct from old.buyer_snapshot
       or new.finalized_at is distinct from old.finalized_at
    then
      raise exception 'finalized_invoice_immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_finalized_invoice on public.invoices;
create trigger trg_protect_finalized_invoice
before update or delete on public.invoices
for each row
execute function public.protect_finalized_invoice();

create or replace function public.protect_finalized_invoice_lines()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_finalized timestamp with time zone;
begin
  select finalized_at into v_finalized from public.invoices where id = v_invoice_id;
  if v_finalized is not null then
    raise exception 'finalized_invoice_immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_finalized_invoice_lines on public.invoice_line_items;
create trigger trg_protect_finalized_invoice_lines
before insert or update or delete on public.invoice_line_items
for each row
execute function public.protect_finalized_invoice_lines();

grant execute on function public.next_invoice_number(text) to anon, authenticated, service_role;
grant execute on function public.finalize_invoice(uuid, uuid) to anon, authenticated, service_role;
grant select, insert, update on public.invoice_number_sequences to anon, authenticated, service_role;
