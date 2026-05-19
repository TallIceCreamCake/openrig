-- Advanced invoicing system:
-- - structured line items
-- - payment schedules
-- - payment allocations
-- - reminders
-- - credit notes
-- - status history and financial overview

-- 1) Extend invoices and payments
alter table if exists public.invoices
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists document_type text not null default 'invoice',
  add column if not exists quote_status text not null default 'none',
  add column if not exists issue_date date not null default current_date,
  add column if not exists sent_at timestamp with time zone,
  add column if not exists cancelled_at timestamp with time zone,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists balance_due numeric(12,2) not null default 0,
  add column if not exists currency text not null default 'EUR',
  add column if not exists payment_terms_days integer not null default 30,
  add column if not exists payment_terms_label text,
  add column if not exists external_reference text,
  add column if not exists parent_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.invoices') is not null then
    alter table public.invoices
      drop constraint if exists invoices_document_type_check;

    alter table public.invoices
      add constraint invoices_document_type_check
      check (document_type in ('invoice', 'quote', 'credit_note', 'deposit_invoice'));

    alter table public.invoices
      drop constraint if exists invoices_quote_status_check;

    alter table public.invoices
      add constraint invoices_quote_status_check
      check (quote_status in ('none', 'draft', 'sent', 'accepted', 'rejected', 'expired'));

    alter table public.invoices
      drop constraint if exists invoices_payment_terms_days_check;

    alter table public.invoices
      add constraint invoices_payment_terms_days_check
      check (payment_terms_days >= 0 and payment_terms_days <= 3650);

    alter table public.invoices
      drop constraint if exists invoices_paid_amount_check;

    alter table public.invoices
      add constraint invoices_paid_amount_check
      check (paid_amount >= 0);

    alter table public.invoices
      drop constraint if exists invoices_balance_due_check;

    alter table public.invoices
      add constraint invoices_balance_due_check
      check (balance_due >= 0);
  end if;
end;
$$;

update public.invoices
set
  issue_date = coalesce(issue_date, created_at::date, current_date),
  document_type = case
    when status = 'draft' then 'quote'
    else coalesce(document_type, 'invoice')
  end,
  quote_status = case
    when status = 'draft' then 'draft'
    when document_type = 'quote' and status = 'cancelled' then 'rejected'
    when document_type = 'quote' and status in ('sent', 'overdue') then 'sent'
    when document_type = 'quote' and status = 'paid' then 'accepted'
    when document_type = 'quote' then coalesce(nullif(quote_status, 'none'), 'draft')
    else 'none'
  end,
  payment_terms_days = greatest(coalesce(payment_terms_days, 30), 0),
  paid_amount = greatest(coalesce(paid_amount, 0), 0),
  balance_due = greatest(coalesce(balance_due, amount_ttc, 0), 0),
  currency = coalesce(nullif(currency, ''), 'EUR');

alter table if exists public.payments
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists currency text not null default 'EUR',
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
declare
  v_payment_type_check text;
begin
  select conname
    into v_payment_type_check
  from pg_constraint
  where conrelid = 'public.payments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%payment_type%';

  if v_payment_type_check is not null then
    execute format('alter table public.payments drop constraint %I', v_payment_type_check);
  end if;
end;
$$;

alter table public.payments
  add constraint payments_payment_type_check
  check (payment_type in ('deposit', 'payment', 'refund', 'credit_note', 'adjustment'));

drop trigger if exists trg_invoices_touch_updated_at on public.invoices;
create trigger trg_invoices_touch_updated_at
before update on public.invoices
for each row
execute function public.touch_updated_at_column();

drop trigger if exists trg_payments_touch_updated_at on public.payments;
create trigger trg_payments_touch_updated_at
before update on public.payments
for each row
execute function public.touch_updated_at_column();

create index if not exists idx_invoices_document_type_status
  on public.invoices (document_type, status, due_date);

create index if not exists idx_invoices_parent_invoice
  on public.invoices (parent_invoice_id);

-- 2) Structured invoice lines
create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  line_order integer not null default 100,
  line_type text not null default 'item' check (line_type in ('item', 'service', 'discount', 'shipping', 'comment')),
  description text not null default 'Ligne',
  quantity numeric(12,3) not null default 1,
  unit_price_ttc numeric(12,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  total_ht numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (quantity >= 0),
  check (unit_price_ttc >= 0),
  check (discount_percent >= 0 and discount_percent <= 100),
  check (tax_rate >= 0)
);

create index if not exists idx_invoice_line_items_invoice_order
  on public.invoice_line_items (invoice_id, line_order, created_at);

drop trigger if exists trg_invoice_line_items_touch_updated_at on public.invoice_line_items;
create trigger trg_invoice_line_items_touch_updated_at
before update on public.invoice_line_items
for each row
execute function public.touch_updated_at_column();

