import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowDownLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Mail,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { StatusBadge } from '../ui-kit';

/* ─── types ─────────────────────────────────────────────────── */

export interface InvoiceFinancialPanelProps {
  invoiceId: string | null;
  rentalId?: string | null;
  totalTTC: number;
  clientEmail?: string | null;
  clientName?: string | null;
  invoiceNumber?: string | null;
  /** Called after any payment mutation so the parent can refresh totals */
  onPaymentChange?: () => void;
}

type PaymentMethod = 'Virement bancaire' | 'Chèque' | 'Carte bancaire' | 'Espèces' | 'Prélèvement SEPA' | 'Autre';

interface PaymentRow {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference: string | null;
  status: string;
  payment_type: string;
  proof_url: string | null;
}

interface ScheduleInstallment {
  id: string;
  installment_no: number;
  label: string | null;
  due_date: string;
  due_amount: number;
  paid_amount: number;
  penalty_amount: number;
  penalty_rate: number;
  status: string;
  last_reminder_at: string | null;
}

type ScheduleTemplate = { label: string; divisor: number };
const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  { label: '÷ 2', divisor: 2 },
  { label: '÷ 3', divisor: 3 },
  { label: '÷ 4', divisor: 4 },
  { label: '÷ 10', divisor: 10 },
];

const PAYMENT_METHODS: PaymentMethod[] = [
  'Virement bancaire',
  'Chèque',
  'Carte bancaire',
  'Espèces',
  'Prélèvement SEPA',
  'Autre',
];

const SCHEDULE_STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'emerald' | 'amber' | 'rose' | 'slate' }> = {
  pending:        { label: 'En attente',    tone: 'gray' },
  partially_paid: { label: 'Partiel',       tone: 'amber' },
  paid:           { label: 'Payé',          tone: 'emerald' },
  overdue:        { label: 'En retard',     tone: 'rose' },
  cancelled:      { label: 'Annulé',        tone: 'slate' },
};

const fmtMoney = (v: number) =>
  v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('fr-FR') : '—';

const todayISO = () => new Date().toISOString().slice(0, 10);

