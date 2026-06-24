import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { StatusBadge, type BadgeTone } from '../components/ui-kit';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { isAutoEntrepreneurMode } from '../utils/accountingMode';
import InvoiceFinancialPanel from '../components/billing/InvoiceFinancialPanel';
import {
  effectiveStatus,
  daysOverdue,
  computeLatePenalty,
  STATUS_LABELS as SHARED_STATUS_LABELS,
} from '../utils/billingStatus';

interface BillingDocument {
  id: string;
  invoice_number: string;
  client_id: string | null;
  rental_id?: string | null;
  amount_ht: number;
  amount_ttc: number;
  vat_amount: number;
  paid_amount?: number | null;
  balance_due?: number | null;
  status: string;
  document_type?: string | null;
  quote_status?: string | null;
  issue_date?: string | null;
  sent_at?: string | null;
  cancelled_at?: string | null;
  parent_invoice_id?: string | null;
  currency?: string | null;
  due_date: string | null;
  created_at: string;
  notes?: string | null;
  client?: {
    id: string;
    name?: string | null;
    company?: string | null;
    email?: string | null;
  };
  origin?: string | null;
}

interface BillingLineMeta {
  id?: string;
  description?: string;
  line_type?: string;
  quantity?: number;
  unitPrice?: number;
  unit_price?: number;
  unit_price_ttc?: number;
  discount_percent?: number;
  taxRate?: number;
  tax_rate?: number;
  total_ttc?: number;
  total_ht?: number;
}

interface BillingScheduleRow {
  id: string;
  installment_no: number;
  label: string | null;
  due_date: string;
  due_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
}

interface BillingAllocationRow {
  id: string;
  amount: number;
  allocated_at: string;
  schedule_id: string | null;
  payment?: {
    id: string;
    payment_date: string;
    payment_method: string;
    reference: string | null;
    status: string;
  } | null;
}

interface BillingReminderRow {
  id: string;
  reminder_type: string;
  channel: string;
  status: string;
  recipient: string | null;
  subject: string | null;
  planned_for: string | null;
  sent_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyée', tone: 'blue' },
  paid: { label: 'Payée', tone: 'emerald' },
  overdue: { label: 'En retard', tone: 'rose' },
  cancelled: { label: 'Annulée', tone: 'slate' },
};

const QUOTE_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  none: { label: '—', tone: 'gray' },
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyé', tone: 'blue' },
  accepted: { label: 'Accepté', tone: 'emerald' },
  rejected: { label: 'Refusé', tone: 'rose' },
  expired: { label: 'Expiré', tone: 'amber' },
};

const formatCurrency = (value: number | null | undefined) => `${Number(value || 0).toFixed(2)} €`;
const formatDate = (value: string | null | undefined) => (!value ? '—' : new Date(value).toLocaleDateString());


const BillingDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [billingDoc, setBillingDoc] = useState<BillingDocument | null>(null);
  const [lineItems, setLineItems] = useState<BillingLineMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const { settings } = useCompanySettings();
  const autoEntrepreneurMode = useMemo(() => isAutoEntrepreneurMode(settings), [settings]);

  const loadLineItems = async (invoiceId: string) => {
    try {
      const { data, error: lineErr } = await (supabase as any)
        .from('invoice_line_items')
        .select('id, line_type, description, quantity, unit_price_ttc, tax_rate, discount_percent, total_ttc, total_ht')
        .eq('invoice_id', invoiceId)
        .order('line_order', { ascending: true });
      if (lineErr) throw lineErr;
      setLineItems((data || []) as BillingLineMeta[]);
    } catch (err) {
      console.error('load line items', err);
      setLineItems([]);
    }
  };

  const fetchDocument = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const db = supabase as any;
      const { data, error: fetchError } = await db
        .from('invoices')
        .select(`
          id,
          invoice_number,
          client_id,
          rental_id,
          amount_ht,
          amount_ttc,
          vat_amount,
          paid_amount,
          balance_due,
          status,
          document_type,
          quote_status,
          issue_date,
          sent_at,
          cancelled_at,
          parent_invoice_id,
          currency,
          due_date,
          created_at,
          notes,
          origin,
          client:clients ( id, name, company, email )
        `)
        .eq('id', id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) {
        setError('Document introuvable');
        setBillingDoc(null);
        setLineItems([]);
      } else {
        setBillingDoc(data as BillingDocument);
        await loadLineItems(String(data.id));
      }
    } catch (err) {
      console.error('load invoice', err);
      setError("Impossible de charger le document");
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocument();
  }, [id]);

  const parsedMetadata = useMemo(() => {
    if (!billingDoc?.notes) return null;
    try {
      const meta = JSON.parse(billingDoc.notes);
      if (meta && typeof meta === 'object') return meta as Record<string, unknown>;
    } catch (err) {
      return { notes: billingDoc.notes } as Record<string, unknown>;
    }
    return { notes: billingDoc.notes } as Record<string, unknown>;
  }, [billingDoc]);

  const issueDate = useMemo(() => {
    if (!billingDoc) return null;
    if (billingDoc.issue_date) {
      const value = String(billingDoc.issue_date);
      if (!Number.isNaN(Date.parse(value))) return value;
    }
    if (parsedMetadata?.issue_date) {
      const value = String(parsedMetadata.issue_date);
      if (!Number.isNaN(Date.parse(value))) return new Date(value).toISOString().slice(0, 10);
    }
    return billingDoc.created_at;
  }, [billingDoc, parsedMetadata]);

  const handleGeneratePdf = async () => {
    if (!billingDoc?.id) return;
    setGeneratingPdf(true);
    try {
      const res = await fetch(`/api/invoices/${billingDoc.id}/pdf`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur serveur');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${billingDoc.invoice_number}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('PDF téléchargé');
    } catch (err) {
      console.error('generate invoice pdf', err);
      toast.error(err instanceof Error ? err.message : 'Impossible de générer le PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleConvertQuoteToInvoice = async () => {
    if (!billingDoc?.id) return;
    setUpdatingStatus(true);
    try {
      const db = supabase as any;
      const { error } = await db.rpc('convert_quote_to_invoice', {
        p_quote_id: billingDoc.id,
        p_due_date: billingDoc.due_date || null,
      });
      if (error) throw error;
      toast.success('Devis converti en facture.');
      await fetchDocument();
    } catch (err) {
      console.error('convert quote', err);
      toast.error('Impossible de convertir le devis');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleUpdateStatus = async (nextStatus: string, nextQuoteStatus?: string) => {
    if (!billingDoc?.id) return;
    setUpdatingStatus(true);
    try {
      const db = supabase as any;
      const payload: Record<string, unknown> = { status: nextStatus };
      if (nextQuoteStatus) payload.quote_status = nextQuoteStatus;
      if (nextStatus === 'sent') payload.sent_at = new Date().toISOString();
      if (nextStatus === 'cancelled') payload.cancelled_at = new Date().toISOString();
      const { error } = await db.from('invoices').update(payload).eq('id', billingDoc.id);
      if (error) throw error;
      toast.success('Statut mis à jour.');
      await fetchDocument();
    } catch (err) {
      console.error('update invoice status', err);
      toast.error('Impossible de mettre à jour le statut');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement du document…
      </div>
    );
  }

  if (error || !billingDoc) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => navigate('/accounting/documents')}
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux documents
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
          {error || 'Document introuvable.'}
        </div>
      </div>
    );
  }

  const effStatus = effectiveStatus(billingDoc);
  const statusMeta = STATUS_LABELS[effStatus] || SHARED_STATUS_LABELS[effStatus] || STATUS_LABELS[billingDoc.status] || STATUS_LABELS.draft;
  const quoteStatusMeta = QUOTE_STATUS_LABELS[billingDoc.quote_status || 'none'] || QUOTE_STATUS_LABELS.none;
  const overdueDays = daysOverdue(billingDoc);
  const latePenalty = overdueDays > 0 ? computeLatePenalty(billingDoc) : 0;
  const currencyFmt = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
  const lines: BillingLineMeta[] = lineItems.length > 0
    ? lineItems
    : (Array.isArray(parsedMetadata?.lines) ? (parsedMetadata!.lines as BillingLineMeta[]) : []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/accounting/documents')}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">{billingDoc.invoice_number}</h1>
          <StatusBadge tone={statusMeta.tone}>
            {statusMeta.label}
          </StatusBadge>
          <StatusBadge tone="slate">
            {billingDoc.document_type === 'quote'
              ? 'Devis'
              : billingDoc.document_type === 'credit_note'
                ? 'Avoir'
                : billingDoc.document_type === 'deposit_invoice'
                  ? "Facture d'acompte"
                  : 'Facture'}
          </StatusBadge>
          {billingDoc.document_type === 'quote' && (
            <StatusBadge tone={quoteStatusMeta.tone}>
              {quoteStatusMeta.label}
            </StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={fetchDocument}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
          {billingDoc.document_type === 'quote' && (
            <button
              type="button"
              onClick={handleConvertQuoteToInvoice}
              disabled={updatingStatus}
              className={`inline-flex items-center gap-2 rounded-md border border-emerald-500 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 ${updatingStatus ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              Convertir en facture
            </button>
          )}
          {billingDoc.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => handleUpdateStatus('cancelled', billingDoc.document_type === 'quote' ? 'rejected' : undefined)}
              disabled={updatingStatus}
              className={`inline-flex items-center gap-2 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 ${updatingStatus ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
            className={`inline-flex items-center gap-2 rounded-md border border-blue-500 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 ${generatingPdf ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {generatingPdf ? 'Génération…' : 'Télécharger le PDF'}
          </button>
        </div>
      </div>

      {overdueDays > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-rose-800">
            Paiement en retard de <span className="font-bold">{overdueDays} jour{overdueDays > 1 ? 's' : ''}</span>
            {' · '}solde dû {currencyFmt(billingDoc.balance_due ?? Math.max((billingDoc.amount_ttc || 0) - (billingDoc.paid_amount || 0), 0))}
          </p>
          {latePenalty > 0 && (
            <p className="text-xs text-rose-700">
              Pénalités de retard estimées (taux légal) : <span className="font-semibold">{currencyFmt(latePenalty)}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Financier</h2>
          <InvoiceFinancialPanel
            invoiceId={billingDoc.id}
            rentalId={billingDoc.rental_id}
            totalTTC={Number(billingDoc.amount_ttc || 0)}
            clientEmail={billingDoc.client?.email || null}
            clientName={billingDoc.client?.name || billingDoc.client?.company || null}
            invoiceNumber={billingDoc.invoice_number}
            onPaymentChange={fetchDocument}
          />
        </section>

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Informations</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
            <div className="text-xs uppercase text-gray-400">Client</div>
              <div className="mt-1 text-sm text-gray-700">
                <div className="font-medium text-gray-900">{billingDoc.client?.name || 'Client inconnu'}</div>
                {billingDoc.client?.company && <div>{billingDoc.client.company}</div>}
                {billingDoc.client?.email && <div className="text-xs text-gray-500">{billingDoc.client.email}</div>}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-400">Dates</div>
              <div className="mt-1 text-sm text-gray-700 space-y-1">
                <div>Émise le {formatDate(issueDate)}</div>
                <div>Échéance {formatDate(billingDoc.due_date)}</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-400">Montants</div>
              <div className="mt-1 text-sm text-gray-700 space-y-1">
                {!autoEntrepreneurMode && <div>HT • {formatCurrency(billingDoc.amount_ht)}</div>}
                {!autoEntrepreneurMode && <div>TVA • {formatCurrency(billingDoc.vat_amount)}</div>}
                <div className="font-semibold text-gray-900">TTC • {formatCurrency(billingDoc.amount_ttc)}</div>
                <div>Payé • {formatCurrency(billingDoc.paid_amount || 0)}</div>
                <div className="font-semibold text-red-700">Reste • {formatCurrency(billingDoc.balance_due || 0)}</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-400">Projet / Référence</div>
              <div className="mt-1 text-sm text-gray-700">
                {parsedMetadata?.project_label ? String(parsedMetadata.project_label) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-400">Origine</div>
              <div className="mt-1 text-sm text-gray-700">
                {(billingDoc.origin || 'rental') === 'manual' ? 'Création manuelle' : 'Depuis projet'}
              </div>
            </div>
            {billingDoc.document_type === 'credit_note' && (
              <div>
                <div className="text-xs uppercase text-gray-400">Facture d’origine</div>
                <div className="mt-1 text-sm text-gray-700">
                  {billingDoc.parent_invoice_id || '—'}
                </div>
              </div>
            )}
          </div>

          {!!lines.length && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Lignes</h3>
              <div className="space-y-2 text-sm text-gray-600">
                {lines.map((line, index) => {
                  const description = String(line.description || 'Ligne sans titre');
                  const quantity = Number(line.quantity ?? 0);
                  const unitPriceTtc = Number(line.unit_price_ttc ?? line.unitPrice ?? line.unit_price ?? 0);
                  const taxRate = Number(line.taxRate ?? line.tax_rate ?? 0);
                  return (
                    <div key={index} className="rounded border border-gray-100 px-3 py-2">
                      <div className="font-medium text-gray-900">{description}</div>
                      <div className="text-xs text-gray-500">
                        Qté {quantity} • PU TTC {unitPriceTtc.toFixed(2)} €{!autoEntrepreneurMode ? ` • TVA ${taxRate}%` : ''}
                      </div>
                      {line.total_ttc !== undefined && (
                        <div className="text-xs text-gray-500">Total TTC {Number(line.total_ttc || 0).toFixed(2)} €</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {parsedMetadata?.notes && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-1">Notes</h3>
              <div className="text-sm text-gray-600 whitespace-pre-wrap">{String(parsedMetadata.notes)}</div>
            </div>
          )}
        </section>
      </div>

    </div>
  );
};

export default BillingDetailPage;