create or replace function public.normalize_invoice_line_item()
returns trigger
language plpgsql
as $$
declare
  v_subtotal numeric(12,2);
  v_discounted_ttc numeric(12,2);
begin
  new.description := coalesce(nullif(trim(coalesce(new.description, '')), ''), 'Ligne');
  new.line_order := coalesce(new.line_order, 100);

  if coalesce(new.line_type, 'item') = 'comment' then
    new.quantity := 0;
    new.unit_price_ttc := 0;
    new.discount_percent := 0;
    new.tax_rate := 0;
    new.total_ht := 0;
    new.total_ttc := 0;
    return new;
  end if;

  new.quantity := greatest(coalesce(new.quantity, 0), 0);
  new.unit_price_ttc := greatest(coalesce(new.unit_price_ttc, 0), 0);
  new.discount_percent := least(greatest(coalesce(new.discount_percent, 0), 0), 100);
  new.tax_rate := greatest(coalesce(new.tax_rate, 0), 0);

  v_subtotal := round((new.quantity * new.unit_price_ttc)::numeric, 2);
  v_discounted_ttc := round((v_subtotal * (1 - new.discount_percent / 100.0))::numeric, 2);

  new.total_ttc := greatest(v_discounted_ttc, 0);
  if new.tax_rate > 0 then
    new.total_ht := round((new.total_ttc / (1 + new.tax_rate / 100.0))::numeric, 2);
  else
    new.total_ht := new.total_ttc;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_invoice_line_item on public.invoice_line_items;
create trigger trg_normalize_invoice_line_item
before insert or update on public.invoice_line_items
for each row
execute function public.normalize_invoice_line_item();

-- 3) Payment schedules, allocations, reminders, status history
create table if not exists public.invoice_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  installment_no integer not null,
  label text,
  due_date date not null,
  due_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  last_reminder_at timestamp with time zone,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (invoice_id, installment_no),
  check (due_amount >= 0),
  check (paid_amount >= 0)
);

create index if not exists idx_invoice_payment_schedules_invoice_due
  on public.invoice_payment_schedules (invoice_id, status, due_date);

drop trigger if exists trg_invoice_payment_schedules_touch_updated_at on public.invoice_payment_schedules;
create trigger trg_invoice_payment_schedules_touch_updated_at
before update on public.invoice_payment_schedules
for each row
execute function public.touch_updated_at_column();

create table if not exists public.invoice_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  schedule_id uuid references public.invoice_payment_schedules(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  allocated_at timestamp with time zone not null default now(),
  allocated_by uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_invoice_payment_allocations_invoice
  on public.invoice_payment_allocations (invoice_id, allocated_at desc);

create index if not exists idx_invoice_payment_allocations_schedule
  on public.invoice_payment_allocations (schedule_id, allocated_at desc);

create index if not exists idx_invoice_payment_allocations_payment
  on public.invoice_payment_allocations (payment_id);

create table if not exists public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  schedule_id uuid references public.invoice_payment_schedules(id) on delete set null,
  reminder_type text not null default 'custom' check (reminder_type in ('due_soon', 'overdue_1', 'overdue_2', 'final_notice', 'custom')),
  channel text not null default 'manual' check (channel in ('email', 'sms', 'manual', 'other')),
  status text not null default 'planned' check (status in ('planned', 'sent', 'failed', 'cancelled')),
  planned_for timestamp with time zone,
  sent_at timestamp with time zone,
  recipient text,
  subject text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_invoice_reminders_invoice_status
  on public.invoice_reminders (invoice_id, status, planned_for);

drop trigger if exists trg_invoice_reminders_touch_updated_at on public.invoice_reminders;
create trigger trg_invoice_reminders_touch_updated_at
before update on public.invoice_reminders
for each row
execute function public.touch_updated_at_column();

create table if not exists public.invoice_status_history (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  changed_at timestamp with time zone not null default now()
);

create index if not exists idx_invoice_status_history_invoice_changed_at
  on public.invoice_status_history (invoice_id, changed_at desc);

-- 4) Lifecycle/business rules and recompute helpers
create or replace function public.enforce_invoice_document_rules()
returns trigger
language plpgsql
as $$
begin
  new.document_type := coalesce(new.document_type, 'invoice');
  new.quote_status := coalesce(new.quote_status, 'none');
  new.issue_date := coalesce(new.issue_date, coalesce(new.created_at, now())::date);
  new.currency := coalesce(nullif(new.currency, ''), 'EUR');
  new.payment_terms_days := greatest(coalesce(new.payment_terms_days, 30), 0);
  new.paid_amount := greatest(coalesce(new.paid_amount, 0), 0);
  new.balance_due := greatest(coalesce(new.balance_due, 0), 0);

  if new.document_type = 'quote' then
    if new.quote_status = 'none' then
      new.quote_status := case
        when coalesce(new.status, 'draft') = 'draft' then 'draft'
        else 'sent'
      end;
    end if;
    if new.status = 'paid' then
      new.status := 'sent';
    end if;
  else
    new.quote_status := 'none';
  end if;

  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  end if;

  if tg_op = 'UPDATE'
     and old.status is distinct from 'cancelled'
     and new.status = 'cancelled'
     and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_invoice_document_rules on public.invoices;
