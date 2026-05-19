import { supabase } from '../lib/supabase';

type RentalInvoiceRecord = {
  id: string;
  invoice_number: string;
  status: string | null;
  document_type?: string | null;
  created_at?: string | null;
};

type EnsureRentalDraftInvoiceArgs = {
  rentalId: string;
  clientId?: string | null;
  referenceCode?: string | null;
  amountTTC: number;
  note: string;
};

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const isStandardRentalInvoice = (row: RentalInvoiceRecord) => {
  const documentType = row.document_type || 'invoice';
  return documentType !== 'quote' && documentType !== 'credit_note';
};

const buildInvoicePrefix = (referenceCode?: string | null, rentalId?: string) => {
  const ref = (referenceCode || rentalId?.slice(0, 6) || 'DOC').trim().toUpperCase();
  return `INV-${ref || 'DOC'}-`;
};

const computeNextInvoiceNumber = async (prefix: string) => {
  const { data, error } = await (supabase as any)
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`);

  if (error) throw error;

  const nextSequence =
    ((data as Array<{ invoice_number?: string | null }> | null) || []).reduce((max, row) => {
      const raw = typeof row.invoice_number === 'string' ? row.invoice_number : '';
      if (!raw.startsWith(prefix)) return max;
      const suffix = raw.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) return max;
      return Math.max(max, Number(suffix));
    }, 0) + 1;

  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
};

export const ensureRentalDraftInvoice = async ({
  rentalId,
  clientId = null,
  referenceCode = null,
  amountTTC,
  note,
}: EnsureRentalDraftInvoiceArgs) => {
  const normalizedAmount = roundCurrency(amountTTC);
  const payload = {
    client_id: clientId,
    rental_id: rentalId,
    amount_ht: normalizedAmount,
    amount_ttc: normalizedAmount,
    vat_amount: 0,
    due_date: null,
    notes: note,
  };

  const { data: existingRows, error: existingError } = await (supabase as any)
    .from('invoices')
    .select('id, invoice_number, status, document_type, created_at')
    .eq('rental_id', rentalId)
    .order('created_at', { ascending: true });

  if (existingError) throw existingError;

  const existingInvoice = ((existingRows as RentalInvoiceRecord[] | null) || []).find(isStandardRentalInvoice) || null;

  if (existingInvoice) {
    const nextStatus = existingInvoice.status === 'cancelled' ? 'draft' : existingInvoice.status || 'draft';
    const { data: updated, error: updateError } = await (supabase as any)
      .from('invoices')
      .update({
        ...payload,
        status: nextStatus,
      })
      .eq('id', existingInvoice.id)
      .select('id, invoice_number')
      .single();

    if (updateError) throw updateError;
    return {
      id: String(updated?.id || existingInvoice.id),
      invoiceNumber: String(updated?.invoice_number || existingInvoice.invoice_number),
      reused: true,
    };
  }

  const prefix = buildInvoicePrefix(referenceCode, rentalId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const invoiceNumber = await computeNextInvoiceNumber(prefix);
    const { data: created, error: createError } = await (supabase as any)
      .from('invoices')
      .insert([
        {
          invoice_number: invoiceNumber,
          status: 'draft',
          ...payload,
        },
      ])
      .select('id, invoice_number')
      .single();

    if (!createError) {
      return {
        id: String(created?.id || ''),
        invoiceNumber: String(created?.invoice_number || invoiceNumber),
        reused: false,
      };
    }

    if (createError.code !== '23505') {
      throw createError;
    }
  }

  const { data: fallbackRows, error: fallbackError } = await (supabase as any)
    .from('invoices')
    .select('id, invoice_number, status, document_type, created_at')
    .eq('rental_id', rentalId)
    .order('created_at', { ascending: true });

  if (fallbackError) throw fallbackError;

  const fallbackInvoice = ((fallbackRows as RentalInvoiceRecord[] | null) || []).find(isStandardRentalInvoice) || null;
  if (!fallbackInvoice) {
    throw new Error('Impossible de créer ou retrouver une facture projet.');
  }

  return {
    id: fallbackInvoice.id,
    invoiceNumber: fallbackInvoice.invoice_number,
    reused: true,
  };
};
