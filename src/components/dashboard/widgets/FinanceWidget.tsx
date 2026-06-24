import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Euro, CheckCircle2, Clock3, AlertTriangle, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isOverdue, daysOverdue, balanceOf, type BillingDocLike } from '../../../utils/billingStatus';

export interface FinanceWidgetOptionsResolved {
  period: '6m' | '12m' | 'ytd';
  chartType: 'line' | 'bar' | 'area';
  showInvoiced: boolean;
  showCollected: boolean;
  showKpiInvoiced: boolean;
  showKpiCollected: boolean;
  showKpiOutstanding: boolean;
  showKpiOverdue: boolean;
  showOverdueList: boolean;
}

interface FinanceWidgetProps {
  options?: Partial<FinanceWidgetOptionsResolved>;
}

interface InvoiceRow extends BillingDocLike {
  id: string;
  invoice_number: string;
  amount_ttc: number | null;
  paid_amount: number | null;
  balance_due: number | null;
  status: string;
  due_date: string | null;
  issue_date: string | null;
  created_at: string;
  document_type: string | null;
  client?: { name?: string | null; company?: string | null } | null;
}

interface PaymentRow {
  amount: number | null;
  payment_date: string | null;
  status: string | null;
}

const DEFAULTS: FinanceWidgetOptionsResolved = {
  period: '12m',
  chartType: 'area',
  showInvoiced: true,
  showCollected: true,
  showKpiInvoiced: true,
  showKpiCollected: true,
  showKpiOutstanding: true,
  showKpiOverdue: true,
  showOverdueList: true,
};

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

const fmtCurrency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0);

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

