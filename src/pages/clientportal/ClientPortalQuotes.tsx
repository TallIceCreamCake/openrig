import React, { useEffect, useRef, useState } from 'react';
import ClientPortalLayout from './ClientPortalLayout';
import {
  Download, FileText, AlertCircle, Loader2, CheckCircle,
  XCircle, Clock, PenLine, X, ChevronRight, MessageSquare,
} from 'lucide-react';

type Quote = {
  id: string;
  invoice_number: string;
  document_type: string;
  status: string;
  quote_status: string | null;
  amount_ht: number;
  amount_ttc: number;
  vat_amount: number;
  due_date: string | null;
  created_at: string;
  rental_id: string | null;
};

type Decision = 'accept' | 'refuse' | 'modification';

const FINAL_STATUSES = new Set(['accepted', 'rejected', 'invoiced', 'expired']);

const CONSENT_TEXT =
  "Je confirme être habilité(e) à valider ce devis et j'accepte que cette validation soit enregistrée comme signature électronique simple.";

const STATUS_CFG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  draft:    { label: 'En attente', className: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <Clock className="h-3 w-3" /> },
  none:     { label: 'En attente', className: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <Clock className="h-3 w-3" /> },
  sent:     { label: 'À signer',  className: 'bg-blue-100 text-blue-700',                          icon: <PenLine className="h-3 w-3" /> },
  accepted: { label: 'Accepté',   className: 'bg-emerald-100 text-emerald-700',                    icon: <CheckCircle className="h-3 w-3" /> },
  rejected: { label: 'Refusé',    className: 'bg-red-100 text-red-700',                            icon: <XCircle className="h-3 w-3" /> },
  declined: { label: 'Refusé',    className: 'bg-red-100 text-red-700',                            icon: <XCircle className="h-3 w-3" /> },
  expired:  { label: 'Expiré',    className: 'bg-slate-100 text-slate-500',                        icon: <Clock className="h-3 w-3" /> },
  invoiced: { label: 'Facturé',   className: 'bg-indigo-100 text-indigo-700',                      icon: <CheckCircle className="h-3 w-3" /> },
};

const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const quoteStatusKey = (q: Quote) =>
  (q.quote_status && q.quote_status !== 'none') ? q.quote_status : (q.status === 'draft' ? 'draft' : 'none');
const isSignable = (q: Quote) => !FINAL_STATUSES.has(q.quote_status ?? '');

// ─── Signing modal ─────────────────────────────────────────────────────────────

interface SignModalProps {
  quote: Quote;
  onClose: () => void;
  onSigned: (quoteId: string, newStatus: string) => void;
}

