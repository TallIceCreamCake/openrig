import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, CheckCircle2, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { isAutoEntrepreneurMode } from '../utils/accountingMode';

interface BillingItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface PaymentScheduleItem {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
}

type DocumentType = 'invoice' | 'quote' | 'credit_note';

interface ClientOption {
  id: string;
  name: string;
  company?: string | null;
}

interface InvoiceOption {
  id: string;
  invoice_number: string;
  client_id: string | null;
  amount_ttc: number;
  balance_due: number;
  status: string;
  document_type: string;
}

const round2 = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const defaultItem = (): BillingItem => ({
  id: globalThis.crypto?.randomUUID?.() ?? `tmp-${Math.random().toString(36).slice(2, 10)}`,
  description: '',
  quantity: 1,
  unitPrice: 0,
  taxRate: 20,
});

const defaultScheduleRow = (dueDate: string): PaymentScheduleItem => ({
  id: globalThis.crypto?.randomUUID?.() ?? `sch-${Math.random().toString(36).slice(2, 10)}`,
  label: 'Échéance unique',
  dueDate,
  amount: 0,
});

const generateDocumentNumber = (type: DocumentType) => {
  const prefix = type === 'invoice' ? 'FAC' : type === 'quote' ? 'DEV' : 'AVR';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${date}-${suffix}`;
};

const BillingCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { settings: companySettings, loading: companySettingsLoading } = useCompanySettings();
  const autoEntrepreneurMode = useMemo(
    () => isAutoEntrepreneurMode(companySettings),
    [companySettings],
  );
  const [documentType, setDocumentType] = useState<DocumentType>('invoice');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [projectLabel, setProjectLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<BillingItem[]>([defaultItem()]);
  const [discountRate, setDiscountRate] = useState(0);
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Échéance unique');
  const [scheduleRows, setScheduleRows] = useState<PaymentScheduleItem[]>([
    defaultScheduleRow(new Date().toISOString().slice(0, 10)),
  ]);
  const [parentInvoiceId, setParentInvoiceId] = useState('');
  const [parentInvoices, setParentInvoices] = useState<InvoiceOption[]>([]);
  const [loadingParentInvoices, setLoadingParentInvoices] = useState(false);
  const [saving, setSaving] = useState(false);

  const manualFeatureEnabled = useMemo(() => {
    if (!companySettings?.features) return true;
    try {
      const raw = companySettings.features;
      const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (map && typeof map === 'object' && map.billing_manual !== undefined) {
        return !!map.billing_manual;
      }
    } catch (err) {
      console.warn('company feature flags parse', err);
    }
    return true;
  }, [companySettings]);

  useEffect(() => {
    const loadClients = async () => {
      setLoadingClients(true);
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, company')
          .order('name', { ascending: true });
        if (error) throw error;
        setClients((data || []).map((row) => ({ id: row.id, name: row.name || 'Client sans nom', company: row.company })));
      } catch (err) {
        console.error('load clients', err);
        toast.error("Impossible de charger la liste des clients");
      } finally {
        setLoadingClients(false);
      }
    };
    loadClients();
  }, []);

  useEffect(() => {
    const loadParentInvoices = async () => {
      if (documentType !== 'credit_note') {
        setParentInvoices([]);
        setParentInvoiceId('');
        return;
      }
      setLoadingParentInvoices(true);
      try {
        const db = supabase as any;
        let query = db
          .from('invoice_financial_overview')
          .select('invoice_id, invoice_number, client_id, amount_ttc, outstanding_amount, status, document_type')
          .in('document_type', ['invoice', 'deposit_invoice'])
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(200);
        if (clientId) {
          query = query.eq('client_id', clientId);
        }
        const { data, error } = await query;
        if (error) throw error;
        const mapped = (data || []).map((row: any) => ({
          id: String(row.invoice_id),
          invoice_number: String(row.invoice_number || '—'),
          client_id: row.client_id ? String(row.client_id) : null,
          amount_ttc: round2(Number(row.amount_ttc || 0)),
          balance_due: round2(Number(row.outstanding_amount || 0)),
          status: String(row.status || 'sent'),
          document_type: String(row.document_type || 'invoice'),
        }));
        setParentInvoices(mapped);
      } catch (err) {
        console.error('load parent invoices', err);
        toast.error("Impossible de charger les factures d'origine");
      } finally {
        setLoadingParentInvoices(false);
      }
    };
    loadParentInvoices();
  }, [clientId, documentType]);

  const totals = useMemo(() => {
    const discountFactor = Math.max(0, 1 - discountRate / 100);
    const rawSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountedSubtotal = rawSubtotal * discountFactor;
    const vatAmount = autoEntrepreneurMode
      ? 0
      : items.reduce((sum, item) => {
        const lineBase = item.quantity * item.unitPrice * discountFactor;
        return sum + lineBase * (item.taxRate / 100);
      }, 0);
    const amountTTC = autoEntrepreneurMode ? discountedSubtotal : discountedSubtotal + vatAmount;
    return {
      rawSubtotal: round2(rawSubtotal),
      discountedSubtotal: round2(discountedSubtotal),
      vatAmount: round2(vatAmount),
      amountTTC: round2(amountTTC),
      discountAmount: round2(rawSubtotal - discountedSubtotal),
    };
  }, [autoEntrepreneurMode, discountRate, items]);

  const scheduleTotal = useMemo(
    () => round2(scheduleRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
    [scheduleRows],
  );

  const scheduleDifference = useMemo(
    () => round2(totals.amountTTC - scheduleTotal),
    [scheduleTotal, totals.amountTTC],
  );

  useEffect(() => {
    if (!autoEntrepreneurMode) return;
    setItems((prev) =>
      prev.map((item) => (item.taxRate === 0 ? item : { ...item, taxRate: 0 })),
    );
  }, [autoEntrepreneurMode]);

  useEffect(() => {
    if (documentType === 'credit_note') return;
    setScheduleRows((prev) => {
      if (prev.length !== 1) return prev;
      const next = { ...prev[0] };
      next.amount = totals.amountTTC;
      if (!next.dueDate) next.dueDate = dueDate || issueDate;
      return [next];
    });
  }, [documentType, dueDate, issueDate, totals.amountTTC]);

  const handleItemChange = (id: string, patch: Partial<BillingItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleAddItem = () => setItems((prev) => [...prev, defaultItem()]);

  const handleRemoveItem = (id: string) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((item) => item.id !== id)));
  };

  const handleScheduleChange = (id: string, patch: Partial<PaymentScheduleItem>) => {
    setScheduleRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const handleAddScheduleRow = () => {
    setScheduleRows((prev) => [
      ...prev,
      {
        ...defaultScheduleRow(dueDate || issueDate),
        label: `Échéance ${prev.length + 1}`,
      },
    ]);
  };

  const handleRemoveScheduleRow = (id: string) => {
    setScheduleRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const rebalanceScheduleToTotal = () => {
    setScheduleRows((prev) => {
      if (prev.length === 0) {
        return [{ ...defaultScheduleRow(dueDate || issueDate), amount: totals.amountTTC }];
      }
      let remaining = totals.amountTTC;
      return prev.map((row, index) => {
        const isLast = index === prev.length - 1;
        const baseAmount = round2(Math.max(0, Number(row.amount || 0)));
        if (isLast) {
          return { ...row, amount: round2(Math.max(0, remaining)) };
        }
        remaining = round2(remaining - baseAmount);
        return { ...row, amount: baseAmount };
      });
    });
  };

  const resetForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    setDocumentType('invoice');
    setDocumentNumber('');
    setIssueDate(today);
    setDueDate(today);
    setClientId('');
    setProjectLabel('');
    setNotes('');
    setDiscountRate(0);
    setPaymentTermsDays(30);
    setPaymentTermsLabel('Échéance unique');
    setItems([defaultItem()]);
    setScheduleRows([{ ...defaultScheduleRow(today), amount: 0 }]);
    setParentInvoiceId('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!clientId) {
      toast.error('Sélectionnez un client.');
      return;
    }

    if (documentType === 'credit_note' && !parentInvoiceId) {
      toast.error("Sélectionnez la facture d'origine pour l'avoir.");
      return;
    }

    if (items.every((item) => !item.description.trim())) {
      toast.error('Ajoutez au moins une description de ligne.');
      return;
    }

    if (documentType !== 'credit_note') {
      if (scheduleRows.length === 0) {
        toast.error('Ajoutez au moins une échéance.');
        return;
      }
      if (scheduleRows.some((row) => !row.dueDate)) {
        toast.error('Chaque échéance doit avoir une date.');
        return;
      }
      if (Math.abs(scheduleDifference) > 0.02) {
        toast.error("Le total de l'échéancier doit être égal au total TTC.");
        return;
      }
    }

    const number = documentNumber.trim() || generateDocumentNumber(documentType);
    const status = documentType === 'quote' ? 'draft' : 'sent';
    const quoteStatus = documentType === 'quote' ? 'draft' : 'none';

    setSaving(true);
    try {
      const db = supabase as any;

      const metadata = {
        project_label: projectLabel || undefined,
        issue_date: issueDate,
        document_type: documentType,
        notes: notes || undefined,
        source: 'billing_create_manual',
      };

      const { data: invoiceRow, error: invoiceError } = await db
        .from('invoices')
        .insert({
          invoice_number: number,
          client_id: clientId,
          amount_ht: autoEntrepreneurMode ? totals.amountTTC : totals.discountedSubtotal,
          amount_ttc: totals.amountTTC,
          vat_amount: totals.vatAmount,
          status,
          due_date: dueDate || null,
          payment_method: null,
          notes: JSON.stringify(metadata),
          origin: 'manual',
          document_type: documentType,
          quote_status: quoteStatus,
          issue_date: issueDate,
          payment_terms_days: Math.max(Number(paymentTermsDays || 0), 0),
          payment_terms_label: paymentTermsLabel || null,
          parent_invoice_id: documentType === 'credit_note' ? parentInvoiceId : null,
          metadata,
        })
        .select('id')
        .single();
      if (invoiceError) throw invoiceError;

      const invoiceId = String(invoiceRow?.id || '');
      if (!invoiceId) throw new Error('Invoice id missing after creation');

      const linePayload = items.map((item, index) => ({
        line_order: index + 1,
        line_type: 'item',
        description: item.description.trim() || 'Ligne',
        quantity: Math.max(Number(item.quantity || 0), 0),
        unit_price_ttc: round2(
          autoEntrepreneurMode
            ? Number(item.unitPrice || 0)
            : Number(item.unitPrice || 0) * (1 + Number(item.taxRate || 0) / 100),
        ),
        discount_percent: Math.max(Number(discountRate || 0), 0),
        tax_rate: autoEntrepreneurMode ? 0 : Math.max(Number(item.taxRate || 0), 0),
      }));

      const { error: lineError } = await db.rpc('replace_invoice_line_items', {
        p_invoice_id: invoiceId,
        p_lines: linePayload,
      });
      if (lineError) throw lineError;

      if (documentType !== 'credit_note') {
        const schedulePayload = scheduleRows.map((row, index) => ({
          label: (row.label || `Échéance ${index + 1}`).trim(),
          due_date: row.dueDate,
          due_amount: round2(Math.max(Number(row.amount || 0), 0)),
        }));
        const { error: scheduleError } = await db.rpc('replace_invoice_payment_schedule', {
          p_invoice_id: invoiceId,
          p_schedule: schedulePayload,
        });
        if (scheduleError) throw scheduleError;
      }

      toast.success(
        documentType === 'quote'
          ? 'Le devis a été enregistré.'
          : documentType === 'credit_note'
            ? "L'avoir a été enregistré."
            : 'La facture a été enregistrée.',
      );
      resetForm();
      navigate(`/accounting/documents/${invoiceId}`);
    } catch (err) {
      console.error('save invoice', err);
      toast.error("Impossible d'enregistrer le document");
    } finally {
      setSaving(false);
    }
  };

  if (companySettingsLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement des paramètres…
      </div>
    );
  }

  if (!manualFeatureEnabled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <button
              type="button"
              onClick={() => navigate('/accounting/documents')}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Retour aux documents
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 flex items-start gap-3 text-amber-800">
          <AlertTriangle className="h-5 w-5 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">Fonctionnalité désactivée</h2>
            <p className="text-sm">La création manuelle de factures et devis est désactivée dans les paramètres d’entreprise. Activez-la dans l’onglet « Facturation &gt; Fonctionnalités » pour créer un document.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" /> Nouveau document de facturation
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Créez facture, devis ou avoir avec lignes structurées et échéancier de paiement.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
          <div className="flex flex-wrap gap-3">
            {[
              { id: 'invoice', label: 'Facture' },
              { id: 'quote', label: 'Devis' },
              { id: 'credit_note', label: 'Avoir' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDocumentType(option.id as DocumentType)}
                className={`px-4 py-2 rounded-md border text-sm font-medium ${
                  documentType === option.id
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Client *</label>
              <div className="mt-1">
                {loadingClients ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 border rounded-md px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                  </div>
                ) : (
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    required
                  >
                    <option value="">Sélectionner un client…</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}{client.company ? ` • ${client.company}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">N° document</label>
              <input
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder={documentType === 'invoice' ? 'FAC-2025-001' : documentType === 'quote' ? 'DEV-2025-001' : 'AVR-2025-001'}
                className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Date d’émission</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Date d’échéance</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Projet / Référence</label>
              <input
                value={projectLabel}
                onChange={(e) => setProjectLabel(e.target.value)}
                placeholder="Nom du projet, référence client, etc."
                className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {documentType === 'credit_note' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Facture d’origine *</label>
                <div className="mt-1">
                  {loadingParentInvoices ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 border rounded-md px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                    </div>
                  ) : (
                    <select
                      value={parentInvoiceId}
                      onChange={(e) => setParentInvoiceId(e.target.value)}
                      className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      required
                    >
                      <option value="">Sélectionner une facture…</option>
                      {parentInvoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoice_number} • {invoice.amount_ttc.toFixed(2)} € • Reste {invoice.balance_due.toFixed(2)} €
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">Lignes</h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-2 rounded-md border border-blue-500 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" /> Ajouter une ligne
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Quantité</th>
                  <th className="px-3 py-2 text-right">{autoEntrepreneurMode ? 'Prix unitaire TTC (€)' : 'Prix unitaire HT (€)'}</th>
                  {!autoEntrepreneurMode && <th className="px-3 py-2 text-right">TVA (%)</th>}
                  <th className="px-3 py-2 text-right">Total TTC (€)</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item) => {
                  const lineBase = item.quantity * item.unitPrice;
                  const lineTotal = autoEntrepreneurMode
                    ? lineBase * Math.max(0, 1 - discountRate / 100)
                    : lineBase * Math.max(0, 1 - discountRate / 100) * (1 + item.taxRate / 100);
                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <input
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, { description: e.target.value })}
                          placeholder="Location caméra, prestation, etc."
                          className="w-full rounded-md border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, { quantity: Number(e.target.value) })}
                          className="w-24 rounded-md border-gray-200 text-right focus:border-blue-500 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(item.id, { unitPrice: Number(e.target.value) })}
                          className="w-28 rounded-md border-gray-200 text-right focus:border-blue-500 focus:ring-blue-500"
                        />
                      </td>
                      {!autoEntrepreneurMode && (
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={item.taxRate}
                            onChange={(e) => handleItemChange(item.id, { taxRate: Number(e.target.value) })}
                            className="w-20 rounded-md border-gray-200 text-right focus:border-blue-500 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{lineTotal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-600 hover:text-red-700"
                          disabled={items.length === 1}
                          title="Supprimer la ligne"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Remise globale (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={discountRate}
                onChange={(e) => setDiscountRate(Number(e.target.value))}
                className="mt-1 block w-32 rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="md:justify-self-end text-sm text-gray-700 space-y-1">
              <div className="flex justify-between">
                <span>{autoEntrepreneurMode ? 'Sous-total TTC' : 'Sous-total HT'}</span>
                <span className="font-medium">{totals.rawSubtotal.toFixed(2)} €</span>
              </div>
              {discountRate > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Remise ({discountRate.toFixed(1)} %)</span>
                  <span className="font-medium">- {totals.discountAmount.toFixed(2)} €</span>
                </div>
              )}
              {!autoEntrepreneurMode && (
                <div className="flex justify-between">
                  <span>TVA totale</span>
                  <span className="font-medium">{totals.vatAmount.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-gray-900">
                <span>Total TTC</span>
                <span>{totals.amountTTC.toFixed(2)} €</span>
              </div>
            </div>
          </div>
        </section>

        {documentType !== 'credit_note' && (
          <section className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Échéancier de paiement</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={rebalanceScheduleToTotal}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Rééquilibrer
                </button>
                <button
                  type="button"
                  onClick={handleAddScheduleRow}
                  className="inline-flex items-center gap-2 rounded-md border border-blue-500 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4" /> Ajouter une échéance
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Délai de paiement (jours)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Libellé défaut</label>
                <input
                  value={paymentTermsLabel}
                  onChange={(e) => setPaymentTermsLabel(e.target.value)}
                  placeholder="Échéance unique"
                  className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Libellé</th>
                    <th className="px-3 py-2 text-left">Date d’échéance</th>
                    <th className="px-3 py-2 text-right">Montant TTC (€)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {scheduleRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <input
                          value={row.label}
                          onChange={(e) => handleScheduleChange(row.id, { label: e.target.value })}
                          placeholder="Acompte / Solde / Échéance..."
                          className="w-full rounded-md border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={row.dueDate}
                          onChange={(e) => handleScheduleChange(row.id, { dueDate: e.target.value })}
                          className="w-full rounded-md border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => handleScheduleChange(row.id, { amount: Number(e.target.value) })}
                          className="w-36 rounded-md border-gray-200 text-right focus:border-blue-500 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveScheduleRow(row.id)}
                          className="text-red-600 hover:text-red-700"
                          disabled={scheduleRows.length === 1}
                          title="Supprimer l'échéance"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between text-sm">
              <div className="text-gray-600">
                Total échéancier: <span className="font-semibold text-gray-900">{scheduleTotal.toFixed(2)} €</span>
              </div>
              <div className={`${Math.abs(scheduleDifference) <= 0.02 ? 'text-green-700' : 'text-red-700'} font-medium`}>
                Écart: {scheduleDifference.toFixed(2)} €
              </div>
            </div>
          </section>
        )}

        <section className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Notes & conditions</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            placeholder="Mentions légales, conditions de paiement, IBAN, informations complémentaires..."
          />
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/accounting/documents')}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            Réinitialiser
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white ${
              saving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving
              ? 'Enregistrement…'
              : documentType === 'quote'
                ? 'Enregistrer le devis'
                : documentType === 'credit_note'
                  ? "Enregistrer l'avoir"
                  : 'Enregistrer la facture'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BillingCreatePage;
