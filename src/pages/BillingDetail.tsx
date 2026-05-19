import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Loader2, Mail, Printer, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { StatusBadge, type BadgeTone } from '../components/ui-kit';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { extractDocumentDesign, DocumentTableDesign } from '../utils/documentDesign';
import { buildLegalFooterLines } from '../utils/documentLegalFooter';
import { fetchCompanyLogoDataUrl, resolveDocumentDesignImages, toPdfImageSource } from '../utils/documentImages';
import { AUTO_ENTREPRENEUR_TVA_NOTE, isAutoEntrepreneurMode } from '../utils/accountingMode';

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

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const LOGO_BASE_WIDTH = 140;
const LOGO_BASE_HEIGHT = 70;

const getPdfBackgroundStyle = (design: DocumentTableDesign) => {
  const src = design.backgroundImageUrl?.trim();
  if (!src) return null;
  const imageSource = toPdfImageSource(src);
  if (!imageSource) return null;
  const scale = Math.max(0.5, design.backgroundScale || 1);
  const imageWidth = A4_WIDTH * scale;
  const imageHeight = A4_HEIGHT * scale;
  const posX = Number.isFinite(design.backgroundPositionX) ? design.backgroundPositionX : 50;
  const posY = Number.isFinite(design.backgroundPositionY) ? design.backgroundPositionY : 50;
  const left = (A4_WIDTH - imageWidth) * (posX / 100);
  const top = (A4_HEIGHT - imageHeight) * (posY / 100);
  return {
    src: imageSource,
    style: {
      position: 'absolute' as const,
      top,
      left,
      width: imageWidth,
      height: imageHeight,
    },
  };
};

const getPdfLogoStyle = (design: DocumentTableDesign, fallbackLogoUrl?: string | null) => {
  const src = design.logoImageUrl?.trim() || fallbackLogoUrl?.trim();
  if (!src) return null;
  const imageSource = toPdfImageSource(src);
  if (!imageSource) return null;
  const scale = Math.min(3, Math.max(0.3, design.logoScale || 1));
  const imageWidth = LOGO_BASE_WIDTH * scale;
  const imageHeight = LOGO_BASE_HEIGHT * scale;
  const posX = Number.isFinite(design.logoPositionX) ? design.logoPositionX : 0;
  const posY = Number.isFinite(design.logoPositionY) ? design.logoPositionY : 0;
  const left = (A4_WIDTH - imageWidth) * (posX / 100);
  const top = (A4_HEIGHT - imageHeight) * (posY / 100);
  return {
    src: imageSource,
    style: {
      position: 'absolute' as const,
      top,
      left,
      width: imageWidth,
      height: imageHeight,
      objectFit: 'contain' as const,
      zIndex: 2,
    },
  };
};

