import React, { useEffect, useState } from 'react';
import ClientPortalLayout from './ClientPortalLayout';
import { Download, FileText, AlertCircle, Loader2 } from 'lucide-react';

type Invoice = {
  id: string;
  invoice_number: string;
  document_type: string;
  status: string;
  amount_ht: number;
  amount_ttc: number;
  vat_amount: number;
  due_date: string | null;
  paid_date: string | null;
  created_at: string;
  rental_id: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:   { label: 'En attente',  className: 'bg-amber-100 text-amber-700' },
  overdue:   { label: 'En retard',   className: 'bg-red-100 text-red-700' },
  paid:      { label: 'Payée',       className: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Annulée',     className: 'bg-gray-100 text-gray-500' },
  draft:     { label: 'Brouillon',   className: 'bg-gray-100 text-gray-400' },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice:         'Facture',
  deposit_invoice: 'Facture d\'acompte',
};

const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const InvoicesContent: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token') || '';
    fetch('/api/client-portal/invoices', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setInvoices(d.invoices || []))
      .catch(() => setError('Impossible de charger vos factures.'))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (inv: Invoice) => {
    if (downloading) return;
    setDownloading(inv.id);
    try {
      const token = localStorage.getItem('cp_token') || '';
      const res = await fetch(`/api/client-portal/invoices/${inv.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Impossible de télécharger cette facture.');
    } finally {
      setDownloading(null);
    }
  };

  // Summary stats
  const total = invoices.reduce((s, i) => s + i.amount_ttc, 0);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount_ttc, 0);
  const pending = invoices.filter((i) => ['pending', 'overdue'].includes(i.status)).reduce((s, i) => s + i.amount_ttc, 0);
  const overdue = invoices.filter((i) => i.status === 'overdue');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-100 px-5 py-4 text-red-700 text-sm">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total facturé', value: fmt(total), color: 'text-slate-900' },
            { label: 'Réglé', value: fmt(paid), color: 'text-emerald-600' },
            { label: 'En attente de règlement', value: fmt(pending), color: pending > 0 ? 'text-amber-600' : 'text-slate-400' },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs text-slate-400 mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Alerte factures en retard */}
      {overdue.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            Vous avez {overdue.length} facture{overdue.length > 1 ? 's' : ''} en retard de paiement.
            Veuillez contacter votre prestataire.
          </p>
        </div>
      )}

      {/* Liste */}
      {invoices.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucune facture disponible pour le moment.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Référence</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Échéance</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Montant TTC</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut</th>
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const status = STATUS_CONFIG[inv.status] || { label: inv.status, className: 'bg-gray-100 text-gray-500' };
                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 font-mono text-slate-700 font-medium">{inv.invoice_number}</td>
                    <td className="px-5 py-4 text-slate-500 hidden sm:table-cell">
                      {DOC_TYPE_LABEL[inv.document_type] || inv.document_type}
                    </td>
                    <td className="px-5 py-4 text-slate-500 hidden md:table-cell">{fmtDate(inv.created_at)}</td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      {inv.status === 'paid' && inv.paid_date
                        ? <span className="text-emerald-600 text-xs">Payée le {fmtDate(inv.paid_date)}</span>
                        : <span className={inv.status === 'overdue' ? 'text-red-600 font-medium' : 'text-slate-500'}>{fmtDate(inv.due_date)}</span>
                      }
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-900">{fmt(inv.amount_ttc)}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => handleDownload(inv)}
                        disabled={downloading === inv.id}
                        title="Télécharger le PDF"
                        className="rounded-lg p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition"
                      >
                        {downloading === inv.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Download className="h-4 w-4" />
                        }
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const ClientPortalInvoices: React.FC = () => (
  <ClientPortalLayout>
    {() => (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div>
          <p className="text-sm font-medium text-emerald-600 uppercase tracking-wider mb-1">Facturation</p>
          <h1 className="text-2xl font-bold text-slate-900">Mes factures</h1>
        </div>
        <InvoicesContent />
      </div>
    )}
  </ClientPortalLayout>
);

export default ClientPortalInvoices;
