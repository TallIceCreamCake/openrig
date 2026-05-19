import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Receipt,
  Wallet,
} from 'lucide-react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
} from 'date-fns';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { AUTO_ENTREPRENEUR_TVA_NOTE, isAutoEntrepreneurMode } from '../utils/accountingMode';
import { Button, Field, Input, Select, StatusBadge, StepTransition, type BadgeTone } from '../components/ui-kit';

type LocalTab = 'overview' | 'receivables' | 'payments' | 'taxes' | 'exports';
type AccountingTab = LocalTab | 'documents';
type PeriodPreset = 'current_month' | 'current_quarter' | 'current_year' | 'last_30_days' | 'custom';

type InvoiceClient = {
  name: string | null;
  company: string | null;
};

type InvoiceRecord = {
  id: string;
  invoice_number: string;
  amount_ht: number;
  amount_ttc: number;
  vat_amount: number;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  created_at: string;
  origin: string;
  client: InvoiceClient | null;
};

type PaymentRecord = {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  status: string;
  reference: string | null;
  payment_type: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  due_date: string | null;
  client: InvoiceClient | null;
};

type MaintenanceRecord = {
  cost: number;
  completed_date: string | null;
};

type InvoiceBalanceRow = {
  invoice: InvoiceRecord;
  paidAmount: number;
  remainingAmount: number;
};

type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

const ALL_TABS: Array<{
  id: AccountingTab;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', name: 'Résumé', icon: BarChart3 },
  { id: 'receivables', name: 'Relances', icon: AlertTriangle },
  { id: 'payments', name: 'Encaissements', icon: CreditCard },
  { id: 'taxes', name: 'TVA', icon: Receipt },
  { id: 'exports', name: 'Exports', icon: Download },
  { id: 'documents', name: 'Documents', icon: FileText },
];

const PERIOD_OPTIONS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'current_month', label: 'Mois en cours' },
  { id: 'current_quarter', label: 'Trimestre en cours' },
  { id: 'current_year', label: 'Année en cours' },
  { id: 'last_30_days', label: '30 derniers jours' },
  { id: 'custom', label: 'Période personnalisée' },
];

const MONEY = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  try {
    const parsed = parseISO(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
};

const formatDateLabel = (value: string | null | undefined): string => {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString('fr-FR') : '—';
};

const normalizeClient = (raw: unknown): InvoiceClient | null => {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as Record<string, unknown> | undefined;
    if (!first) return null;
    return {
      name: typeof first.name === 'string' ? first.name : null,
      company: typeof first.company === 'string' ? first.company : null,
    };
  }
  const obj = raw as Record<string, unknown>;
  return {
    name: typeof obj.name === 'string' ? obj.name : null,
    company: typeof obj.company === 'string' ? obj.company : null,
  };
};

const buildRange = (preset: PeriodPreset, customStart: string, customEnd: string): DateRange => {
  const now = new Date();
  if (preset === 'current_month') {
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
      label: `Mois en cours (${format(now, 'MMMM yyyy')})`,
    };
  }
  if (preset === 'current_quarter') {
    return {
      start: startOfQuarter(now),
      end: endOfQuarter(now),
      label: 'Trimestre en cours',
    };
  }
  if (preset === 'current_year') {
    return {
      start: startOfYear(now),
      end: endOfYear(now),
      label: `Année ${format(now, 'yyyy')}`,
    };
  }
  if (preset === 'last_30_days') {
    return {
      start: startOfDay(subDays(now, 29)),
      end: endOfDay(now),
      label: '30 derniers jours',
    };
  }
  const start = parseDate(customStart);
  const end = parseDate(customEnd);
  if (start && end) {
    return {
      start: startOfDay(start),
      end: endOfDay(end),
      label: `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`,
    };
  }
  return {
    start: startOfMonth(now),
    end: endOfMonth(now),
    label: `Mois en cours (${format(now, 'MMMM yyyy')})`,
  };
};

const isWithinRange = (value: Date | null, range: DateRange): boolean => {
  if (!value) return false;
  return !isBefore(value, range.start) && !isAfter(value, range.end);
};

