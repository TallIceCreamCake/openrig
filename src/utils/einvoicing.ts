/**
 * Préparation à la conformité facture électronique (réforme française).
 *
 * Vérifie la présence des mentions obligatoires d'une facture conforme :
 * identification complète du vendeur et de l'acheteur (SIREN/SIRET, TVA
 * intracommunautaire), numérotation, dates, et ventilation de TVA par taux.
 * Sert à afficher l'état de préparation dans l'interface — la génération du
 * format Factur-X s'appuiera sur ces mêmes données.
 */

export interface SellerComplianceInput {
  name?: string | null;
  address?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  legal_form?: string | null;
  naf?: string | null;
}

export interface BuyerComplianceInput {
  name?: string | null;
  address?: string | null;
  billing_address?: string | null;
  siren?: string | null;
  siret?: string | null;
  vat_number?: string | null;
}

export interface InvoiceComplianceInput {
  invoice_number?: string | null;
  issue_date?: string | null;
  delivery_date?: string | null;
  due_date?: string | null;
  vat_breakdown?: unknown;
  finalized_at?: string | null;
  document_type?: string | null;
}

export interface ComplianceIssue {
  field: string;
  label: string;
}

export interface ComplianceResult {
  ready: boolean;
  issues: ComplianceIssue[];
}

const present = (value?: string | null) => typeof value === 'string' && value.trim().length > 0;

export const checkSellerCompliance = (seller: SellerComplianceInput | null | undefined): ComplianceResult => {
  const issues: ComplianceIssue[] = [];
  if (!present(seller?.name)) issues.push({ field: 'name', label: "Raison sociale de l'entreprise" });
  if (!present(seller?.address)) issues.push({ field: 'address', label: 'Adresse du siège' });
  if (!present(seller?.siret)) issues.push({ field: 'siret', label: 'SIRET' });
  if (!present(seller?.vat_number)) issues.push({ field: 'vat_number', label: 'N° TVA intracommunautaire' });
  return { ready: issues.length === 0, issues };
};

export const checkBuyerCompliance = (buyer: BuyerComplianceInput | null | undefined): ComplianceResult => {
  const issues: ComplianceIssue[] = [];
  if (!present(buyer?.name)) issues.push({ field: 'name', label: 'Nom / raison sociale du client' });
  if (!present(buyer?.billing_address) && !present(buyer?.address)) {
    issues.push({ field: 'address', label: 'Adresse de facturation du client' });
  }
  // SIREN obligatoire pour les transactions B2B domestiques de la réforme.
  if (!present(buyer?.siren) && !present(buyer?.siret)) {
    issues.push({ field: 'siren', label: 'SIREN/SIRET du client (B2B)' });
  }
  return { ready: issues.length === 0, issues };
};

export const checkInvoiceCompliance = (invoice: InvoiceComplianceInput | null | undefined): ComplianceResult => {
  const issues: ComplianceIssue[] = [];
  if (!present(invoice?.invoice_number)) issues.push({ field: 'invoice_number', label: 'Numéro de facture' });
  if (!present(invoice?.issue_date)) issues.push({ field: 'issue_date', label: "Date d'émission" });
  if (!present(invoice?.due_date)) issues.push({ field: 'due_date', label: "Date d'échéance" });
  const breakdown = invoice?.vat_breakdown;
  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    issues.push({ field: 'vat_breakdown', label: 'Ventilation de TVA par taux' });
  }
  if (!present(invoice?.finalized_at)) {
    issues.push({ field: 'finalized_at', label: 'Facture non finalisée (numérotation définitive)' });
  }
  return { ready: issues.length === 0, issues };
};

export interface VatBreakdownEntry {
  rate: number;
  base_ht: number;
  vat_amount: number;
}

/** Ventilation de TVA par taux à partir de lignes { total_ht, total_ttc, tax_rate }. */
export const computeVatBreakdown = (
  lines: Array<{ total_ht?: number | null; total_ttc?: number | null; tax_rate?: number | null; line_type?: string | null }>,
): VatBreakdownEntry[] => {
  const byRate = new Map<number, { base: number; vat: number }>();
  for (const line of lines) {
    if (line.line_type === 'comment') continue;
    const rate = Number(line.tax_rate ?? 0);
    const ht = Number(line.total_ht ?? 0);
    const ttc = Number(line.total_ttc ?? 0);
    const entry = byRate.get(rate) || { base: 0, vat: 0 };
    entry.base += ht;
    entry.vat += ttc - ht;
    byRate.set(rate, entry);
  }
  return Array.from(byRate.entries())
    .map(([rate, { base, vat }]) => ({
      rate,
      base_ht: Math.round(base * 100) / 100,
      vat_amount: Math.round(vat * 100) / 100,
    }))
    .sort((a, b) => a.rate - b.rate);
};
