// Shared billing status / overdue logic — single source of truth used by the
// billing list, the invoice detail and the finance dashboard widget so they all
// agree on what "en retard" means. Mirrors the SQL in
// recompute_invoice_totals() / mark_overdue_invoices().

import type { BadgeTone } from '../components/ui-kit';

export interface BillingDocLike {
  status: string;
  amount_ttc?: number | null;
  paid_amount?: number | null;
  balance_due?: number | null;
  due_date?: string | null;
  document_type?: string | null;
  quote_status?: string | null;
}

export type EffectiveStatus =
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | string;

export const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyée', tone: 'blue' },
  paid: { label: 'Payée', tone: 'emerald' },
  partially_paid: { label: 'Partiellement payée', tone: 'amber' },
  overdue: { label: 'En retard', tone: 'rose' },
  cancelled: { label: 'Annulée', tone: 'slate' },
};

export const QUOTE_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyé', tone: 'blue' },
  accepted: { label: 'Accepté', tone: 'emerald' },
  declined: { label: 'Refusé', tone: 'rose' },
  rejected: { label: 'Refusé', tone: 'rose' },
  expired: { label: 'Expiré', tone: 'slate' },
  invoiced: { label: 'Facturé', tone: 'indigo' },
  none: { label: '—', tone: 'gray' },
};

export const balanceOf = (doc: BillingDocLike): number =>
  doc.balance_due ?? Math.max((doc.amount_ttc || 0) - (doc.paid_amount || 0), 0);

const isQuote = (doc: BillingDocLike): boolean => (doc.document_type || 'invoice') === 'quote';

/** A real invoice that is sent (or already overdue), still owes money, and is past due. */
export const isOverdue = (doc: BillingDocLike, now: Date = new Date()): boolean => {
  if (isQuote(doc)) return false;
  if (doc.status !== 'sent' && doc.status !== 'overdue') return false;
  if (balanceOf(doc) <= 0) return false;
  if (!doc.due_date) return false;
  return new Date(`${doc.due_date}T23:59:59`) < now;
};

/** Whole days the invoice is past its due date (0 if not overdue). */
export const daysOverdue = (doc: BillingDocLike, now: Date = new Date()): number => {
  if (!doc.due_date || !isOverdue(doc, now)) return 0;
  const due = new Date(`${doc.due_date}T23:59:59`);
  const diffMs = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
};

/** Display status: derives "overdue" / "partially_paid" even before the DB persists it. */
export const effectiveStatus = (doc: BillingDocLike): EffectiveStatus => {
  if (isQuote(doc)) {
    return doc.quote_status && doc.quote_status !== 'none' ? doc.quote_status : doc.status;
  }
  if (isOverdue(doc)) return 'overdue';
  if (doc.status === 'sent' && (doc.paid_amount || 0) > 0 && balanceOf(doc) > 0) return 'partially_paid';
  return doc.status;
};

/**
 * Late-payment penalty. Defaults to the French statutory rate of 3× the legal
 * interest rate as an annual percentage, prorated over the days overdue, on top
 * of the outstanding balance. Pass a custom annual rate (e.g. contractual) if needed.
 */
export const computeLatePenalty = (
  doc: BillingDocLike,
  annualRatePct = 9.69,
  now: Date = new Date(),
): number => {
  const days = daysOverdue(doc, now);
  if (days <= 0) return 0;
  const balance = balanceOf(doc);
  return Math.round(((balance * (annualRatePct / 100)) * (days / 365)) * 100) / 100;
};
