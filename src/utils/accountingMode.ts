import type { CompanySettings } from '../hooks/useCompanySettings';

export const AUTO_ENTREPRENEUR_TVA_NOTE = 'TVA non applicable, art. 293 B du CGI';

export const isAutoEntrepreneurMode = (
  settings: Pick<CompanySettings, 'is_auto_entrepreneur'> | null | undefined,
): boolean => Boolean(settings?.is_auto_entrepreneur);

export const normalizeTtcPair = (value: number) => {
  const amount = Number.isFinite(value) ? value : 0;
  return {
    amount_ttc: amount,
    amount_ht: amount,
    vat_amount: 0,
  };
};