const FinanceWidget: React.FC<FinanceWidgetProps> = ({ options }) => {
  const opts = { ...DEFAULTS, ...(options || {}) };
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const db = supabase as any;
        try {
          await db.rpc('mark_overdue_invoices');
        } catch (overdueErr) {
          console.warn('mark_overdue_invoices failed', overdueErr);
        }
        const [invoicesRes, paymentsRes] = await Promise.all([
          db
            .from('invoices')
            .select('id, invoice_number, amount_ttc, paid_amount, balance_due, status, due_date, issue_date, created_at, document_type, client:clients ( name, company )')
            .order('created_at', { ascending: false }),
          db
            .from('payments')
            .select('amount, payment_date, status'),
        ]);
        if (invoicesRes.error) throw invoicesRes.error;
        if (paymentsRes.error) throw paymentsRes.error;
        if (cancelled) return;
        setInvoices((invoicesRes.data || []) as InvoiceRow[]);
        setPayments((paymentsRes.data || []) as PaymentRow[]);
      } catch (err) {
        console.error('finance widget load', err);
        if (!cancelled) setError('Données financières indisponibles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const realInvoices = useMemo(
    () => invoices.filter((d) => ['invoice', 'deposit_invoice'].includes(d.document_type || 'invoice')),
    [invoices],
  );

  // Month buckets for the chart.
  const monthsCount = opts.period === '6m' ? 6 : opts.period === 'ytd' ? new Date().getMonth() + 1 : 12;
  const series = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; key: string; invoiced: number; collected: number }[] = [];
    for (let i = monthsCount - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ label: MONTH_LABELS[d.getMonth()], key: monthKey(d), invoiced: 0, collected: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b] as const));
    realInvoices.forEach((inv) => {
      if (inv.status === 'cancelled') return;
      const ref = inv.issue_date || inv.created_at;
      if (!ref) return;
      const b = byKey.get(monthKey(new Date(ref)));
      if (b) b.invoiced += inv.amount_ttc || 0;
    });
    payments.forEach((p) => {
      if (p.status === 'failed' || !p.payment_date) return;
      const b = byKey.get(monthKey(new Date(p.payment_date)));
      if (b) b.collected += p.amount || 0;
    });
    return buckets;
  }, [realInvoices, payments, monthsCount]);

  const kpis = useMemo(() => {
    const active = realInvoices.filter((d) => d.status !== 'cancelled');
    const invoiced = series.reduce((s, b) => s + b.invoiced, 0);
    const collected = series.reduce((s, b) => s + b.collected, 0);
    const outstanding = active.reduce((s, d) => s + balanceOf(d), 0);
    const overdueDocs = active.filter((d) => isOverdue(d));
    const overdue = overdueDocs.reduce((s, d) => s + balanceOf(d), 0);
    const collectRate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;
    return { invoiced, collected, outstanding, overdue, overdueCount: overdueDocs.length, collectRate };
  }, [realInvoices, series]);

  const overdueList = useMemo(
    () =>
      realInvoices
        .filter((d) => d.status !== 'cancelled' && isOverdue(d))
        .map((d) => ({ doc: d, days: daysOverdue(d), balance: balanceOf(d) }))
        .sort((a, b) => b.days - a.days)
        .slice(0, 5),
    [realInvoices],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">{error}</div>;
  }

  const kpiCards = [
    opts.showKpiInvoiced && { key: 'invoiced', label: 'Facturé', value: kpis.invoiced, icon: Euro, tint: 'bg-blue-50 text-blue-600' },
    opts.showKpiCollected && { key: 'collected', label: 'Encaissé', value: kpis.collected, icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600' },
    opts.showKpiOutstanding && { key: 'outstanding', label: 'En attente', value: kpis.outstanding, icon: Clock3, tint: 'bg-amber-50 text-amber-600' },
    opts.showKpiOverdue && {
      key: 'overdue',
      label: `En retard${kpis.overdueCount > 0 ? ` (${kpis.overdueCount})` : ''}`,
      value: kpis.overdue,
      icon: AlertTriangle,
      tint: 'bg-rose-50 text-rose-600',
    },
  ].filter(Boolean) as { key: string; label: string; value: number; icon: typeof Euro; tint: string }[];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {kpiCards.map(({ key, label, value, icon: Icon, tint }) => (
            <div key={key} className="rounded-lg border border-gray-100 bg-white p-2.5">
              <div className="flex items-center justify-between">
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
                <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-md ${tint}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-1 text-base font-bold tabular-nums text-gray-900">{fmtCurrency(value)}</p>
            </div>
          ))}
        </div>
      )}

      {(opts.showInvoiced || opts.showCollected) && (
        <FinanceChart series={series} chartType={opts.chartType} showInvoiced={opts.showInvoiced} showCollected={opts.showCollected} />
      )}

      {opts.showKpiCollected && opts.showKpiInvoiced && (
        <div className="flex items-center gap-1.5 px-1 text-xs text-gray-500">
          {kpis.collectRate >= 100 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-amber-500" />}
          Taux d'encaissement sur la période : <span className="font-semibold text-gray-700">{kpis.collectRate}%</span>
        </div>
      )}

      {opts.showOverdueList && overdueList.length > 0 && (
        <div className="rounded-lg border border-rose-100 bg-rose-50/50">
          <p className="border-b border-rose-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
            Factures en retard
          </p>
          <ul className="divide-y divide-rose-100">
            {overdueList.map(({ doc, days, balance }) => (
              <li key={doc.id}>
                <Link
                  to={`/accounting/documents/${doc.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-rose-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-800">{doc.invoice_number}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {doc.client?.name || doc.client?.company || 'Client inconnu'} · {days} j de retard
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-rose-600">{fmtCurrency(balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/* ── Inline SVG chart (no chart library in the project) ───────────────────── */

interface FinanceChartProps {
  series: { label: string; invoiced: number; collected: number }[];
  chartType: 'line' | 'bar' | 'area';
  showInvoiced: boolean;
  showCollected: boolean;
}

const W = 320;
const H = 130;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;

const FinanceChart: React.FC<FinanceChartProps> = ({ series, chartType, showInvoiced, showCollected }) => {
  const max = Math.max(
    1,
    ...series.map((b) => Math.max(showInvoiced ? b.invoiced : 0, showCollected ? b.collected : 0)),
  );
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const n = series.length;
  const x = (i: number) => (n <= 1 ? PAD_X + innerW / 2 : PAD_X + (innerW * i) / (n - 1));
  const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;

  const buildPath = (key: 'invoiced' | 'collected') =>
    series.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(b[key]).toFixed(1)}`).join(' ');

  const buildArea = (key: 'invoiced' | 'collected') =>
    `${buildPath(key)} L ${x(n - 1).toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD_TOP + innerH).toFixed(1)} Z`;

  const renderSeries = (key: 'invoiced' | 'collected', color: string) => {
    if (chartType === 'bar') {
      const groupW = innerW / n;
      const barW = Math.max(2, (groupW * 0.6) / (showInvoiced && showCollected ? 2 : 1));
      const offset = showInvoiced && showCollected ? (key === 'invoiced' ? -barW / 2 : barW / 2) : 0;
      return series.map((b, i) => {
        const cx = PAD_X + groupW * i + groupW / 2 + offset;
        const barH = (b[key] / max) * innerH;
        return (
          <rect
            key={`${key}-${i}`}
            x={(cx - barW / 2).toFixed(1)}
            y={(PAD_TOP + innerH - barH).toFixed(1)}
            width={barW.toFixed(1)}
            height={barH.toFixed(1)}
            rx={1}
            fill={color}
            opacity={key === 'collected' ? 0.9 : 0.7}
          />
        );
      });
    }
    return (
      <>
        {chartType === 'area' && <path d={buildArea(key)} fill={color} opacity={0.12} />}
        <path d={buildPath(key)} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </>
    );
  };

  return (
    <div className="min-h-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full">
        {showInvoiced && renderSeries('invoiced', '#2563eb')}
        {showCollected && renderSeries('collected', '#10b981')}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[9px] text-gray-400">
        {series.map((b, i) => (
          <span key={i} className={n > 8 && i % 2 === 1 ? 'opacity-0 sm:opacity-100' : ''}>{b.label}</span>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-3 px-1 text-[11px] text-gray-500">
        {showInvoiced && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" />Facturé</span>}
        {showCollected && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Encaissé</span>}
      </div>
    </div>
  );
};

export default FinanceWidget;