const csvCell = (value: string | number | null | undefined): string =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadTextFile = (name: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

const statusPill = (status: string): BadgeTone => {
  switch (status) {
    case 'paid':
      return 'emerald';
    case 'overdue':
      return 'rose';
    case 'sent':
      return 'amber';
    case 'draft':
      return 'gray';
    case 'cancelled':
      return 'slate';
    default:
      return 'gray';
  }
};

const statusLabel = (status: string): string => {
  switch (status) {
    case 'paid':
      return 'Payée';
    case 'overdue':
      return 'En retard';
    case 'sent':
      return 'Envoyée';
    case 'draft':
      return 'Brouillon';
    case 'cancelled':
      return 'Annulée';
    default:
      return status;
  }
};

const Accounting: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isDocumentsRoute = location.pathname.startsWith('/accounting/documents');
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeLocalTab, setActiveLocalTab] = useState<LocalTab>(() => {
    const t = searchParams.get('tab') as LocalTab | null;
    const valid: LocalTab[] = ['overview', 'receivables', 'payments', 'taxes', 'exports'];
    return valid.includes(t as LocalTab) ? t as LocalTab : 'overview';
  });
  const activeTab: AccountingTab = isDocumentsRoute ? 'documents' : activeLocalTab;
  const prevTabRef = useRef<AccountingTab>(activeTab);
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>('forward');

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('current_month');
  const [customStart, setCustomStart] = useState<string>(() => format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [searchReceivable, setSearchReceivable] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceRecord[]>([]);

  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = useMemo(
    () => isAutoEntrepreneurMode(companySettings),
    [companySettings],
  );
  const tabs = useMemo(
    () => ALL_TABS.filter((tab) => !autoEntrepreneurMode || tab.id !== 'taxes'),
    [autoEntrepreneurMode],
  );

  const companyIdentity = useMemo(
    () => ({
      name: companySettings?.legal_name || companySettings?.name || 'Société',
      siren: companySettings?.siren || '—',
      vat: autoEntrepreneurMode ? AUTO_ENTREPRENEUR_TVA_NOTE : (companySettings?.vat || 'TVA non renseignée'),
    }),
    [autoEntrepreneurMode, companySettings],
  );

  const periodRange = useMemo(
    () => buildRange(periodPreset, customStart, customEnd),
    [periodPreset, customStart, customEnd],
  );

  const loadAccountingData = async (manual = false) => {
    try {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [invoicesRes, paymentsRes, maintenanceRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, amount_ht, amount_ttc, vat_amount, status, due_date, paid_date, created_at, origin, client:clients(name, company)')
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('id, amount, payment_method, payment_date, status, reference, payment_type, invoice_id, invoices:invoices(invoice_number, due_date, client:clients(name, company))')
          .order('payment_date', { ascending: false })
          .limit(300),
        supabase
          .from('maintenance_tasks')
          .select('cost, completed_date')
          .not('completed_date', 'is', null),
      ]);

      if (invoicesRes.error) throw invoicesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (maintenanceRes.error) throw maintenanceRes.error;

      const mappedInvoices = ((invoicesRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id || ''),
        invoice_number: String(row.invoice_number || '—'),
        amount_ht: safeNumber(row.amount_ht),
        amount_ttc: safeNumber(row.amount_ttc),
        vat_amount: safeNumber(row.vat_amount),
        status: String(row.status || 'draft'),
        due_date: typeof row.due_date === 'string' ? row.due_date : null,
        paid_date: typeof row.paid_date === 'string' ? row.paid_date : null,
        created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
        origin: typeof row.origin === 'string' ? row.origin : 'rental',
        client: normalizeClient(row.client),
      }));

      const mappedPayments = ((paymentsRes.data || []) as Array<Record<string, unknown>>).map((row) => {
        const rawInvoiceRef = row.invoices as Record<string, unknown> | null | undefined;
        const invoiceClient = rawInvoiceRef ? normalizeClient(rawInvoiceRef.client) : null;
        return {
          id: String(row.id || ''),
          amount: safeNumber(row.amount),
          payment_method: typeof row.payment_method === 'string' ? row.payment_method : '—',
          payment_date: typeof row.payment_date === 'string' ? row.payment_date : new Date().toISOString(),
          status: typeof row.status === 'string' ? row.status : 'pending',
          reference: typeof row.reference === 'string' ? row.reference : null,
          payment_type: typeof row.payment_type === 'string' ? row.payment_type : null,
          invoice_id: typeof row.invoice_id === 'string' ? row.invoice_id : null,
          invoice_number: rawInvoiceRef && typeof rawInvoiceRef.invoice_number === 'string' ? rawInvoiceRef.invoice_number : null,
          due_date: rawInvoiceRef && typeof rawInvoiceRef.due_date === 'string' ? rawInvoiceRef.due_date : null,
          client: invoiceClient,
        };
      });

      const mappedMaintenance = ((maintenanceRes.data || []) as Array<Record<string, unknown>>).map((row) => ({
        cost: safeNumber(row.cost),
        completed_date: typeof row.completed_date === 'string' ? row.completed_date : null,
      }));

      setInvoices(mappedInvoices);
      setPayments(mappedPayments);
      setMaintenanceCosts(mappedMaintenance);
    } catch (error) {
      console.error('load accounting data', error);
      toast.error('Impossible de charger les données comptables.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAccountingData();
  }, []);

  useEffect(() => {
    const order = tabs.map((tab) => tab.id);
    const prevIndex = order.indexOf(prevTabRef.current);
    const nextIndex = order.indexOf(activeTab);
    if (prevIndex >= 0 && nextIndex >= 0 && prevIndex !== nextIndex) {
      setTabDirection(nextIndex > prevIndex ? 'forward' : 'backward');
    }
    prevTabRef.current = activeTab;
  }, [activeTab, tabs]);

  useEffect(() => {
    if (autoEntrepreneurMode && activeLocalTab === 'taxes') {
      setActiveLocalTab('overview');
    }
  }, [activeLocalTab, autoEntrepreneurMode]);

  const paidByInvoice = useMemo(() => {
    const totals = new Map<string, number>();
    payments
      .filter((payment) => payment.status === 'completed' && payment.invoice_id)
      .forEach((payment) => {
        const key = payment.invoice_id as string;
        totals.set(key, safeNumber(totals.get(key)) + payment.amount);
      });
    return totals;
  }, [payments]);

  const invoiceBalances = useMemo<InvoiceBalanceRow[]>(() => {
    return invoices
      .filter((invoice) => invoice.status !== 'cancelled')
      .map((invoice) => {
        const paidAmount = safeNumber(paidByInvoice.get(invoice.id));
        const remainingAmount = Math.max(0, invoice.amount_ttc - paidAmount);
        return { invoice, paidAmount, remainingAmount };
      });
  }, [invoices, paidByInvoice]);

  const receivableRows = useMemo(
    () =>
      invoiceBalances
        .filter((row) => row.remainingAmount > 0 && row.invoice.status !== 'paid' && row.invoice.status !== 'draft')
        .sort((a, b) => {
          const dateA = parseDate(a.invoice.due_date)?.getTime() || Number.MAX_SAFE_INTEGER;
          const dateB = parseDate(b.invoice.due_date)?.getTime() || Number.MAX_SAFE_INTEGER;
          return dateA - dateB;
        }),
    [invoiceBalances],
  );

  const today = startOfDay(new Date());

  const overdueRows = useMemo(
    () =>
      receivableRows.filter((row) => {
        const due = parseDate(row.invoice.due_date);
        return due ? isBefore(due, today) : false;
      }),
    [receivableRows, today],
  );

  const dueSoonRows = useMemo(
    () =>
      receivableRows.filter((row) => {
        const due = parseDate(row.invoice.due_date);
        if (!due || isBefore(due, today)) return false;
        return !isAfter(due, endOfDay(addDays(today, 7)));
      }),
    [receivableRows, today],
  );

  const invoicesInRange = useMemo(
    () => invoices.filter((invoice) => isWithinRange(parseDate(invoice.created_at), periodRange)),
    [invoices, periodRange],
  );

  const paymentsInRange = useMemo(
    () => payments.filter((payment) => isWithinRange(parseDate(payment.payment_date), periodRange)),
    [payments, periodRange],
  );

  const maintenanceInRange = useMemo(
    () => maintenanceCosts.filter((entry) => isWithinRange(parseDate(entry.completed_date), periodRange)),
    [maintenanceCosts, periodRange],
  );

  const metrics = useMemo(() => {
    const bookedInvoices = invoicesInRange.filter(
      (invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled',
    );
    const collected = paymentsInRange
      .filter((payment) => payment.status === 'completed' && payment.amount >= 0)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const refunded = Math.abs(
      paymentsInRange
        .filter((payment) => payment.status === 'completed' && payment.amount < 0)
        .reduce((sum, payment) => sum + payment.amount, 0),
    );
    const maintenance = maintenanceInRange.reduce((sum, row) => sum + row.cost, 0);
    const outstanding = receivableRows.reduce((sum, row) => sum + row.remainingAmount, 0);
    const overdueAmount = overdueRows.reduce((sum, row) => sum + row.remainingAmount, 0);
    const vatCollected = autoEntrepreneurMode ? 0 : bookedInvoices.reduce((sum, invoice) => sum + invoice.vat_amount, 0);
    const vatDeductible = autoEntrepreneurMode ? 0 : maintenance * 0.2;
    const vatToPay = autoEntrepreneurMode ? 0 : Math.max(0, vatCollected - vatDeductible);
    const netCash = collected - refunded - maintenance;

    return {
      invoicedHt: bookedInvoices.reduce((sum, invoice) => sum + invoice.amount_ht, 0),
      invoicedTtc: bookedInvoices.reduce((sum, invoice) => sum + invoice.amount_ttc, 0),
      collected,
      refunded,
      maintenance,
      netCash,
      outstanding,
      overdueAmount,
      overdueCount: overdueRows.length,
      dueSoonCount: dueSoonRows.length,
      vatCollected,
      vatDeductible,
      vatToPay,
    };
  }, [autoEntrepreneurMode, dueSoonRows.length, invoicesInRange, maintenanceInRange, overdueRows, paymentsInRange, receivableRows]);

  const paymentMethodStats = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>();
    paymentsInRange
      .filter((payment) => payment.status === 'completed')
      .forEach((payment) => {
        const key = payment.payment_method || 'Non renseigné';
        const current = totals.get(key) || { amount: 0, count: 0 };
        totals.set(key, {
          amount: current.amount + payment.amount,
          count: current.count + 1,
        });
      });
    return Array.from(totals.entries())
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [paymentsInRange]);

  const receivablesFiltered = useMemo(() => {
    const query = searchReceivable.trim().toLowerCase();
    if (!query) return receivableRows;
    return receivableRows.filter((row) => {
      const invoiceLabel = row.invoice.invoice_number.toLowerCase();
      const clientLabel = (row.invoice.client?.name || '').toLowerCase();
      return invoiceLabel.includes(query) || clientLabel.includes(query);
    });
  }, [receivableRows, searchReceivable]);

  const handleTabChange = (tabId: AccountingTab) => {
    if (tabId === 'documents') {
      navigate('/accounting/documents');
      return;
    }
    setActiveLocalTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
    if (isDocumentsRoute) navigate('/accounting');
  };

  const handleExportSummary = () => {
    const rows: Array<Array<string | number>> = [
      ['Entreprise', companyIdentity.name],
      ['SIREN', companyIdentity.siren],
      ['TVA', companyIdentity.vat],
      ['Période', periodRange.label],
      [],
      ...(!autoEntrepreneurMode ? [['Facturé HT', metrics.invoicedHt] as Array<string | number>] : []),
      ['Facturé TTC', metrics.invoicedTtc],
      ['Encaissements', metrics.collected],
      ['Remboursements', metrics.refunded],
      ['Charges maintenance', metrics.maintenance],
      ['Trésorerie nette', metrics.netCash],
      ['Encours client', metrics.outstanding],
      ['Encours en retard', metrics.overdueAmount],
      ...(!autoEntrepreneurMode
        ? [
          ['TVA collectée', metrics.vatCollected],
          ['TVA déductible estimée', metrics.vatDeductible],
          ['TVA à payer', metrics.vatToPay],
        ]
        : []),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
    downloadTextFile(`synthese-comptable-${format(new Date(), 'yyyy-MM-dd')}.csv`, csv, 'text/csv;charset=utf-8;');
    toast.success('Synthèse exportée.');
  };

  const handleExportReceivables = () => {
    const rows: Array<Array<string | number>> = [
      ['Facture', 'Client', 'Échéance', 'Total TTC', 'Payé', 'Reste', 'Statut'],
      ...receivableRows.map((row) => [
        row.invoice.invoice_number,
        row.invoice.client?.name || 'Client inconnu',
        formatDateLabel(row.invoice.due_date),
        row.invoice.amount_ttc.toFixed(2),
        row.paidAmount.toFixed(2),
        row.remainingAmount.toFixed(2),
        statusLabel(row.invoice.status),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
    downloadTextFile(`balance-clients-${format(new Date(), 'yyyy-MM-dd')}.csv`, csv, 'text/csv;charset=utf-8;');
    toast.success('Balance clients exportée.');
  };

  const handleExportPayments = () => {
    const rows: Array<Array<string | number>> = [
      ['Date', 'Référence', 'Facture', 'Client', 'Méthode', 'Montant', 'Statut'],
      ...payments.map((payment) => [
        formatDateLabel(payment.payment_date),
        payment.reference || payment.id.slice(0, 8),
        payment.invoice_number || '—',
        payment.client?.name || '—',
        payment.payment_method,
        payment.amount.toFixed(2),
        statusLabel(payment.status),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n');
    downloadTextFile(`journal-paiements-${format(new Date(), 'yyyy-MM-dd')}.csv`, csv, 'text/csv;charset=utf-8;');
    toast.success('Journal des paiements exporté.');
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">CA facturé (TTC)</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.invoicedTtc)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Encaissements</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.collected)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Encours client</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.outstanding)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Trésorerie nette</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.netCash)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-base font-semibold text-gray-900">Priorités</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">
              {metrics.overdueCount} facture(s) en retard ({MONEY.format(metrics.overdueAmount)})
            </div>
            <div className="rounded-md bg-yellow-50 px-3 py-2 text-yellow-800">
              {metrics.dueSoonCount} facture(s) arrivent à échéance sous 7 jours
            </div>
            <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-700">
              {autoEntrepreneurMode
                ? 'Régime auto-entrepreneur actif: TVA non applicable.'
                : `TVA estimée à payer: ${MONEY.format(metrics.vatToPay)}`}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-base font-semibold text-gray-900">Aperçu entreprise</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Raison sociale</dt>
              <dd className="font-medium text-gray-900">{companyIdentity.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">SIREN</dt>
              <dd className="font-medium text-gray-900">{companyIdentity.siren}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">TVA</dt>
              <dd className="font-medium text-gray-900">{companyIdentity.vat}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Période active</dt>
              <dd className="font-medium text-gray-900">{periodRange.label}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );

  const renderReceivablesTab = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Recherche">
            <Input
              value={searchReceivable}
              onChange={(event) => setSearchReceivable(event.target.value)}
              placeholder="Facture ou client"
            />
          </Field>
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Factures en retard</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.overdueCount}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Montant en retard</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{MONEY.format(metrics.overdueAmount)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Facture</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Client</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Échéance</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Reste</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {receivablesFiltered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  Aucune facture à relancer pour ce filtre.
                </td>
              </tr>
            )}
            {receivablesFiltered.map((row) => (
              <tr
                key={row.invoice.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => navigate(`/accounting/documents/${row.invoice.id}`)}
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.invoice.invoice_number}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{row.invoice.client?.name || 'Client inconnu'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{formatDateLabel(row.invoice.due_date)}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{MONEY.format(row.remainingAmount)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={statusPill(row.invoice.status)}>
                    {statusLabel(row.invoice.status)}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPaymentsTab = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Encaissements</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.collected)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Remboursements</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.refunded)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Charges maintenance</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.maintenance)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-base font-semibold text-gray-900">Méthodes de paiement</h3>
          <div className="mt-3 space-y-2">
            {paymentMethodStats.length === 0 && (
              <p className="text-sm text-gray-500">Aucun paiement sur la période.</p>
            )}
            {paymentMethodStats.map((item) => (
              <div key={item.method} className="rounded-md bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between text-sm font-medium text-gray-800">
                  <span>{item.method}</span>
                  <span>{MONEY.format(item.amount)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{item.count} paiement(s)</p>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Référence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Client</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.slice(0, 25).map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700">{formatDateLabel(payment.payment_date)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{payment.reference || payment.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{payment.client?.name || '—'}</td>
                  <td className={`px-4 py-3 text-right text-sm font-semibold ${payment.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {MONEY.format(payment.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusPill(payment.status)}>
                      {statusLabel(payment.status)}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderTaxesTab = () => (
    <div className="space-y-4">
      {autoEntrepreneurMode && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Mode auto-entrepreneur actif: la TVA n’est pas calculée dans cette interface.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">TVA collectée</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.vatCollected)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">TVA déductible (estimée)</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.vatDeductible)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">TVA à payer</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{MONEY.format(metrics.vatToPay)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Contrôle de cohérence</h3>
        <p className="mt-2 text-sm text-gray-600">
          Ces montants sont une estimation opérationnelle basée sur les factures et charges présentes dans l’application.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Vérifier et valider la déclaration finale avec le cabinet comptable avant dépôt.
        </p>
      </div>
    </div>
  );

  const renderExportsTab = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Button variant="secondary" onClick={handleExportSummary} className="justify-start">
          <Download className="h-4 w-4" />
          Export synthèse comptable
        </Button>
        <Button variant="secondary" onClick={handleExportReceivables} className="justify-start">
          <Download className="h-4 w-4" />
          Export balance clients
        </Button>
        <Button variant="secondary" onClick={handleExportPayments} className="justify-start">
          <Download className="h-4 w-4" />
          Export journal paiements
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Utilité des exports</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>1. `Synthèse comptable`: vue globale de pilotage (CA, encours{autoEntrepreneurMode ? '' : ', TVA'}).</li>
          <li>2. `Balance clients`: suivi des factures non soldées et relances.</li>
          <li>3. `Journal paiements`: historique des encaissements/remboursements.</li>
        </ul>
      </div>
    </div>
  );

  const renderActiveTab = () => {
    if (activeLocalTab === 'overview') return renderOverviewTab();
    if (activeLocalTab === 'receivables') return renderReceivablesTab();
    if (activeLocalTab === 'payments') return renderPaymentsTab();
    if (activeLocalTab === 'taxes' && !autoEntrepreneurMode) return renderTaxesTab();
    return renderExportsTab();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Comptabilité</h1>
          <p className="mt-1 text-sm text-gray-500">
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => loadAccountingData(true)} loading={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Actualiser
          </Button>
          <Button onClick={() => navigate('/accounting/documents/new')}>
            <FileText className="h-4 w-4" />
            Nouveau document
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Période">
            <Select
              value={periodPreset}
              onChange={(event) => setPeriodPreset(event.target.value as PeriodPreset)}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {periodPreset === 'custom' ? (
            <>
              <Field label="Du">
                <Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              </Field>
              <Field label="Au">
                <Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
              </Field>
            </>
          ) : (
            <div className="md:col-span-2 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600 flex items-center">
              Période active: <span className="ml-2 font-medium text-gray-900">{periodRange.label}</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="min-h-[420px]">
        {loading ? (
          <div className="flex h-56 items-center justify-center rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement…
            </div>
          </div>
        ) : activeTab === 'documents' ? (
          <Outlet />
        ) : (
          <StepTransition stepKey={activeTab} direction={tabDirection}>
            {renderActiveTab()}
          </StepTransition>
        )}
      </div>
    </div>
  );
};

export default Accounting;
