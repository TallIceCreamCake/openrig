import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  X,
  Euro,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Receipt,
  FileMinus,
  FileClock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { StatusBadge, type BadgeTone } from '../components/ui-kit';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { checkSellerCompliance } from '../utils/einvoicing';

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
  issue_date?: string | null;
  due_date: string | null;
  finalized_at?: string | null;
  created_at: string;
  client?: {
    id: string;
    name?: string | null;
    company?: string | null;
  };
  notes?: string | null;
  origin?: string | null;
}

type DocTab = 'invoices' | 'quotes' | 'credit_notes';
type PeriodFilter = 'all' | 'month' | 'quarter' | 'year';
type StatusFilter = 'all' | 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyée', tone: 'blue' },
  paid: { label: 'Payée', tone: 'emerald' },
  partially_paid: { label: 'Partiellement payée', tone: 'amber' },
  overdue: { label: 'En retard', tone: 'rose' },
  cancelled: { label: 'Annulée', tone: 'slate' },
};

const QUOTE_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Brouillon', tone: 'gray' },
  sent: { label: 'Envoyé', tone: 'blue' },
  accepted: { label: 'Accepté', tone: 'emerald' },
  declined: { label: 'Refusé', tone: 'rose' },
  expired: { label: 'Expiré', tone: 'slate' },
  invoiced: { label: 'Facturé', tone: 'indigo' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Facture',
  deposit_invoice: "Facture d'acompte",
  credit_note: 'Avoir',
  quote: 'Devis',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
const formatDate = (value: string | null | undefined) =>
  !value ? '—' : new Date(value).toLocaleDateString('fr-FR');

const isOverdue = (doc: BillingDocument) =>
  doc.status === 'sent'
  && (doc.balance_due ?? doc.amount_ttc) > 0
  && Boolean(doc.due_date)
  && new Date(`${doc.due_date}T23:59:59`) < new Date();

/** Statut effectif : marque "en retard" les factures envoyées dont l'échéance est dépassée. */
const effectiveStatus = (doc: BillingDocument): string => {
  if ((doc.document_type || 'invoice') === 'quote') return doc.quote_status && doc.quote_status !== 'none' ? doc.quote_status : doc.status;
  if (isOverdue(doc)) return 'overdue';
  if (doc.status === 'sent' && (doc.paid_amount || 0) > 0 && (doc.balance_due || 0) > 0) return 'partially_paid';
  return doc.status;
};

const periodStart = (period: PeriodFilter): Date | null => {
  const now = new Date();
  switch (period) {
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    default: return null;
  }
};

const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings: companySettings } = useCompanySettings();
  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DocTab>('invoices');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'manual' | 'rental'>('all');

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      // Le client typé ne connaît pas encore les colonnes des migrations récentes.
      const db = supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> };
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
          issue_date,
          due_date,
          finalized_at,
          created_at,
          notes,
          origin,
          client:clients ( id, name, company )
        `)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setDocuments(((data || []) as unknown as BillingDocument[]).map((row) => ({ ...row, origin: row.origin || 'rental' })));
    } catch (err) {
      console.error('load invoices', err);
      setError('Impossible de charger les documents financiers.');
      toast.error('Erreur lors du chargement des documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchDocuments(); }, []);

  /* ── Répartition par type ───────────────────────────────────────── */
  const invoices = useMemo(
    () => documents.filter((d) => ['invoice', 'deposit_invoice'].includes(d.document_type || 'invoice')),
    [documents],
  );
  const quotes = useMemo(
    () => documents.filter((d) => (d.document_type || 'invoice') === 'quote'),
    [documents],
  );
  const creditNotes = useMemo(
    () => documents.filter((d) => (d.document_type || 'invoice') === 'credit_note'),
    [documents],
  );

  /* ── Statistiques financières (factures + acomptes, hors annulées) ─ */
  const stats = useMemo(() => {
    const start = periodStart(periodFilter);
    const active = invoices.filter((d) => d.status !== 'cancelled'
      && (!start || new Date(d.issue_date || d.created_at) >= start));
    const credits = creditNotes.filter((d) => d.status !== 'cancelled'
      && (!start || new Date(d.issue_date || d.created_at) >= start));
    const invoiced = active.reduce((sum, d) => sum + (d.amount_ttc || 0), 0)
      - credits.reduce((sum, d) => sum + (d.amount_ttc || 0), 0);
    const collected = active.reduce((sum, d) => sum + (d.paid_amount || 0), 0);
    const outstanding = active.reduce((sum, d) => sum + (d.balance_due ?? Math.max((d.amount_ttc || 0) - (d.paid_amount || 0), 0)), 0);
    const overdueDocs = active.filter(isOverdue);
    const overdueAmount = overdueDocs.reduce((sum, d) => sum + (d.balance_due || 0), 0);
    return { invoiced, collected, outstanding, overdueAmount, overdueCount: overdueDocs.length };
  }, [invoices, creditNotes, periodFilter]);

  /* ── Conformité e-facture côté vendeur ──────────────────────────── */
  const sellerCompliance = useMemo(
    () => checkSellerCompliance(companySettings ? {
      name: companySettings.legal_name || companySettings.name,
      address: companySettings.address,
      siret: companySettings.siret,
      vat_number: (companySettings as { vat_number?: string | null }).vat_number || companySettings.vat,
      naf: companySettings.naf,
    } : null),
    [companySettings],
  );

  /* ── Liste filtrée pour l'onglet courant ────────────────────────── */
  const currentDocs = activeTab === 'invoices' ? invoices : activeTab === 'quotes' ? quotes : creditNotes;
  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const start = periodStart(periodFilter);
    return currentDocs.filter((doc) => {
      if (q) {
        const haystack = `${doc.invoice_number} ${doc.client?.name || ''} ${doc.client?.company || ''} ${doc.notes || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== 'all') {
        const status = effectiveStatus(doc);
        if (statusFilter === 'sent' && !['sent', 'partially_paid'].includes(status)) return false;
        if (statusFilter !== 'sent' && status !== statusFilter) return false;
      }
      if (start && new Date(doc.issue_date || doc.created_at) < start) return false;
      if (originFilter !== 'all' && (doc.origin || 'rental') !== originFilter) return false;
      return true;
    });
  }, [currentDocs, query, statusFilter, periodFilter, originFilter]);

  const tabs: { id: DocTab; label: string; icon: React.FC<{ className?: string }>; count: number }[] = [
    { id: 'invoices', label: 'Factures', icon: Receipt, count: invoices.length },
    { id: 'quotes', label: 'Devis', icon: FileClock, count: quotes.length },
    { id: 'credit_notes', label: 'Avoirs', icon: FileMinus, count: creditNotes.length },
  ];

  const statCards = [
    { label: 'Facturé', value: stats.invoiced, icon: Euro, tint: 'bg-blue-50 text-blue-600' },
    { label: 'Encaissé', value: stats.collected, icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600' },
    { label: 'En attente', value: stats.outstanding, icon: Clock3, tint: 'bg-amber-50 text-amber-600' },
    {
      label: `En retard${stats.overdueCount > 0 ? ` (${stats.overdueCount})` : ''}`,
      value: stats.overdueAmount,
      icon: AlertTriangle,
      tint: 'bg-rose-50 text-rose-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" /> Facturation
          </h1>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (n°, client, note…)"
              className="pl-9 pr-8 py-2 w-full rounded-md border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                aria-label="Effacer la recherche"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void fetchDocuments(); }}
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

      {/* Bannière conformité e-facture */}
      {sellerCompliance.ready ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-800">
            <span className="font-semibold">Facture électronique :</span> les informations légales de l'entreprise sont complètes.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Préparation facture électronique : informations manquantes</p>
            <p className="mt-0.5">
              {sellerCompliance.issues.map((issue) => issue.label).join(' · ')}
              {' — '}
              <button
                type="button"
                onClick={() => navigate('/company?tab=company')}
                className="font-medium underline underline-offset-2 hover:text-amber-900"
              >
                compléter dans Gestion d'entreprise
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, tint }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
              <div className={`h-8 w-8 rounded-lg grid place-items-center ${tint}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-xl font-bold text-gray-900 tabular-nums">{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Onglets + filtres */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => { setActiveTab(id); setStatusFilter('all'); }}
                className={`py-3 px-1 border-b-2 text-sm font-medium inline-flex items-center gap-2 ${
                  activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  activeTab === id ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700"
          >
            <option value="all">Tous les statuts</option>
            <option value="draft">Brouillons</option>
            <option value="sent">Envoyées / en cours</option>
            <option value="paid">Payées</option>
            <option value="overdue">En retard</option>
            <option value="cancelled">Annulées</option>
          </select>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700"
          >
            <option value="all">Toute période</option>
            <option value="month">Ce mois</option>
            <option value="quarter">Ce trimestre</option>
            <option value="year">Cette année</option>
          </select>
          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as 'all' | 'manual' | 'rental')}
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700"
          >
            <option value="all">Toutes origines</option>
            <option value="rental">Depuis projet</option>
            <option value="manual">Manuelles</option>
          </select>
        </div>
      </div>

      {/* Table des documents */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Numéro', 'Client', 'Émission', 'Échéance', 'HT', 'TTC', 'Payé', 'Solde', 'Statut'].map((header, idx) => (
                  <th
                    key={header}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 ${idx >= 4 && idx <= 7 ? 'text-right' : 'text-left'}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">Chargement…</td></tr>
              )}
              {!loading && filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-10 w-10 rounded-xl bg-gray-100 grid place-items-center">
                        <FileText className="h-5 w-5 text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-500">
                        {currentDocs.length === 0 ? 'Aucun document de ce type.' : 'Aucun document ne correspond aux filtres.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filteredDocs.map((doc) => {
                const status = effectiveStatus(doc);
                const statusMeta = (activeTab === 'quotes' ? QUOTE_STATUS_LABELS[status] : STATUS_LABELS[status])
                  || STATUS_LABELS[doc.status]
                  || { label: status, tone: 'gray' as BadgeTone };
                const docType = doc.document_type || 'invoice';
                return (
                  <tr
                    key={doc.id}
                    onClick={() => navigate(`/accounting/documents/${doc.id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{doc.invoice_number}</span>
                        {doc.finalized_at && (
                          <span title="Finalisée — numérotation définitive, document immuable">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span>{DOC_TYPE_LABELS[docType] || docType}</span>
                        {(doc.origin || 'rental') === 'manual' && <span>· Manuelle</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="max-w-[180px] truncate">{doc.client?.name || 'Client inconnu'}</div>
                      {doc.client?.company && (
                        <div className="max-w-[180px] truncate text-xs text-gray-400">{doc.client.company}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(doc.issue_date || doc.created_at)}</td>
                    <td className={`px-4 py-3 text-sm whitespace-nowrap ${isOverdue(doc) ? 'font-semibold text-rose-600' : 'text-gray-500'}`}>
                      {formatDate(doc.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums whitespace-nowrap">{formatCurrency(doc.amount_ht || 0)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatCurrency(doc.amount_ttc || 0)}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-600 tabular-nums whitespace-nowrap">
                      {(doc.paid_amount || 0) > 0 ? formatCurrency(doc.paid_amount || 0) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap">
                      {(doc.balance_due || 0) > 0
                        ? <span className={isOverdue(doc) ? 'font-semibold text-rose-600' : 'text-gray-700'}>{formatCurrency(doc.balance_due || 0)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filteredDocs.length > 0 && (
          <footer className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
            <span>{filteredDocs.length} document{filteredDocs.length > 1 ? 's' : ''}</span>
            <span className="tabular-nums">
              Total TTC affiché : <span className="font-semibold text-gray-700">{formatCurrency(filteredDocs.reduce((sum, d) => sum + (d.amount_ttc || 0), 0))}</span>
            </span>
          </footer>
        )}
      </section>
    </div>
  );
};

export default BillingPage;
