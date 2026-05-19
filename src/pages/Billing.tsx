import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { StatusBadge, type BadgeTone } from '../components/ui-kit';

interface BillingDocument {
  id: string;
  invoice_number: string;
  client_id: string | null;
  amount_ht: number;
  amount_ttc: number;
  vat_amount: number;
  paid_amount?: number | null;
  balance_due?: number | null;
  status: string;
  document_type?: string | null;
  quote_status?: string | null;
  due_date: string | null;
  created_at: string;
  client?: {
    id: string;
    name?: string | null;
    company?: string | null;
  };
  notes?: string | null;
  origin?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyée', tone: 'blue' },
  paid: { label: 'Payée', tone: 'emerald' },
  overdue: { label: 'En retard', tone: 'rose' },
  cancelled: { label: 'Annulée', tone: 'slate' },
};

const formatCurrency = (value: number) => `${value.toFixed(2)} €`;
const formatDate = (value: string | null) => (!value ? '—' : new Date(value).toLocaleDateString());

const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualInvoicesOnly, setShowManualInvoicesOnly] = useState(false);
  const [showManualQuotesOnly, setShowManualQuotesOnly] = useState(false);

  const fetchDocuments = async () => {
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
          amount_ht,
          amount_ttc,
          vat_amount,
          paid_amount,
          balance_due,
          status,
          document_type,
          quote_status,
          due_date,
          created_at,
          notes,
          origin,
          client:clients ( id, name, company )
        `)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      const mapped = (data || []).map((row: any) => ({
        ...row,
        origin: row.origin || 'rental',
      })) as BillingDocument[];
      setDocuments(mapped);
    } catch (err: any) {
      console.error('load invoices', err);
      setError("Impossible de charger les factures / devis");
      toast.error("Erreur lors du chargement des documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const invoices = useMemo(
    () => documents.filter((doc) => (doc.document_type || 'invoice') !== 'quote'),
    [documents],
  );
  const quotes = useMemo(
    () => documents.filter((doc) => (doc.document_type || 'invoice') === 'quote'),
    [documents],
  );

  const filteredInvoices = useMemo(
    () => invoices.filter((doc) => (showManualInvoicesOnly ? (doc.origin || 'rental') === 'manual' : true)),
    [invoices, showManualInvoicesOnly]
  );

  const filteredQuotes = useMemo(
    () => quotes.filter((doc) => (showManualQuotesOnly ? (doc.origin || 'rental') === 'manual' : true)),
    [quotes, showManualQuotesOnly]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" /> Factures & Devis
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Consultez vos documents financiers, créez des factures ou des devis et suivez leurs statuts en un coup d’œil.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchDocuments}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Rafraîchir
          </button>
          <button
            type="button"
            onClick={() => navigate('/accounting/documents/new')}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Nouveau document
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-8">
        <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <header className="px-4 py-4 border-b border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Factures</h2>
              <p className="text-xs text-gray-500">Toutes les factures envoyées ou payées récemment.</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={showManualInvoicesOnly}
                  onChange={(e) => setShowManualInvoicesOnly(e.target.checked)}
                />
                Montrer uniquement les factures manuelles
              </label>
              <span className="text-xs text-gray-400">{filteredInvoices.length}/{invoices.length}</span>
            </div>
          </header>
          <div className="divide-y divide-gray-100">
            {loading && (
              <div className="px-4 py-6 text-sm text-gray-500">Chargement…</div>
            )}
            {!loading && filteredInvoices.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">
                Aucune facture enregistrée pour le moment.
              </div>
            )}
            {!loading && filteredInvoices.map((doc) => {
              const statusMeta = STATUS_LABELS[doc.status] || { label: doc.status, tone: 'gray' as BadgeTone };
              return (
                <button
                  type="button"
                  key={doc.id}
                  onClick={() => navigate(`/accounting/documents/${doc.id}`)}
                  className="w-full text-left px-4 py-3 flex flex-col gap-2 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{doc.invoice_number}</span>
                      <StatusBadge tone={statusMeta.tone}>
                        {statusMeta.label}
                      </StatusBadge>
                      <StatusBadge tone={(doc.origin || 'rental') === 'manual' ? 'amber' : 'slate'} size="xs">
                        {(doc.origin || 'rental') === 'manual' ? 'Manuelle' : 'Depuis projet'}
                      </StatusBadge>
                      <StatusBadge tone="indigo" size="xs">
                        {(doc.document_type || 'invoice') === 'credit_note'
                          ? 'Avoir'
                          : (doc.document_type || 'invoice') === 'deposit_invoice'
                            ? "Facture d'acompte"
                            : 'Facture'}
                      </StatusBadge>
                    </div>
                    <span className="text-sm text-gray-500">{formatDate(doc.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{doc.client?.name || 'Client inconnu'}</span>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">{formatCurrency(doc.amount_ttc || 0)}</div>
                      <div className="text-xs text-gray-500">Reste {formatCurrency(doc.balance_due || 0)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <header className="px-4 py-4 border-b border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Devis</h2>
              <p className="text-xs text-gray-500">Brouillons et devis en attente de validation.</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={showManualQuotesOnly}
                  onChange={(e) => setShowManualQuotesOnly(e.target.checked)}
                />
                Montrer uniquement les devis manuels
              </label>
              <span className="text-xs text-gray-400">{filteredQuotes.length}/{quotes.length}</span>
            </div>
          </header>
          <div className="divide-y divide-gray-100">
            {loading && (
              <div className="px-4 py-6 text-sm text-gray-500">Chargement…</div>
            )}
            {!loading && filteredQuotes.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">
                Aucun devis en cours.
              </div>
            )}
            {!loading && filteredQuotes.map((doc) => {
              const statusMeta = STATUS_LABELS[doc.status] || STATUS_LABELS.draft;
              return (
                <button
                  type="button"
                  key={doc.id}
                  onClick={() => navigate(`/accounting/documents/${doc.id}`)}
                  className="w-full text-left px-4 py-3 flex flex-col gap-2 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{doc.invoice_number}</span>
                      <StatusBadge tone={statusMeta.tone}>
                        {statusMeta.label}
                      </StatusBadge>
                      <StatusBadge tone={(doc.origin || 'rental') === 'manual' ? 'amber' : 'slate'} size="xs">
                        {(doc.origin || 'rental') === 'manual' ? 'Manuelle' : 'Depuis projet'}
                      </StatusBadge>
                      <StatusBadge tone="indigo" size="xs">
                        Devis
                      </StatusBadge>
                    </div>
                    <span className="text-sm text-gray-500">{formatDate(doc.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{doc.client?.name || 'Client inconnu'}</span>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">{formatCurrency(doc.amount_ttc || 0)}</div>
                      <div className="text-xs text-gray-500">{doc.quote_status || 'draft'}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default BillingPage;