create trigger trg_enforce_invoice_document_rules
before insert or update on public.invoices
for each row
execute function public.enforce_invoice_document_rules();

create or replace function public.recompute_invoice_payment_schedule_status(p_invoice_id uuid)
returns void
language plpgsql
as $$
begin
  update public.invoice_payment_schedules s
  set
    paid_amount = coalesce((
      select sum(a.amount)
      from public.invoice_payment_allocations a
      join public.payments p on p.id = a.payment_id
      where a.schedule_id = s.id
        and coalesce(p.status, 'pending') = 'completed'
    ), 0)::numeric(12,2),
    status = case
      when s.status = 'cancelled' then 'cancelled'
      when coalesce((
        select sum(a.amount)
        from public.invoice_payment_allocations a
        join public.payments p on p.id = a.payment_id
        where a.schedule_id = s.id
          and coalesce(p.status, 'pending') = 'completed'
      ), 0) >= s.due_amount and s.due_amount > 0 then 'paid'
      when coalesce((
        select sum(a.amount)
        from public.invoice_payment_allocations a
        join public.payments p on p.id = a.payment_id
        where a.schedule_id = s.id
          and coalesce(p.status, 'pending') = 'completed'
      ), 0) > 0 and s.due_date < current_date then 'overdue'
      when coalesce((
        select sum(a.amount)
        from public.invoice_payment_allocations a
        join public.payments p on p.id = a.payment_id
        where a.schedule_id = s.id
          and coalesce(p.status, 'pending') = 'completed'
      ), 0) > 0 then 'partially_paid'
      when s.due_date < current_date then 'overdue'
      else 'pending'
    end,
    updated_at = now()
  where s.invoice_id = p_invoice_id;

  update public.invoices i
  set due_date = nd.next_due
  from (
    select min(due_date) as next_due
    from public.invoice_payment_schedules
    where invoice_id = p_invoice_id
      and status in ('pending', 'partially_paid', 'overdue')
  ) nd
  where i.id = p_invoice_id
    and nd.next_due is not null;
end;
$$;

create or replace function public.recompute_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_invoice public.invoices%rowtype;
  v_line_count integer := 0;
  v_lines_total_ht numeric(12,2) := 0;
  v_lines_total_ttc numeric(12,2) := 0;
  v_paid_total numeric(12,2) := 0;
  v_credit_total numeric(12,2) := 0;
  v_amount_ht numeric(12,2) := 0;
  v_amount_ttc numeric(12,2) := 0;
  v_vat numeric(12,2) := 0;
  v_balance numeric(12,2) := 0;
  v_auto_entrepreneur boolean := false;
begin
  select *
    into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    return;
  end if;

  select
    count(*)::int,
    coalesce(sum(total_ht), 0)::numeric(12,2),
    coalesce(sum(total_ttc), 0)::numeric(12,2)
  into
    v_line_count,
    v_lines_total_ht,
    v_lines_total_ttc
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  if v_line_count > 0 then
    v_amount_ht := v_lines_total_ht;
    v_amount_ttc := v_lines_total_ttc;
  else
    v_amount_ht := coalesce(v_invoice.amount_ht, 0);
    v_amount_ttc := coalesce(v_invoice.amount_ttc, 0);
  end if;

  select coalesce(sum(a.amount), 0)::numeric(12,2)
    into v_paid_total
  from public.invoice_payment_allocations a
  join public.payments p on p.id = a.payment_id
  where a.invoice_id = p_invoice_id
    and coalesce(p.status, 'pending') = 'completed';

  select coalesce(sum(i.amount_ttc), 0)::numeric(12,2)
    into v_credit_total
  from public.invoices i
  where i.parent_invoice_id = p_invoice_id
    and i.document_type = 'credit_note'
    and i.status <> 'cancelled';

  begin
    if to_regprocedure('public.is_auto_entrepreneur_mode_enabled()') is not null then
      execute 'select public.is_auto_entrepreneur_mode_enabled()' into v_auto_entrepreneur;
    end if;
  exception
    when others then
      v_auto_entrepreneur := false;
  end;

  if coalesce(v_auto_entrepreneur, false) then
    v_amount_ht := v_amount_ttc;
    v_vat := 0;
  else
    v_vat := greatest(v_amount_ttc - v_amount_ht, 0);
  end if;

  v_balance := greatest(v_amount_ttc - v_paid_total - v_credit_total, 0);

  update public.invoices
  set
    amount_ht = v_amount_ht,
    amount_ttc = v_amount_ttc,
    vat_amount = v_vat,
    paid_amount = greatest(v_paid_total, 0),
    balance_due = greatest(v_balance, 0),
    paid_date = case
      when document_type <> 'quote'
           and greatest(v_balance, 0) <= 0
           and v_amount_ttc > 0 then coalesce(paid_date, current_date)
      when greatest(v_balance, 0) > 0 then null
      else paid_date
    end,
    status = case
      when status = 'cancelled' then status
      when document_type = 'quote' then status
      when greatest(v_balance, 0) <= 0 and v_amount_ttc > 0 then 'paid'
      when status = 'paid' and greatest(v_balance, 0) > 0 then 'sent'
      when coalesce(due_date, current_date) < current_date
           and greatest(v_balance, 0) > 0
           and status in ('sent', 'overdue', 'paid') then 'overdue'
      when status = 'draft'
           and document_type in ('invoice', 'deposit_invoice')
           and v_amount_ttc > 0 then 'sent'
      else status
    end
  where id = p_invoice_id;

  perform public.recompute_invoice_payment_schedule_status(p_invoice_id);
