export type LegalCompanyInfo = {
  name?: string | null;
  legalName?: string | null;
  logoUrl?: string | null;
  capital?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  siren?: string | null;
  siret?: string | null;
  naf?: string | null;
  vat?: string | null;
  isAutoEntrepreneur?: boolean | null;
};

const buildLine = (parts: Array<string | null | undefined>) =>
  parts.map((part) => (part ?? '').trim()).filter(Boolean).join(' • ');

export const buildLegalFooterLines = (info?: LegalCompanyInfo | null): string[] => {
  if (!info) return [];
  const name = (info.legalName || info.name || '').trim();
  const capital = (info.capital || '').trim();
  const address = (info.address || '').trim();
  const phone = (info.phone || '').trim();
  const email = (info.email || '').trim();
  const siren = (info.siren || '').trim();
  const siret = (info.siret || '').trim();
  const naf = (info.naf || '').trim();
  const vat = (info.vat || '').trim();
  const isAutoEntrepreneur = Boolean(info.isAutoEntrepreneur);

  const line1 = buildLine([
    name || null,
    capital ? `Capital: ${capital}` : null,
  ]);
  const line2 = address || '';
  const line3 = buildLine([
    phone ? `Tel: ${phone}` : null,
    email ? `Email: ${email}` : null,
  ]);
  const line4 = buildLine([
    siret ? `SIRET: ${siret}` : null,
    siren ? `SIREN: ${siren}` : null,
    naf ? `NAF: ${naf}` : null,
    isAutoEntrepreneur ? 'TVA non applicable, art. 293 B du CGI' : (vat ? `TVA: ${vat}` : null),
  ]);

  return [line1, line2, line3, line4].filter((line) => line.trim().length > 0);
};