const SignModal: React.FC<SignModalProps> = ({ quote, onClose, onSigned }) => {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [signerName, setSignerName] = useState('');
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && !submitting) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [submitting, onClose]);

  const needsConsent = decision === 'accept' || decision === 'refuse';
  const canSubmit = decision && signerName.trim().length >= 2 && (!needsConsent || consent);

  const handleSubmit = async () => {
    setError('');
    if (!decision) { setError('Choisissez une décision.'); return; }
    if (signerName.trim().length < 2) { setError('Indiquez votre nom complet.'); return; }
    if (needsConsent && !consent) { setError('Vous devez accepter la mention de signature électronique.'); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('cp_token') || '';
      const res = await fetch(`/api/client-portal/quotes/${quote.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision, signer_name: signerName.trim(), comment: comment.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setDone(true);
      onSigned(quote.id, body.quote_status);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'devis_deja_traite') setError('Ce devis a déjà été traité.');
      else if (msg === 'acces_refuse') setError('Accès refusé.');
      else setError(`Erreur : ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen
  if (done) {
    const accepted = decision === 'accept';
    const refused = decision === 'refuse';
    return (
      <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className={`h-16 w-16 rounded-full mx-auto mb-5 flex items-center justify-center ${accepted ? 'bg-emerald-100' : refused ? 'bg-red-100' : 'bg-blue-100'}`}>
            {accepted ? <CheckCircle className="h-8 w-8 text-emerald-600" /> : refused ? <XCircle className="h-8 w-8 text-red-600" /> : <MessageSquare className="h-8 w-8 text-blue-600" />}
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {accepted ? 'Devis accepté' : refused ? 'Devis refusé' : 'Modification demandée'}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {accepted
              ? 'Votre confirmation a été enregistrée. Notre équipe prendra contact avec vous prochainement.'
              : refused
                ? 'Votre refus a bien été enregistré.'
                : 'Votre demande de modification a été transmise. Un devis révisé vous sera envoyé.'}
          </p>
          {accepted && (
            <p className="text-xs text-slate-400 mb-6 border border-slate-100 rounded-xl p-3 text-left leading-relaxed">
              {CONSENT_TEXT}
            </p>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // ── Decision form
  const DECISIONS: Array<{ key: Decision; label: string; desc: string; color: string; icon: React.ReactNode }> = [
    { key: 'accept',       label: 'Accepter',              desc: 'Valider le devis tel quel.',                color: 'border-emerald-400 bg-emerald-50 text-emerald-800', icon: <CheckCircle className="h-5 w-5 text-emerald-600" /> },
    { key: 'modification', label: 'Demander une modification', desc: 'Signaler une correction à apporter.', color: 'border-blue-400 bg-blue-50 text-blue-800',           icon: <MessageSquare className="h-5 w-5 text-blue-600" /> },
    { key: 'refuse',       label: 'Refuser',               desc: 'Ne pas donner suite à ce devis.',           color: 'border-red-300 bg-red-50 text-red-700',             icon: <XCircle className="h-5 w-5 text-red-500" /> },
  ];

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Signature électronique</p>
            <h2 className="text-lg font-bold text-slate-900">{quote.invoice_number}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {fmt(quote.amount_ttc)} TTC
              {quote.due_date && ` · validité ${fmtDate(quote.due_date)}`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Decision */}
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2.5">Votre décision</p>
            <div className="space-y-2">
              {DECISIONS.map(d => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDecision(d.key)}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    decision === d.key ? d.color + ' border-2' : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  {d.icon}
                  <div>
                    <p className="text-sm font-semibold">{d.label}</p>
                    <p className="text-xs text-slate-400">{d.desc}</p>
                  </div>
                  {decision === d.key && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
                </button>
              ))}
            </div>
          </div>

          {/* Comment (modification / refuse) */}
          {(decision === 'modification' || decision === 'refuse') && (
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                {decision === 'modification' ? 'Précisez la modification souhaitée' : 'Motif du refus'}
                {decision === 'refuse' && <span className="font-normal text-slate-400 ml-1">(optionnel)</span>}
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={decision === 'modification' ? 'Décrivez la correction attendue…' : 'Expliquez votre refus…'}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-none"
              />
            </div>
          )}

          {/* Signer name */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Votre nom complet <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Prénom Nom"
              maxLength={120}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* Consent (accept / refuse) */}
          {needsConsent && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-emerald-600"
              />
              <span className="text-xs text-slate-500 leading-relaxed">{CONSENT_TEXT}</span>
            </label>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all ${
              decision === 'accept'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40'
                : decision === 'refuse'
                  ? 'bg-red-500 text-white hover:bg-red-600 disabled:opacity-40'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40'
            } disabled:cursor-not-allowed`}
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Envoi…</>
              : decision === 'accept'
                ? <><CheckCircle className="h-4 w-4" /> Confirmer l'acceptation</>
                : decision === 'refuse'
                  ? <><XCircle className="h-4 w-4" /> Confirmer le refus</>
                  : <><MessageSquare className="h-4 w-4" /> Envoyer la demande</>
            }
          </button>

          <p className="text-center text-xs text-slate-400">
            Cette validation constitue une signature électronique simple conforme à l'eIDAS.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Main quotes component ──────────────────────────────────────────────────────

const QuotesContent: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [signingQuote, setSigningQuote] = useState<Quote | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token') || '';
    fetch('/api/client-portal/quotes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setQuotes(d.quotes || []))
      .catch(e => setError(`Impossible de charger vos devis. (${e.message})`))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (q: Quote) => {
    if (downloading) return;
    setDownloading(q.id);
    try {
      const token = localStorage.getItem('cp_token') || '';
      const res = await fetch(`/api/client-portal/quotes/${q.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${q.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Impossible de télécharger ce devis.');
    } finally {
      setDownloading(null);
    }
  };

  const handleSigned = (quoteId: string, newStatus: string) => {
    setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, quote_status: newStatus } : q));
  };

  const pending  = quotes.filter(q => isSignable(q) && q.quote_status === 'sent').length;
  const accepted = quotes.filter(q => q.quote_status === 'accepted').length;
  const total    = quotes.reduce((s, q) => s + q.amount_ttc, 0);

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
    <>
      {signingQuote && (
        <SignModal
          quote={signingQuote}
          onClose={() => setSigningQuote(null)}
          onSigned={handleSigned}
        />
      )}

      {/* Pending banner */}
      {pending > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-center gap-3">
          <PenLine className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-800 font-medium">
            {pending === 1
              ? 'Un devis est en attente de votre signature.'
              : `${pending} devis sont en attente de votre signature.`}
          </p>
        </div>
      )}

      {quotes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'À signer',       value: String(pending),  color: pending > 0 ? 'text-blue-600' : 'text-slate-400' },
            { label: 'Devis acceptés', value: String(accepted), color: accepted > 0 ? 'text-emerald-600' : 'text-slate-400' },
            { label: 'Valeur totale',  value: fmt(total),       color: 'text-slate-900' },
          ].map(k => (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs text-slate-400 mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {quotes.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun devis disponible pour le moment.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Référence</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Validité</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Montant TTC</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut</th>
                <th className="px-3 py-3 w-24 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotes.map(q => {
                const qs = quoteStatusKey(q);
                const statusCfg = STATUS_CFG[qs] || STATUS_CFG.draft;
                const signable = isSignable(q);
                return (
                  <tr key={q.id} className={`transition-colors ${signable && qs === 'sent' ? 'bg-blue-50/30 hover:bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                    <td className="px-5 py-4 font-mono text-slate-700 font-medium">{q.invoice_number}</td>
                    <td className="px-5 py-4 text-slate-500 hidden md:table-cell">{fmtDate(q.created_at)}</td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className={qs === 'expired' ? 'text-slate-400 line-through' : 'text-slate-500'}>
                        {fmtDate(q.due_date)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-900">{fmt(q.amount_ttc)}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                        {statusCfg.icon}
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* Sign button — only for signable quotes */}
                        {signable && (
                          <button
                            type="button"
                            onClick={() => setSigningQuote(q)}
                            title="Signer ce devis"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1"
                          >
                            <PenLine className="h-3 w-3" />
                            Signer
                          </button>
                        )}
                        {/* Download */}
                        <button
                          type="button"
                          onClick={() => handleDownload(q)}
                          disabled={downloading === q.id}
                          title="Télécharger le PDF"
                          className="rounded-lg p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition"
                        >
                          {downloading === q.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Download className="h-4 w-4" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

const ClientPortalQuotes: React.FC = () => (
  <ClientPortalLayout>
    {() => (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div>
          <p className="text-sm font-medium text-emerald-600 uppercase tracking-wider mb-1">Documents</p>
          <h1 className="text-2xl font-bold text-slate-900">Mes devis</h1>
        </div>
        <QuotesContent />
      </div>
    )}
  </ClientPortalLayout>
);

export default ClientPortalQuotes;