end;
$$;

create or replace function public.trg_recompute_invoice_totals_from_lines()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_invoice_totals(new.invoice_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.invoice_id is distinct from new.invoice_id then
      perform public.recompute_invoice_totals(old.invoice_id);
    end if;
    perform public.recompute_invoice_totals(new.invoice_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_invoice_totals(old.invoice_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recompute_invoice_totals_from_lines on public.invoice_line_items;
create trigger trg_recompute_invoice_totals_from_lines
after insert or update or delete on public.invoice_line_items
for each row
execute function public.trg_recompute_invoice_totals_from_lines();

create or replace function public.trg_recompute_invoice_totals_from_allocations()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_invoice_totals(new.invoice_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.invoice_id is distinct from new.invoice_id then
      perform public.recompute_invoice_totals(old.invoice_id);
    end if;
    perform public.recompute_invoice_totals(new.invoice_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_invoice_totals(old.invoice_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recompute_invoice_totals_from_allocations on public.invoice_payment_allocations;
create trigger trg_recompute_invoice_totals_from_allocations
after insert or update or delete on public.invoice_payment_allocations
for each row
execute function public.trg_recompute_invoice_totals_from_allocations();

create or replace function public.trg_recompute_invoice_totals_from_payments()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.invoice_id is not null then
      perform public.recompute_invoice_totals(new.invoice_id);
    end if;
    for v_invoice_id in
      select distinct a.invoice_id
      from public.invoice_payment_allocations a
      where a.payment_id = new.id
    loop
      perform public.recompute_invoice_totals(v_invoice_id);
    end loop;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.invoice_id is not null and old.invoice_id is distinct from new.invoice_id then
      perform public.recompute_invoice_totals(old.invoice_id);
    end if;
    if new.invoice_id is not null then
      perform public.recompute_invoice_totals(new.invoice_id);
    end if;
    for v_invoice_id in
      select distinct a.invoice_id
      from public.invoice_payment_allocations a
      where a.payment_id in (old.id, new.id)
    loop
      perform public.recompute_invoice_totals(v_invoice_id);
    end loop;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.invoice_id is not null then
      perform public.recompute_invoice_totals(old.invoice_id);
    end if;
    for v_invoice_id in
      select distinct a.invoice_id
      from public.invoice_payment_allocations a
      where a.payment_id = old.id
    loop
      perform public.recompute_invoice_totals(v_invoice_id);
    end loop;
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recompute_invoice_totals_from_payments on public.payments;
create trigger trg_recompute_invoice_totals_from_payments
after insert or update or delete on public.payments
for each row
execute function public.trg_recompute_invoice_totals_from_payments();

create or replace function public.trg_log_invoice_status_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.invoice_status_history (
      invoice_id,
      old_status,
      new_status,
      changed_at,
      metadata
    )
    values (
      new.id,
      old.status,
      new.status,
      now(),
      jsonb_build_object(
        'document_type', new.document_type,
        'quote_status', new.quote_status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_invoice_status_history on public.invoices;
create trigger trg_log_invoice_status_history
after update on public.invoices
for each row
execute function public.trg_log_invoice_status_history();

-- 5) RPC helpers for complete invoicing workflows
create or replace function public.replace_invoice_line_items(
  p_invoice_id uuid,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_row record;
  v_count integer := 0;
  v_invoice public.invoices%rowtype;
begin
  select *
    into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id;
  end if;

  delete from public.invoice_line_items
  where invoice_id = p_invoice_id;

  for v_row in
    select value as row_data, ordinality
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality
  loop
    insert into public.invoice_line_items (
      invoice_id,
      line_order,
      line_type,
      description,
      quantity,
      unit_price_ttc,
      discount_percent,
      tax_rate,
      metadata
    )
    values (
      p_invoice_id,
      coalesce((v_row.row_data->>'line_order')::int, v_row.ordinality::int),
      coalesce(nullif(v_row.row_data->>'line_type', ''), 'item'),
      coalesce(v_row.row_data->>'description', 'Ligne'),
      coalesce((v_row.row_data->>'quantity')::numeric, 1),
      coalesce(
        (v_row.row_data->>'unit_price_ttc')::numeric,
        (v_row.row_data->>'unitPrice')::numeric,
        0
      ),
      coalesce(
        (v_row.row_data->>'discount_percent')::numeric,
        (v_row.row_data->>'discountPercent')::numeric,
        0
      ),
      coalesce(
        (v_row.row_data->>'tax_rate')::numeric,
        (v_row.row_data->>'taxRate')::numeric,
        0
      ),
      coalesce(v_row.row_data, '{}'::jsonb)
    );
    v_count := v_count + 1;
  end loop;

  perform public.recompute_invoice_totals(p_invoice_id);

  return jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'line_count', v_count
  );
end;
$$;

create or replace function public.replace_invoice_payment_schedule(
  p_invoice_id uuid,
  p_schedule jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_row record;
  v_invoice public.invoices%rowtype;
  v_count integer := 0;
  v_total_schedule numeric(12,2) := 0;
  v_due_date date;
begin
  select *
    into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id;
  end if;

  if exists (
    select 1
    from public.invoice_payment_allocations a
    join public.invoice_payment_schedules s on s.id = a.schedule_id
    where s.invoice_id = p_invoice_id
  ) then
    raise exception 'Cannot replace schedule for invoice %: allocations already exist', p_invoice_id;
  end if;

  delete from public.invoice_payment_schedules
  where invoice_id = p_invoice_id;

  if coalesce(v_invoice.document_type, 'invoice') = 'credit_note' then
    return jsonb_build_object(
      'ok', true,
      'invoice_id', p_invoice_id,
      'schedule_count', 0
    );
  end if;

  for v_row in
    select value as row_data, ordinality
    from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) with ordinality
  loop
    v_due_date := coalesce(
      (v_row.row_data->>'due_date')::date,
      v_invoice.due_date,
      v_invoice.issue_date + greatest(coalesce(v_invoice.payment_terms_days, 30), 0)
    );

    insert into public.invoice_payment_schedules (
      invoice_id,
      installment_no,
      label,
      due_date,
      due_amount,
      status,
      metadata
    )
    values (
      p_invoice_id,
      v_row.ordinality::int,
      nullif(v_row.row_data->>'label', ''),
      v_due_date,
      greatest(coalesce((v_row.row_data->>'due_amount')::numeric, (v_row.row_data->>'amount')::numeric, 0), 0),
      'pending',
      coalesce(v_row.row_data, '{}'::jsonb)
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 and coalesce(v_invoice.amount_ttc, 0) > 0 then
    insert into public.invoice_payment_schedules (
      invoice_id,
      installment_no,
      label,
      due_date,
      due_amount,
      status,
      metadata
    )
    values (
      p_invoice_id,
      1,
      coalesce(v_invoice.payment_terms_label, 'Échéance unique'),
      coalesce(v_invoice.due_date, v_invoice.issue_date + greatest(coalesce(v_invoice.payment_terms_days, 30), 0)),
      greatest(coalesce(v_invoice.amount_ttc, 0), 0),
      'pending',
      jsonb_build_object('source', 'auto_default')
    );
    v_count := 1;
  end if;

  select coalesce(sum(due_amount), 0)::numeric(12,2)
    into v_total_schedule
  from public.invoice_payment_schedules
  where invoice_id = p_invoice_id
    and status <> 'cancelled';

  if v_count > 0 and abs(v_total_schedule - coalesce(v_invoice.amount_ttc, 0)) > 0.02 then
    raise exception 'Schedule total (%.2f) must match invoice total TTC (%.2f)',
      v_total_schedule, coalesce(v_invoice.amount_ttc, 0);
  end if;

  perform public.recompute_invoice_payment_schedule_status(p_invoice_id);
  perform public.recompute_invoice_totals(p_invoice_id);

  return jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'schedule_count', v_count,
    'schedule_total', v_total_schedule
  );
end;
$$;

create or replace function public.allocate_payment_to_invoice(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_schedule_id uuid default null,
  p_allocated_by uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_remaining numeric(12,2) := greatest(coalesce(p_amount, 0), 0);
  v_allocated_total numeric(12,2) := 0;
  v_schedule record;
  v_already numeric(12,2);
  v_due numeric(12,2);
  v_alloc numeric(12,2);
begin
  if v_remaining <= 0 then
    raise exception 'Allocation amount must be > 0';
  end if;

  if not exists (
    select 1
    from public.payments
    where id = p_payment_id
      and coalesce(status, 'pending') = 'completed'
  ) then
    raise exception 'Payment % does not exist or is not completed', p_payment_id;
  end if;

  if p_schedule_id is not null then
    if not exists (
      select 1
      from public.invoice_payment_schedules
      where id = p_schedule_id
        and invoice_id = p_invoice_id
    ) then
      raise exception 'Schedule % does not belong to invoice %', p_schedule_id, p_invoice_id;
    end if;

    insert into public.invoice_payment_allocations (
      invoice_id,
      payment_id,
      schedule_id,
      amount,
      allocated_by,
      notes
    )
    values (
      p_invoice_id,
      p_payment_id,
      p_schedule_id,
      v_remaining,
      p_allocated_by,
      p_notes
    );

    v_allocated_total := v_remaining;
    v_remaining := 0;
  else
    for v_schedule in
      select id, due_amount
      from public.invoice_payment_schedules
      where invoice_id = p_invoice_id
        and status in ('pending', 'partially_paid', 'overdue')
      order by due_date asc nulls last, installment_no asc
    loop
      select coalesce(sum(a.amount), 0)::numeric(12,2)
        into v_already
      from public.invoice_payment_allocations a
      join public.payments p on p.id = a.payment_id
      where a.schedule_id = v_schedule.id
        and coalesce(p.status, 'pending') = 'completed';

      v_due := greatest(v_schedule.due_amount - coalesce(v_already, 0), 0);
      if v_due <= 0 then
        continue;
      end if;

      v_alloc := least(v_due, v_remaining);
      if v_alloc <= 0 then
        continue;
      end if;

      insert into public.invoice_payment_allocations (
        invoice_id,
        payment_id,
        schedule_id,
        amount,
        allocated_by,
        notes
      )
      values (
        p_invoice_id,
        p_payment_id,
        v_schedule.id,
        v_alloc,
        p_allocated_by,
        p_notes
      );

      v_allocated_total := v_allocated_total + v_alloc;
      v_remaining := v_remaining - v_alloc;
      exit when v_remaining <= 0;
    end loop;

    if v_remaining > 0 then
      insert into public.invoice_payment_allocations (
        invoice_id,
        payment_id,
        schedule_id,
        amount,
        allocated_by,
        notes,
        metadata
      )
      values (
        p_invoice_id,
        p_payment_id,
        null,
        v_remaining,
        p_allocated_by,
        p_notes,
        jsonb_build_object('unassigned', true)
      );

      v_allocated_total := v_allocated_total + v_remaining;
      v_remaining := 0;
    end if;
  end if;

  perform public.recompute_invoice_totals(p_invoice_id);

  return jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'payment_id', p_payment_id,
    'allocated_total', v_allocated_total,
    'remaining_unallocated', v_remaining
  );
end;
$$;

create or replace function public.register_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text default 'manual',
  p_payment_date date default current_date,
  p_reference text default null,
  p_schedule_id uuid default null,
  p_created_by uuid default null,
  p_payment_type text default 'payment',
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_alloc jsonb;
begin
  select *
    into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id;
  end if;

  if greatest(coalesce(p_amount, 0), 0) <= 0 then
    raise exception 'Payment amount must be > 0';
  end if;

  insert into public.payments (
    invoice_id,
    rental_id,
    amount,
    payment_method,
    payment_date,
    reference,
    status,
    payment_type,
    currency,
    notes,
    metadata
  )
  values (
    p_invoice_id,
    v_invoice.rental_id,
    greatest(coalesce(p_amount, 0), 0),
    coalesce(nullif(trim(coalesce(p_payment_method, '')), ''), 'manual'),
    coalesce(p_payment_date, current_date),
    nullif(trim(coalesce(p_reference, '')), ''),
    'completed',
    coalesce(nullif(trim(coalesce(p_payment_type, '')), ''), 'payment'),
    coalesce(v_invoice.currency, 'EUR'),
    p_notes,
    jsonb_build_object('source', 'register_invoice_payment')
  )
  returning * into v_payment;

  select public.allocate_payment_to_invoice(
    p_invoice_id,
    v_payment.id,
    v_payment.amount,
    p_schedule_id,
    p_created_by,
    p_notes
  ) into v_alloc;

  perform public.recompute_invoice_totals(p_invoice_id);

  return jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'payment_id', v_payment.id,
    'allocation', v_alloc
  );
end;
$$;

create or replace function public.convert_quote_to_invoice(
  p_quote_id uuid,
  p_due_date date default null
)
returns jsonb
language plpgsql
as $$
declare
  v_quote public.invoices%rowtype;
begin
  select *
    into v_quote
  from public.invoices
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'Quote % not found', p_quote_id;
  end if;

  if v_quote.document_type <> 'quote' then
    raise exception 'Invoice % is not a quote', p_quote_id;
  end if;

  update public.invoices
  set
    document_type = 'invoice',
    quote_status = 'accepted',
    status = case when status = 'draft' then 'sent' else status end,
    sent_at = coalesce(sent_at, now()),
    due_date = coalesce(
      p_due_date,
      due_date,
      issue_date + greatest(coalesce(payment_terms_days, 30), 0)
    )
  where id = p_quote_id
  returning * into v_quote;

  if not exists (
    select 1
    from public.invoice_payment_schedules
    where invoice_id = p_quote_id
  ) and coalesce(v_quote.amount_ttc, 0) > 0 then
    insert into public.invoice_payment_schedules (
      invoice_id,
      installment_no,
      label,
      due_date,
      due_amount,
      status,
      metadata
    )
    values (
      p_quote_id,
      1,
      coalesce(v_quote.payment_terms_label, 'Échéance unique'),
      coalesce(
        v_quote.due_date,
        v_quote.issue_date + greatest(coalesce(v_quote.payment_terms_days, 30), 0)
      ),
      v_quote.amount_ttc,
      'pending',
      jsonb_build_object('source', 'quote_conversion')
    );
  end if;

  perform public.recompute_invoice_totals(p_quote_id);

  return jsonb_build_object(
    'ok', true,
    'invoice_id', p_quote_id,
    'invoice_number', v_quote.invoice_number
  );
end;
$$;

-- 6) Financial views
create or replace view public.invoice_financial_overview as
with paid as (
  select
    a.invoice_id,
    coalesce(sum(a.amount), 0)::numeric(12,2) as paid_total
  from public.invoice_payment_allocations a
  join public.payments p on p.id = a.payment_id
  where coalesce(p.status, 'pending') = 'completed'
  group by a.invoice_id
),
credits as (
  select
    i.parent_invoice_id as invoice_id,
    coalesce(sum(i.amount_ttc), 0)::numeric(12,2) as credit_total
  from public.invoices i
  where i.parent_invoice_id is not null
    and i.document_type = 'credit_note'
    and i.status <> 'cancelled'
  group by i.parent_invoice_id
),
schedule as (
  select
    s.invoice_id,
    coalesce(sum(s.due_amount), 0)::numeric(12,2) as schedule_total_due,
    coalesce(sum(s.due_amount - least(s.paid_amount, s.due_amount)) filter (where s.status = 'overdue'), 0)::numeric(12,2) as schedule_overdue_due,
    min(s.due_date) filter (where s.status in ('pending', 'partially_paid', 'overdue')) as next_due_date,
    count(*)::int as schedule_count,
    count(*) filter (where s.status = 'paid')::int as paid_schedule_count
  from public.invoice_payment_schedules s
  group by s.invoice_id
),
reminders as (
  select
    r.invoice_id,
    count(*) filter (where r.status = 'sent')::int as reminder_sent_count,
    max(r.sent_at) as last_reminder_sent_at
  from public.invoice_reminders r
  group by r.invoice_id
)
select
  i.id as invoice_id,
  i.invoice_number,
  i.client_id,
  i.rental_id,
  i.document_type,
  i.quote_status,
  i.status,
  i.origin,
  i.issue_date,
  i.due_date,
  i.currency,
  i.amount_ht,
  i.amount_ttc,
  i.vat_amount,
  coalesce(p.paid_total, 0)::numeric(12,2) as paid_total,
  coalesce(c.credit_total, 0)::numeric(12,2) as credit_total,
  greatest(i.amount_ttc - coalesce(p.paid_total, 0) - coalesce(c.credit_total, 0), 0)::numeric(12,2) as outstanding_amount,
  coalesce(s.schedule_total_due, 0)::numeric(12,2) as schedule_total_due,
  coalesce(s.schedule_overdue_due, 0)::numeric(12,2) as schedule_overdue_due,
  s.next_due_date,
  coalesce(s.schedule_count, 0)::int as schedule_count,
  coalesce(s.paid_schedule_count, 0)::int as paid_schedule_count,
  coalesce(r.reminder_sent_count, 0)::int as reminder_sent_count,
  r.last_reminder_sent_at,
  i.created_at,
  i.updated_at
from public.invoices i
left join paid p on p.invoice_id = i.id
left join credits c on c.invoice_id = i.id
left join schedule s on s.invoice_id = i.id
left join reminders r on r.invoice_id = i.id;

create or replace view public.invoice_payment_schedule_overview as
select
  s.id,
  s.invoice_id,
  i.invoice_number,
  i.document_type,
  i.status as invoice_status,
  i.client_id,
  c.name as client_name,
  c.company as client_company,
  s.installment_no,
  s.label,
  s.due_date,
  s.due_amount,
  s.paid_amount,
  greatest(s.due_amount - least(s.paid_amount, s.due_amount), 0)::numeric(12,2) as remaining_amount,
  s.status,
  s.last_reminder_at,
  s.notes,
  s.metadata,
  s.created_at,
  s.updated_at
from public.invoice_payment_schedules s
join public.invoices i on i.id = s.invoice_id
left join public.clients c on c.id = i.client_id;

-- 7) Backfill/recompute for all existing invoices
do $$
declare
  v_invoice_id uuid;
begin
  for v_invoice_id in
    select id
    from public.invoices
  loop
    perform public.recompute_invoice_totals(v_invoice_id);
  end loop;
end;
$$;

-- 8) RLS/policies/grants
alter table public.invoice_line_items enable row level security;
alter table public.invoice_payment_schedules enable row level security;
alter table public.invoice_payment_allocations enable row level security;
alter table public.invoice_reminders enable row level security;
alter table public.invoice_status_history enable row level security;

drop policy if exists "Anon full access invoice_line_items" on public.invoice_line_items;
create policy "Anon full access invoice_line_items"
  on public.invoice_line_items
  using (true)
  with check (true);

drop policy if exists "Anon full access invoice_payment_schedules" on public.invoice_payment_schedules;
create policy "Anon full access invoice_payment_schedules"
  on public.invoice_payment_schedules
  using (true)
  with check (true);

drop policy if exists "Anon full access invoice_payment_allocations" on public.invoice_payment_allocations;
create policy "Anon full access invoice_payment_allocations"
  on public.invoice_payment_allocations
  using (true)
  with check (true);

drop policy if exists "Anon full access invoice_reminders" on public.invoice_reminders;
create policy "Anon full access invoice_reminders"
  on public.invoice_reminders
  using (true)
  with check (true);

drop policy if exists "Anon full access invoice_status_history" on public.invoice_status_history;
create policy "Anon full access invoice_status_history"
  on public.invoice_status_history
  using (true)
  with check (true);

grant all on table public.invoice_line_items to anon;
grant all on table public.invoice_line_items to authenticated;
grant all on table public.invoice_line_items to service_role;

grant all on table public.invoice_payment_schedules to anon;
grant all on table public.invoice_payment_schedules to authenticated;
grant all on table public.invoice_payment_schedules to service_role;

grant all on table public.invoice_payment_allocations to anon;
grant all on table public.invoice_payment_allocations to authenticated;
grant all on table public.invoice_payment_allocations to service_role;

grant all on table public.invoice_reminders to anon;
grant all on table public.invoice_reminders to authenticated;
grant all on table public.invoice_reminders to service_role;

grant all on table public.invoice_status_history to anon;
grant all on table public.invoice_status_history to authenticated;
grant all on table public.invoice_status_history to service_role;

grant select on public.invoice_financial_overview to anon;
grant select on public.invoice_financial_overview to authenticated;
grant select on public.invoice_financial_overview to service_role;

grant select on public.invoice_payment_schedule_overview to anon;
grant select on public.invoice_payment_schedule_overview to authenticated;
grant select on public.invoice_payment_schedule_overview to service_role;

grant execute on function public.recompute_invoice_payment_schedule_status(uuid) to anon;
grant execute on function public.recompute_invoice_payment_schedule_status(uuid) to authenticated;
grant execute on function public.recompute_invoice_payment_schedule_status(uuid) to service_role;

grant execute on function public.recompute_invoice_totals(uuid) to anon;
grant execute on function public.recompute_invoice_totals(uuid) to authenticated;
grant execute on function public.recompute_invoice_totals(uuid) to service_role;

grant execute on function public.replace_invoice_line_items(uuid, jsonb) to anon;
grant execute on function public.replace_invoice_line_items(uuid, jsonb) to authenticated;
grant execute on function public.replace_invoice_line_items(uuid, jsonb) to service_role;

grant execute on function public.replace_invoice_payment_schedule(uuid, jsonb) to anon;
grant execute on function public.replace_invoice_payment_schedule(uuid, jsonb) to authenticated;
grant execute on function public.replace_invoice_payment_schedule(uuid, jsonb) to service_role;

grant execute on function public.allocate_payment_to_invoice(uuid, uuid, numeric, uuid, uuid, text) to anon;
grant execute on function public.allocate_payment_to_invoice(uuid, uuid, numeric, uuid, uuid, text) to authenticated;
grant execute on function public.allocate_payment_to_invoice(uuid, uuid, numeric, uuid, uuid, text) to service_role;

grant execute on function public.register_invoice_payment(uuid, numeric, text, date, text, uuid, uuid, text, text) to anon;
grant execute on function public.register_invoice_payment(uuid, numeric, text, date, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.register_invoice_payment(uuid, numeric, text, date, text, uuid, uuid, text, text) to service_role;

grant execute on function public.convert_quote_to_invoice(uuid, date) to anon;
grant execute on function public.convert_quote_to_invoice(uuid, date) to authenticated;
grant execute on function public.convert_quote_to_invoice(uuid, date) to service_role;