/* add N months to a date string (YYYY-MM-DD) */
const addMonths = (dateStr: string, months: number): string => {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

/* ─── main component ─────────────────────────────────────────── */

const InvoiceFinancialPanel: React.FC<InvoiceFinancialPanelProps> = ({
  invoiceId,
  rentalId,
  totalTTC,
  clientEmail,
  clientName,
  invoiceNumber,
  onPaymentChange,
}) => {
  /* payments */
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  /* schedule */
  const [useSchedule, setUseSchedule] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleInstallment[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  /* payment form */
  const [pmType, setPmType] = useState<'payment' | 'refund'>('payment');
  const [pmAmount, setPmAmount] = useState('');
  const [pmMethod, setPmMethod] = useState<PaymentMethod>('Virement bancaire');
  const [pmDate, setPmDate] = useState(todayISO());
  const [pmRef, setPmRef] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  /* schedule creation */
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleManual, setScheduleManual] = useState<{ due_date: string; due_amount: string }[]>([
    { due_date: addMonths(todayISO(), 1), due_amount: '' },
  ]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  /* penalty modal */
  const [penaltyTarget, setPenaltyTarget] = useState<ScheduleInstallment | null>(null);
  const [penaltyRate, setPenaltyRate] = useState('10');
  const [savingPenalty, setSavingPenalty] = useState(false);

  /* reminder */
  const [sendingReminder, setSendingReminder] = useState(false);

  /* generic PDF */
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  /* ── data fetching ── */

  const loadPayments = useCallback(async () => {
    if (!invoiceId && !rentalId) return;
    setLoadingPayments(true);
    try {
      let q = (supabase as any).from('payments').select('*').order('payment_date', { ascending: false });
      if (rentalId && invoiceId) {
        q = q.or(`rental_id.eq.${rentalId},invoice_id.eq.${invoiceId}`);
      } else if (invoiceId) {
        q = q.eq('invoice_id', invoiceId);
      } else {
        q = q.eq('rental_id', rentalId);
      }
      const { data, error } = await q;
      if (error) throw error;
      setPayments(data || []);
    } catch (e) {
      console.error('load payments', e);
    } finally {
      setLoadingPayments(false);
    }
  }, [invoiceId, rentalId]);

  const loadScheduleAndFlag = useCallback(async () => {
    if (!invoiceId) return;
    setLoadingSchedule(true);
    try {
      const { data: inv, error: invErr } = await (supabase as any)
        .from('invoices')
        .select('use_payment_schedule')
        .eq('id', invoiceId)
        .maybeSingle();
      if (invErr) throw invErr;
      const flag = Boolean(inv?.use_payment_schedule);
      setUseSchedule(flag);

      if (flag) {
        const { data: rows, error: rowsErr } = await (supabase as any)
          .from('invoice_payment_schedules')
          .select('*')
          .eq('invoice_id', invoiceId)
          .order('installment_no', { ascending: true });
        if (rowsErr) throw rowsErr;
        setSchedule(rows || []);
      }
    } catch (e) {
      console.error('load schedule', e);
    } finally {
      setLoadingSchedule(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    loadPayments();
    loadScheduleAndFlag();
  }, [loadPayments, loadScheduleAndFlag]);

  /* ── derived ── */

  const totalPaid = payments
    .filter((p) => p.status !== 'failed' && p.payment_type !== 'refund')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalRefunded = payments
    .filter((p) => p.payment_type === 'refund')
    .reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0);
  const netPaid = totalPaid - totalRefunded;            // can exceed totalTTC
  const overpaid = Math.max(0, netPaid - totalTTC);
  const remaining = Math.max(0, totalTTC - netPaid);
  const progressPct = totalTTC > 0 ? Math.min(100, (Math.max(0, netPaid) / totalTTC) * 100) : 0;

  /* ── toggle schedule mode ── */

  const handleToggleSchedule = async (on: boolean) => {
    if (!invoiceId) {
      toast.error('Enregistrez d\'abord la facture pour activer l\'échéancier.');
      return;
    }
    setUseSchedule(on);
    await (supabase as any)
      .from('invoices')
      .update({ use_payment_schedule: on })
      .eq('id', invoiceId);

    if (on && schedule.length === 0) setShowScheduleModal(true);
    if (!on) setSchedule([]);
  };

  /* ── schedule creation ── */

  const applyTemplate = (divisor: number) => {
    const perInstallment = +(totalTTC / divisor).toFixed(2);
    const rows: { due_date: string; due_amount: string }[] = [];
    for (let i = 0; i < divisor; i++) {
      rows.push({
        due_date: addMonths(todayISO(), i + 1),
        due_amount: i === divisor - 1
          ? (totalTTC - perInstallment * (divisor - 1)).toFixed(2)
          : perInstallment.toFixed(2),
      });
    }
    setScheduleManual(rows);
  };

  const handleSaveSchedule = async () => {
    if (!invoiceId) return;
    const rows = scheduleManual.filter((r) => r.due_date && parseFloat(r.due_amount) > 0);
    if (rows.length === 0) {
      toast.error('Ajoutez au moins une échéance valide.');
      return;
    }
    setSavingSchedule(true);
    try {
      /* clear existing */
      await (supabase as any)
        .from('invoice_payment_schedules')
        .delete()
        .eq('invoice_id', invoiceId);

      const inserts = rows.map((r, i) => ({
        invoice_id: invoiceId,
        installment_no: i + 1,
        label: `Échéance ${i + 1}`,
        due_date: r.due_date,
        due_amount: parseFloat(r.due_amount),
        paid_amount: 0,
        status: 'pending',
      }));
      const { data, error } = await (supabase as any)
        .from('invoice_payment_schedules')
        .insert(inserts)
        .select('*');
      if (error) throw error;
      setSchedule(data || []);
      setShowScheduleModal(false);
      toast.success('Échéancier créé');
    } catch (e) {
      console.error('save schedule', e);
      toast.error('Erreur lors de la création de l\'échéancier');
    } finally {
      setSavingSchedule(false);
    }
  };

  /* ── mark installment paid ── */

  const handleMarkInstallmentPaid = async (inst: ScheduleInstallment) => {
    if (!invoiceId) return;
    const due = inst.due_amount + inst.penalty_amount;
    try {
      /* record payment */
      const { data: pmt, error: pmtErr } = await (supabase as any)
        .from('payments')
        .insert([{
          invoice_id: invoiceId,
          rental_id: rentalId || null,
          amount: due,
          payment_method: pmMethod,
          payment_date: todayISO(),
          status: 'completed',
          payment_type: 'payment',
        }])
        .select('*')
        .single();
      if (pmtErr) throw pmtErr;

      /* allocation */
      await (supabase as any)
        .from('invoice_payment_allocations')
        .insert([{
          invoice_id: invoiceId,
          payment_id: pmt.id,
          schedule_id: inst.id,
          amount: due,
        }]);

      /* update installment */
      await (supabase as any)
        .from('invoice_payment_schedules')
        .update({ paid_amount: due, status: 'paid' })
        .eq('id', inst.id);

      await loadPayments();
      await loadScheduleAndFlag();
      onPaymentChange?.();
      toast.success(`Échéance ${inst.installment_no} marquée payée`);
    } catch (e) {
      console.error('mark paid', e);
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  /* ── apply penalty ── */

  const handleApplyPenalty = async () => {
    if (!penaltyTarget || !invoiceId) return;
    const rate = parseFloat(penaltyRate);
    if (!isFinite(rate) || rate <= 0) {
      toast.error('Taux invalide');
      return;
    }
    setSavingPenalty(true);
    try {
      const penalty = +(penaltyTarget.due_amount * rate / 100).toFixed(2);
      const { error } = await (supabase as any)
        .from('invoice_payment_schedules')
        .update({
          penalty_amount: penalty,
          penalty_rate: rate,
          status: 'overdue',
        })
        .eq('id', penaltyTarget.id);
      if (error) throw error;
      await loadScheduleAndFlag();
      setPenaltyTarget(null);
      toast.success(`Pénalité de ${fmtMoney(penalty)} appliquée`);
    } catch (e) {
      console.error('penalty', e);
      toast.error('Erreur pénalité');
    } finally {
      setSavingPenalty(false);
    }
  };

  /* ── record payment (form) ── */

  const handleRecordPayment = async () => {
    if (!invoiceId && !rentalId) return;
    const amount = parseFloat(pmAmount.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) {
      toast.error('Montant invalide');
      return;
    }
    const isRefund = pmType === 'refund';
    if (isRefund && amount > netPaid + 0.005) {
      toast.error(`Remboursement impossible : dépasse le montant encaissé (${fmtMoney(Math.max(0, netPaid))})`);
      return;
    }
    setSavingPayment(true);
    try {
      const insertedAmount = isRefund ? -amount : amount;
      const { data: inserted, error } = await (supabase as any)
        .from('payments')
        .insert([{
          invoice_id: invoiceId || null,
          rental_id: rentalId || null,
          amount: insertedAmount,
          payment_method: pmMethod,
          payment_date: pmDate || todayISO(),
          reference: pmRef.trim() || null,
          status: 'completed',
          payment_type: isRefund ? 'refund' : 'payment',
        }])
        .select('*')
        .single();
      if (error) throw error;

      /* For encaissements : create allocation so DB trigger recomputes invoice totals.
         Refunds are negative and cannot go into invoice_payment_allocations (check > 0),
         so we rely on the invoice status recompute via the payment trigger instead. */
      if (!isRefund && invoiceId) {
        await (supabase as any)
          .from('invoice_payment_allocations')
          .insert([{ invoice_id: invoiceId, payment_id: inserted.id, amount }]);
      }

      setPayments((prev) => [inserted, ...prev]);
      setPmAmount('');
      setPmRef('');
      setPmDate(todayISO());
      setPmType('payment');
      onPaymentChange?.();
      toast.success(isRefund ? 'Remboursement enregistré' : 'Paiement enregistré');
    } catch (e) {
      console.error('record payment', e);
      toast.error(isRefund ? 'Impossible d\'enregistrer le remboursement' : 'Impossible d\'enregistrer le paiement');
    } finally {
      setSavingPayment(false);
    }
  };

  /* ── delete payment ── */

  const handleDeletePayment = async (id: string) => {
    if (!window.confirm('Supprimer ce paiement ?')) return;
    try {
      const { error } = await (supabase as any).from('payments').delete().eq('id', id);
      if (error) throw error;
      setPayments((prev) => prev.filter((p) => p.id !== id));
      onPaymentChange?.();
      toast.success('Paiement supprimé');
    } catch (e) {
      console.error('delete payment', e);
      toast.error('Suppression impossible');
    }
  };

  /* ── reminder ── */

  const handleSendReminder = async () => {
    if (!invoiceId) {
      toast.error('Facture non enregistrée');
      return;
    }
    if (!clientEmail) {
      toast.error('Adresse e-mail client manquante');
      return;
    }
    setSendingReminder(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: clientEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur serveur');
      toast.success('Relance envoyée par email');
    } catch (e) {
      console.error('reminder', e);
      toast.error(e instanceof Error ? e.message : 'Impossible d\'envoyer la relance');
    } finally {
      setSendingReminder(false);
    }
  };

  /* ── generic PDF ── */

  const handleDownloadGenericPdf = async (type: 'balance' | 'schedule' | 'proof') => {
    if (!invoiceId) {
      toast.error('Facture non enregistrée');
      return;
    }
    setGeneratingPdf(type);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf-generic?type=${type}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur serveur');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const typeName = type === 'balance' ? 'Reste-a-charge' : type === 'schedule' ? 'Echeancier' : 'Preuve-paiement';
      a.download = `${typeName}-${invoiceNumber || invoiceId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('generic pdf', e);
      toast.error(e instanceof Error ? e.message : 'Erreur PDF');
    } finally {
      setGeneratingPdf(null);
    }
  };

  /* ─────────────────── render ─────────────────────────────────── */

  return (
    <div className="space-y-5">

      {/* ── progress summary ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total TTC</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtMoney(totalTTC)}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Encaissé</p>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(netPaid)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Reste</p>
              <p className={`font-semibold ${remaining > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {fmtMoney(remaining)}
              </p>
            </div>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {totalRefunded > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {fmtMoney(totalRefunded)} remboursé(s)
          </p>
        )}
        {overpaid > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Trop-perçu de <strong>{fmtMoney(overpaid)}</strong> — un remboursement est recommandé.</span>
          </div>
        )}
      </div>

      {/* ── schedule toggle ── */}
      {invoiceId && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mode échéancier</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Échelonner le paiement en plusieurs fois</p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleSchedule(!useSchedule)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${useSchedule ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${useSchedule ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>
      )}

      {/* ── schedule section ── */}
      {useSchedule && invoiceId && (
        <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Échéancier
            </h4>
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              {schedule.length > 0 ? 'Recréer' : 'Créer'}
            </button>
          </div>

          {loadingSchedule ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : schedule.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aucun échéancier — cliquez sur "Créer".
            </p>
          ) : (
            <div className="space-y-2">
              {schedule.map((inst) => {
                const statusMeta = SCHEDULE_STATUS[inst.status] || SCHEDULE_STATUS.pending;
                const totalDue = inst.due_amount + inst.penalty_amount;
                const isPaid = inst.status === 'paid';
                const isOverdue = inst.status === 'overdue' ||
                  (inst.status === 'pending' && new Date(inst.due_date) < new Date());
                return (
                  <div
                    key={inst.id}
                    className={`rounded-lg border bg-white dark:bg-gray-900 p-3 ${isOverdue && !isPaid ? 'border-rose-200 dark:border-rose-800' : 'border-gray-200 dark:border-gray-700'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            #{inst.installment_no}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {fmtMoney(totalDue)}
                          </span>
                          {inst.penalty_amount > 0 && (
                            <span className="text-xs text-rose-600 dark:text-rose-400">
                              dont {fmtMoney(inst.penalty_amount)} de pénalités
                            </span>
                          )}
                          <StatusBadge tone={statusMeta.tone} size="xs">
                            {statusMeta.label}
                          </StatusBadge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Échéance : {fmtDate(inst.due_date)}
                          {inst.paid_amount > 0 && ` • Payé : ${fmtMoney(inst.paid_amount)}`}
                        </p>
                      </div>
                      {!isPaid && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!inst.penalty_amount && (
                            <button
                              type="button"
                              onClick={() => {
                                setPenaltyTarget(inst);
                                setPenaltyRate('10');
                              }}
                              className="px-2 py-1 text-xs rounded-md border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            >
                              Pénalité
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleMarkInstallmentPaid(inst)}
                            className="px-2 py-1 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                          >
                            Marquer payé
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── record payment / refund form ── */}
      <div className={`rounded-xl border bg-white dark:bg-gray-900 p-4 space-y-3 ${pmType === 'refund' ? 'border-rose-200 dark:border-rose-800' : 'border-gray-200 dark:border-gray-700'}`}>
        {/* toggle encaissement / remboursement */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs font-medium">
          <button
            type="button"
            onClick={() => { setPmType('payment'); setPmAmount(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${pmType === 'payment' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            <Plus className="h-3.5 w-3.5" /> Encaissement
          </button>
          <button
            type="button"
            onClick={() => { setPmType('refund'); setPmAmount(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${pmType === 'refund' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" /> Remboursement
          </button>
        </div>

        {pmType === 'refund' && netPaid <= 0 ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">Aucun encaissement à rembourser.</p>
        ) : (
          <>
            {pmType === 'refund' && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Maximum remboursable : <strong>{fmtMoney(Math.max(0, netPaid))}</strong>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {pmType === 'refund' ? 'Montant à rembourser *' : 'Montant *'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={pmType === 'refund' ? Math.max(0, netPaid).toFixed(2) : undefined}
                  value={pmAmount}
                  onChange={(e) => setPmAmount(e.target.value)}
                  placeholder="0.00"
                  className={`w-full rounded-lg border bg-white dark:bg-gray-800 px-3 py-2 text-sm text-right font-medium focus:outline-none dark:text-gray-200 dark:placeholder-gray-500 ${pmType === 'refund' ? 'border-rose-300 dark:border-rose-700 focus:border-rose-500' : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'}`}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Mode *</label>
                <select
                  value={pmMethod}
                  onChange={(e) => setPmMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:text-gray-200"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date *</label>
                <input
                  type="date"
                  value={pmDate}
                  onChange={(e) => setPmDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:text-gray-200"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Référence</label>
                <input
                  type="text"
                  value={pmRef}
                  onChange={(e) => setPmRef(e.target.value)}
                  placeholder="optionnel"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={savingPayment || !pmAmount}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors ${pmType === 'refund' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {savingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                {pmType === 'refund' ? 'Rembourser' : 'Enregistrer'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── payment history ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-gray-500" />
          Historique des paiements
        </h4>
        {loadingPayments ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucun paiement enregistré.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-start justify-between rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${p.payment_type === 'refund' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {p.payment_type === 'refund' ? '-' : ''}{fmtMoney(Math.abs(Number(p.amount)))}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{p.payment_method}</span>
                    {p.payment_type === 'deposit' && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        Acompte
                      </span>
                    )}
                    {p.payment_type === 'refund' && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                        Remboursement
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {fmtDate(p.payment_date)}
                    {p.reference && ` • Réf: ${p.reference}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePayment(p.id)}
                  className="ml-2 flex-shrink-0 p-1 rounded-md text-gray-300 dark:text-gray-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── reminder ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Envoyer une relance</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {clientEmail
              ? `Email avec la facture en PJ → ${clientEmail}`
              : 'Aucun email client renseigné'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSendReminder}
          disabled={sendingReminder || !clientEmail || !invoiceId}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors flex-shrink-0"
        >
          {sendingReminder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Relancer
        </button>
      </div>

      {/* ── generic PDF cards ── */}
      {invoiceId && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-0.5">
            Documents génériques
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { type: 'balance' as const, icon: CreditCard, label: 'Reste à charge', desc: 'Solde restant dû' },
              { type: 'schedule' as const, icon: Calendar, label: 'Échéancier', desc: 'Plan de paiement', disabled: !useSchedule || schedule.length === 0 },
              { type: 'proof' as const, icon: FileText, label: 'Preuve de paiement', desc: 'Quittance des versements' },
            ] as const).map(({ type, icon: Icon, label, desc, disabled }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleDownloadGenericPdf(type)}
                disabled={!!disabled || generatingPdf === type}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  {generatingPdf === type
                    ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    : <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{label}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{disabled ? 'Activer l\'échéancier' : desc}</p>
                </div>
                <Download className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600 ml-auto" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── penalty modal ── */}
      {penaltyTarget && createPortal(
        <div className="fixed inset-0 z-[12050] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPenaltyTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 space-y-4">
            <button
              type="button"
              onClick={() => setPenaltyTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Appliquer une pénalité de retard</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Échéance #{penaltyTarget.installment_no} — {fmtMoney(penaltyTarget.due_amount)}
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Taux de pénalité (%)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={penaltyRate}
                onChange={(e) => setPenaltyRate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:text-gray-200"
              />
              {penaltyRate && parseFloat(penaltyRate) > 0 && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                  Pénalité : {fmtMoney(penaltyTarget.due_amount * parseFloat(penaltyRate) / 100)}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPenaltyTarget(null)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApplyPenalty}
                disabled={savingPenalty}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {savingPenalty && <Loader2 className="h-4 w-4 animate-spin" />}
                Appliquer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── schedule creation modal ── */}
      {showScheduleModal && createPortal(
        <div className="fixed inset-0 z-[12050] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowScheduleModal(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Créer l'échéancier</h3>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* templates */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Modèles rapides
                </p>
                <div className="flex flex-wrap gap-2">
                  {SCHEDULE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.divisor}
                      type="button"
                      onClick={() => applyTemplate(tpl.divisor)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                    >
                      {tpl.label}
                      <span className="ml-1.5 text-xs text-gray-400">
                        {fmtMoney(totalTTC / tpl.divisor)}/éch.
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* manual rows */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Échéances
                </p>
                <div className="space-y-2">
                  {scheduleManual.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-gray-500 w-5 flex-shrink-0 text-center">
                        {i + 1}
                      </span>
                      <input
                        type="date"
                        value={row.due_date}
                        onChange={(e) => {
                          const next = [...scheduleManual];
                          next[i] = { ...next[i], due_date: e.target.value };
                          setScheduleManual(next);
                        }}
                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:text-gray-200"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.due_amount}
                        onChange={(e) => {
                          const next = [...scheduleManual];
                          next[i] = { ...next[i], due_amount: e.target.value };
                          setScheduleManual(next);
                        }}
                        placeholder="Montant"
                        className="w-28 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-right focus:border-blue-500 focus:outline-none dark:text-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => setScheduleManual((prev) => prev.filter((_, j) => j !== i))}
                        disabled={scheduleManual.length <= 1}
                        className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-rose-500 disabled:opacity-30"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setScheduleManual((prev) => [
                      ...prev,
                      { due_date: addMonths(prev[prev.length - 1]?.due_date || todayISO(), 1), due_amount: '' },
                    ])
                  }
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Ajouter une ligne
                </button>
                {/* total check */}
                {(() => {
                  const sum = scheduleManual.reduce((s, r) => s + (parseFloat(r.due_amount) || 0), 0);
                  const diff = Math.abs(sum - totalTTC);
                  return diff > 0.01 ? (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Total des échéances {fmtMoney(sum)} ≠ total TTC {fmtMoney(totalTTC)} (écart {fmtMoney(diff)})
                    </p>
                  ) : null;
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingSchedule && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default InvoiceFinancialPanel;