const toRgba = (color: string, opacity: number) => {
  const normalized = color.trim();
  if (!normalized.startsWith('#')) return normalized;
  const hex = normalized.slice(1);
  const normalizedHex = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  if (normalizedHex.length !== 6) return normalized;
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return normalized;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const resolveTableBackdropColor = (design: DocumentTableDesign) => {
  const color = design.tableBackdropColor?.trim() || '#ffffff';
  if (design.tableBackdropMode === 'solid') return color;
  const opacity = Math.min(1, Math.max(0.4, design.tableBackdropOpacity || 0.85));
  const rgba = toRgba(color, opacity);
  if (rgba.startsWith('rgba')) return rgba;
  return toRgba('#ffffff', opacity);
};

const BillingDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [billingDoc, setBillingDoc] = useState<BillingDocument | null>(null);
  const [lineItems, setLineItems] = useState<BillingLineMeta[]>([]);
  const [scheduleRows, setScheduleRows] = useState<BillingScheduleRow[]>([]);
  const [allocationRows, setAllocationRows] = useState<BillingAllocationRow[]>([]);
  const [reminderRows, setReminderRows] = useState<BillingReminderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('virement');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentScheduleId, setPaymentScheduleId] = useState('');
  const [loggingReminder, setLoggingReminder] = useState(false);
  const [reminderType, setReminderType] = useState('due_soon');
  const [reminderChannel, setReminderChannel] = useState('manual');
  const [reminderRecipient, setReminderRecipient] = useState('');
  const [reminderSubject, setReminderSubject] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const { settings } = useCompanySettings();
  const autoEntrepreneurMode = useMemo(() => isAutoEntrepreneurMode(settings), [settings]);
  const documentDesign = useMemo<DocumentTableDesign>(() => extractDocumentDesign(settings), [settings]);
  const companyIdentity = useMemo(() => ({
    name: settings?.legal_name || settings?.name || 'OpenRig',
    siren: settings?.siren || '—',
    vat: autoEntrepreneurMode ? AUTO_ENTREPRENEUR_TVA_NOTE : (settings?.vat || '—'),
    address: settings?.billing_address || settings?.address || 'Adresse non renseignée',
    email: settings?.billing_email || settings?.email || 'contact@openrig.test',
    phone: settings?.phone || '—',
    siret: settings?.siret || '',
    naf: settings?.naf || '',
    capital: settings?.capital || '',
  }), [autoEntrepreneurMode, settings]);

  const loadAdvancedBillingData = async (invoiceId: string) => {
    try {
      const db = supabase as any;
      const [lineRes, scheduleRes, allocationRes, reminderRes] = await Promise.all([
        db
          .from('invoice_line_items')
          .select('id, line_type, description, quantity, unit_price_ttc, tax_rate, discount_percent, total_ttc, total_ht')
          .eq('invoice_id', invoiceId)
          .order('line_order', { ascending: true }),
        db
          .from('invoice_payment_schedule_overview')
          .select('id, installment_no, label, due_date, due_amount, paid_amount, remaining_amount, status')
          .eq('invoice_id', invoiceId)
          .order('installment_no', { ascending: true }),
        db
          .from('invoice_payment_allocations')
          .select(`
            id,
            amount,
            allocated_at,
            schedule_id,
            payment:payments (
              id,
              payment_date,
              payment_method,
              reference,
              status
            )
          `)
          .eq('invoice_id', invoiceId)
          .order('allocated_at', { ascending: false }),
        db
          .from('invoice_reminders')
          .select('id, reminder_type, channel, status, recipient, subject, planned_for, sent_at, created_at')
          .eq('invoice_id', invoiceId)
          .order('created_at', { ascending: false }),
      ]);

      if (lineRes.error) throw lineRes.error;
      if (scheduleRes.error) throw scheduleRes.error;
      if (allocationRes.error) throw allocationRes.error;
      if (reminderRes.error) throw reminderRes.error;

      setLineItems((lineRes.data || []) as BillingLineMeta[]);
      setScheduleRows((scheduleRes.data || []) as BillingScheduleRow[]);
      setAllocationRows((allocationRes.data || []) as BillingAllocationRow[]);
      setReminderRows((reminderRes.data || []) as BillingReminderRow[]);
    } catch (err) {
      console.error('load advanced billing data', err);
      setLineItems([]);
      setScheduleRows([]);
      setAllocationRows([]);
      setReminderRows([]);
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
        setScheduleRows([]);
        setAllocationRows([]);
        setReminderRows([]);
      } else {
        setBillingDoc(data as BillingDocument);
        await loadAdvancedBillingData(String(data.id));
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
    if (!billingDoc) return;
    setGeneratingPdf(true);
    try {
      const { Document, Page, Text, View, StyleSheet, pdf, Image } = await import('@react-pdf/renderer');
      const logoDataUrl = await fetchCompanyLogoDataUrl();
      const rawLogo = settings?.logo_url || '';
      const canUseRawLogo = !(rawLogo.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:');
      const logoFallback = logoDataUrl || (canUseRawLogo ? rawLogo : null);
      const resolvedDesign = await resolveDocumentDesignImages(documentDesign, logoFallback);
      const fallbackLines = Array.isArray(parsedMetadata?.lines) ? (parsedMetadata!.lines as any[]) : [];
      const lines = lineItems.length > 0
        ? lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unit_price_ttc ?? line.unit_price ?? line.unitPrice,
          taxRate: line.tax_rate ?? line.taxRate ?? 0,
        }))
        : fallbackLines;
      const pdfFontFamily = ['Helvetica', 'Times-Roman', 'Courier'].includes(documentDesign.fontFamily)
        ? documentDesign.fontFamily
        : 'Helvetica';
      const trimmedTitleFont = documentDesign.titleFontFamily?.trim();
      const titleFontFamily = ['Helvetica', 'Times-Roman', 'Courier'].includes(trimmedTitleFont || '')
        ? trimmedTitleFont
        : pdfFontFamily;
      const borderToken = documentDesign.borderWidth > 0
        ? `${documentDesign.borderWidth} solid ${documentDesign.borderColor}`
        : '0 solid transparent';
      const titleFontSize = documentDesign.titleFontSize > 0 ? documentDesign.titleFontSize : documentDesign.fontSize + 8;
      const tableBackdropColor = resolveTableBackdropColor(documentDesign);
      const logoStyle = getPdfLogoStyle(resolvedDesign);
      const legalFooterLines = buildLegalFooterLines({
        name: settings?.name,
        legalName: settings?.legal_name,
        capital: settings?.capital,
        address: settings?.billing_address || settings?.address,
        phone: settings?.phone,
        email: settings?.billing_email || settings?.email,
        siren: settings?.siren,
        siret: settings?.siret,
        naf: settings?.naf,
        vat: autoEntrepreneurMode ? null : settings?.vat,
        isAutoEntrepreneur: autoEntrepreneurMode,
      });
      const footerEnabled = legalFooterLines.length > 0;
      const footerFixed = footerEnabled && documentDesign.legalFooterMode === 'all';
      const footerFontSize = Math.max(8, documentDesign.fontSize - 2);
      const footerLineHeight = footerFontSize * 1.4;
      const footerHeight = footerFixed
        ? Math.ceil(footerLineHeight * legalFooterLines.length) + 12
        : 0;
      const safeCornerRadius = Number.isFinite(Number(documentDesign.cornerRadius))
        ? Math.max(0, Number(documentDesign.cornerRadius))
        : 0;
      const radiusStyle = safeCornerRadius > 0 ? { borderRadius: safeCornerRadius } : {};
      const styles = StyleSheet.create({
        page: {
          padding: 32,
          paddingBottom: 32 + footerHeight,
          fontSize: documentDesign.fontSize,
          fontFamily: pdfFontFamily,
          position: 'relative',
        },
        title: {
          fontSize: titleFontSize,
          marginTop: documentDesign.titleMarginTop,
          marginBottom: documentDesign.titleMarginBottom,
          fontWeight: 700,
          textAlign: documentDesign.titleAlign,
          fontFamily: titleFontFamily,
        },
        subHeading: { fontSize: documentDesign.fontSize, color: '#6b7280', marginBottom: 16 },
        section: { marginBottom: 16 },
        companyBlock: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
          border: borderToken,
          ...radiusStyle,
          padding: documentDesign.cellPadding,
          backgroundColor: '#fff',
        },
        companyColumn: {
          flex: 1,
        },
        companyName: {
          fontSize: documentDesign.fontSize + 2,
          fontWeight: 600,
          color: documentDesign.headerBackground,
          marginBottom: 4,
        },
        companyLine: {
          marginBottom: 2,
        },
        table: {
          border: borderToken,
          ...radiusStyle,
          overflow: 'hidden',
          backgroundColor: tableBackdropColor,
        },
        headerRow: {
          flexDirection: 'row',
          backgroundColor: documentDesign.headerBackground,
          color: documentDesign.headerTextColor,
        },
        bodyRow: { flexDirection: 'row' },
        cell: {
          padding: documentDesign.cellPadding,
          flexGrow: 1,
          borderRight: borderToken,
        },
        headerCell: { fontWeight: 600, color: documentDesign.headerTextColor },
        right: { textAlign: 'right' },
        footer: {
          position: 'absolute',
          left: 32,
          right: 32,
          bottom: 18,
          fontSize: footerFontSize,
          color: '#4b5563',
          textAlign: 'center',
          lineHeight: 1.4,
        },
        footerFlow: {
          marginTop: 12,
          fontSize: footerFontSize,
          color: '#4b5563',
          textAlign: 'center',
          lineHeight: 1.4,
        },
      });
      const backgroundStyle = getPdfBackgroundStyle(resolvedDesign);
      const title = billingDoc.invoice_number;

      const doc = (
        <Document>
          <Page size="A4" style={styles.page}>
            {backgroundStyle && <Image src={backgroundStyle.src} style={backgroundStyle.style} fixed />}
            {logoStyle && <Image src={logoStyle.src} style={logoStyle.style} fixed />}
            <View style={styles.companyBlock}>
              <View style={styles.companyColumn}>
                <Text style={styles.companyName}>{companyIdentity.name}</Text>
                <Text style={styles.companyLine}>SIREN : {companyIdentity.siren}</Text>
                <Text style={styles.companyLine}>
                  {autoEntrepreneurMode ? companyIdentity.vat : `TVA : ${companyIdentity.vat}`}
                </Text>
                <Text style={styles.companyLine}>{companyIdentity.address}</Text>
              </View>
              <View style={[styles.companyColumn, { alignItems: 'flex-end' }] }>
                <Text style={styles.companyName}>Contact</Text>
                <Text style={styles.companyLine}>{companyIdentity.email}</Text>
                <Text style={styles.companyLine}>{companyIdentity.phone}</Text>
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subHeading}>Émis le {formatDate(issueDate)}</Text>
            </View>

            <View style={[styles.section, { flexDirection: 'row', justifyContent: 'space-between' }]}> 
              <View>
                <Text style={{ fontWeight: 600 }}>Client</Text>
                <Text>{billingDoc.client?.name || 'Client inconnu'}</Text>
                {billingDoc.client?.company ? <Text>{billingDoc.client.company}</Text> : null}
                {billingDoc.client?.email ? <Text>{billingDoc.client.email}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: 600 }}>Montants</Text>
                {!autoEntrepreneurMode && <Text>HT : {formatCurrency(billingDoc.amount_ht)}</Text>}
                {!autoEntrepreneurMode && <Text>TVA : {formatCurrency(billingDoc.vat_amount)}</Text>}
                <Text style={{ fontWeight: 600 }}>TTC : {formatCurrency(billingDoc.amount_ttc)}</Text>
              </View>
            </View>

            {lines.length > 0 && (
              <View style={styles.section}>
                <View style={styles.table}>
                  <View style={styles.headerRow}>
                    <Text style={[styles.cell, styles.headerCell, { flexGrow: 3 }]}>Description</Text>
                    <Text style={[styles.cell, styles.headerCell, styles.right]}>Qté</Text>
                    <Text style={[styles.cell, styles.headerCell, styles.right]}>PU (€)</Text>
                    {!autoEntrepreneurMode && <Text style={[styles.cell, styles.headerCell, styles.right]}>TVA (%)</Text>}
                  </View>
                  {lines.map((line, index) => {
                    const description = String(line.description || 'Ligne sans titre');
                    const quantity = Number(line.quantity ?? 0);
                    const unitPrice = Number(line.unitPrice ?? line.unit_price ?? 0);
                    const taxRate = Number(line.taxRate ?? line.tax_rate ?? 0);
                    return (
                      <View
                        key={`row-${index}`}
                        style={[
                          styles.bodyRow,
                          index === 0 ? { borderTop: borderToken } : {},
                        ]}
                      >
                        <Text style={[styles.cell, { flexGrow: 3 }]}>{description}</Text>
                        <Text style={[styles.cell, styles.right]}>{quantity.toString()}</Text>
                        <Text style={[styles.cell, styles.right]}>{unitPrice.toFixed(2)}</Text>
                        {!autoEntrepreneurMode && <Text style={[styles.cell, styles.right]}>{taxRate.toFixed(2)}</Text>}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={{ fontWeight: 600 }}>Notes</Text>
              <Text>{parsedMetadata?.notes ? String(parsedMetadata.notes) : 'Aucune note fournie.'}</Text>
            </View>

            <View>
              <Text>Origine : {(billingDoc.origin || 'rental') === 'manual' ? 'Création manuelle' : 'Dérivée d’un projet'}</Text>
              <Text>Échéance : {formatDate(billingDoc.due_date)}</Text>
            </View>
            {footerEnabled && documentDesign.legalFooterMode === 'last' && (
              <View style={styles.footerFlow}>
                {legalFooterLines.map((line, index) => (
                  <Text key={`footer-line-${index}`}>{line}</Text>
                ))}
              </View>
            )}
            {footerFixed && (
              <Text fixed style={styles.footer}>
                {legalFooterLines.join('\n')}
              </Text>
            )}
          </Page>
        </Document>
      );

      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${billingDoc.invoice_number}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('PDF généré');
    } catch (err) {
      console.error('generate invoice pdf', err);
      toast.error('Impossible de générer le PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleRegisterPayment = async () => {
    if (!billingDoc?.id) return;
    const amount = Number(paymentAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Montant invalide.');
      return;
    }

    setRegisteringPayment(true);
    try {
      const db = supabase as any;
      const { error } = await db.rpc('register_invoice_payment', {
        p_invoice_id: billingDoc.id,
        p_amount: amount,
        p_payment_method: paymentMethod || 'virement',
        p_payment_date: paymentDate || new Date().toISOString().slice(0, 10),
        p_reference: paymentReference || null,
        p_schedule_id: paymentScheduleId || null,
        p_payment_type: amount < 0 ? 'refund' : 'payment',
      });
      if (error) throw error;

      toast.success('Paiement enregistré.');
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentScheduleId('');
      await fetchDocument();
    } catch (err) {
      console.error('register payment', err);
      toast.error("Impossible d'enregistrer le paiement");
    } finally {
      setRegisteringPayment(false);
    }
  };

  const handleLogReminder = async () => {
    if (!billingDoc?.id) return;
    setLoggingReminder(true);
    try {
      const db = supabase as any;
      const { error } = await db.from('invoice_reminders').insert({
        invoice_id: billingDoc.id,
        reminder_type: reminderType,
        channel: reminderChannel,
        status: 'sent',
        recipient: reminderRecipient || null,
        subject: reminderSubject || null,
        planned_for: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Relance enregistrée.');
      setReminderRecipient('');
      setReminderSubject('');
      await fetchDocument();
    } catch (err) {
      console.error('log reminder', err);
      toast.error("Impossible d'enregistrer la relance");
    } finally {
      setLoggingReminder(false);
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

  const statusMeta = STATUS_LABELS[billingDoc.status] || STATUS_LABELS.draft;
  const quoteStatusMeta = QUOTE_STATUS_LABELS[billingDoc.quote_status || 'none'] || QUOTE_STATUS_LABELS.none;
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Documents & actions</h2>
          <p className="text-sm text-gray-500">
            Gérez la génération et l’envoi du document depuis cette section.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => toast.success('Document généré (simulation)')}
              className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-blue-400 hover:bg-blue-50"
            >
              <span>Générer PDF</span>
              <Printer className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toast.success('Document envoyé par email (simulation)')}
              className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-blue-400 hover:bg-blue-50"
            >
              <span>Envoyer par email</span>
              <Mail className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
            Aucune pièce jointe. Glissez un document ici ou cliquez pour importer (fonctionnalité à venir).
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Informations</h2>
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

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Encaissements</h2>
          <div className="text-sm text-gray-600">
            Payé {formatCurrency(billingDoc.paid_amount || 0)} • Reste {formatCurrency(billingDoc.balance_due || 0)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="number"
            min={0}
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="Montant"
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
          <input
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            placeholder="Méthode"
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
          <select
            value={paymentScheduleId}
            onChange={(e) => setPaymentScheduleId(e.target.value)}
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Allocation auto</option>
            {scheduleRows.map((row) => (
              <option key={row.id} value={row.id}>
                Échéance {row.installment_no} • reste {row.remaining_amount.toFixed(2)} €
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRegisterPayment}
            disabled={registeringPayment}
            className={`rounded-md px-3 py-2 text-sm font-medium text-white ${
              registeringPayment ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {registeringPayment ? 'Enregistrement…' : 'Ajouter paiement'}
          </button>
        </div>
        <input
          value={paymentReference}
          onChange={(e) => setPaymentReference(e.target.value)}
          placeholder="Référence (optionnel)"
          className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
        />

        <div className="space-y-2">
          {allocationRows.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun encaissement enregistré.</p>
          ) : (
            allocationRows.map((allocation) => (
              <div key={allocation.id} className="rounded border border-gray-100 px-3 py-2 text-sm text-gray-700 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">
                    {formatCurrency(allocation.amount)} • {allocation.payment?.payment_method || 'Méthode inconnue'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(allocation.payment?.payment_date || allocation.allocated_at)} • {allocation.payment?.reference || allocation.id.slice(0, 8)}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {allocation.schedule_id ? 'Affecté à une échéance' : 'Allocation libre'}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Échéancier</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Libellé</th>
                <th className="px-3 py-2 text-left">Échéance</th>
                <th className="px-3 py-2 text-right">Montant</th>
                <th className="px-3 py-2 text-right">Payé</th>
                <th className="px-3 py-2 text-right">Reste</th>
                <th className="px-3 py-2 text-left">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scheduleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-sm text-gray-500">
                    Aucun échéancier enregistré.
                  </td>
                </tr>
              )}
              {scheduleRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.installment_no}</td>
                  <td className="px-3 py-2">{row.label || `Échéance ${row.installment_no}`}</td>
                  <td className="px-3 py-2">{formatDate(row.due_date)}</td>
                  <td className="px-3 py-2 text-right">{row.due_amount.toFixed(2)} €</td>
                  <td className="px-3 py-2 text-right">{row.paid_amount.toFixed(2)} €</td>
                  <td className="px-3 py-2 text-right">{row.remaining_amount.toFixed(2)} €</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : row.status === 'overdue'
                          ? 'bg-red-100 text-red-700'
                          : row.status === 'partially_paid'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Relances</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={reminderType}
            onChange={(e) => setReminderType(e.target.value)}
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="due_soon">Bientôt à échéance</option>
            <option value="overdue_1">Retard 1</option>
            <option value="overdue_2">Retard 2</option>
            <option value="final_notice">Mise en demeure</option>
            <option value="custom">Personnalisée</option>
          </select>
          <select
            value={reminderChannel}
            onChange={(e) => setReminderChannel(e.target.value)}
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="manual">Manuel</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="other">Autre</option>
          </select>
          <input
            value={reminderRecipient}
            onChange={(e) => setReminderRecipient(e.target.value)}
            placeholder="Destinataire"
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
          <input
            value={reminderSubject}
            onChange={(e) => setReminderSubject(e.target.value)}
            placeholder="Objet"
            className="rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleLogReminder}
            disabled={loggingReminder}
            className={`rounded-md px-3 py-2 text-sm font-medium text-white ${
              loggingReminder ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loggingReminder ? 'Enregistrement…' : 'Ajouter relance'}
          </button>
        </div>

        <div className="space-y-2">
          {reminderRows.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune relance enregistrée.</p>
          ) : (
            reminderRows.map((reminder) => (
              <div key={reminder.id} className="rounded border border-gray-100 px-3 py-2 text-sm text-gray-700">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">
                    {reminder.reminder_type} • {reminder.channel}
                  </div>
                  <div className="text-xs text-gray-500">{formatDate(reminder.sent_at || reminder.planned_for || reminder.created_at)}</div>
                </div>
                <div className="text-xs text-gray-500">
                  {reminder.status} {reminder.recipient ? `• ${reminder.recipient}` : ''}
                </div>
                {reminder.subject && <div className="text-xs text-gray-500">{reminder.subject}</div>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default BillingDetailPage;
