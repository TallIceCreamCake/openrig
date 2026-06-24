-- Payment-overdue system.
--
-- recompute_invoice_totals() already flips an invoice to 'overdue' when a
-- payment/line/allocation change happens while the due date is past. What is
-- missing is a *time-based* sweep: an invoice that becomes late purely because
-- the date rolled over (no payment activity) keeps its 'sent' status until
-- something touches it. Since there is no scheduler, the app calls this RPC on
-- load (billing page, finance dashboard widget) to reconcile statuses.
--
-- The rule mirrors recompute_invoice_totals exactly: a real invoice that is
-- 'sent', still owes money, and whose due date has passed becomes 'overdue'.

create or replace function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with updated as (
    update public.invoices
    set status = 'overdue'
    where status = 'sent'
      and coalesce(document_type, 'invoice') in ('invoice', 'deposit_invoice')
      and coalesce(balance_due, amount_ttc, 0) > 0
      and due_date is not null
      and due_date < current_date
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

grant execute on function public.mark_overdue_invoices() to anon, authenticated, service_role;

-- Speeds up both the sweep above and overdue filtering in the UI.
create index if not exists idx_invoices_status_due_date
  on public.invoices (status, due_date)
  where status in ('sent', 'overdue');
