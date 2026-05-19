export interface DocumentTableDesign {
  headerBackground: string;
  headerTextColor: string;
  rowStripeColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
  cellPadding: number;
  fontFamily: string;
  fontSize: number;
  backgroundImageUrl: string;
  backgroundPositionX: number;
  backgroundPositionY: number;
  backgroundScale: number;
  logoImageUrl: string;
  logoPositionX: number;
  logoPositionY: number;
  logoScale: number;
  tableBackdropMode: 'opaque' | 'solid';
  tableBackdropColor: string;
  tableBackdropOpacity: number;
  legalFooterMode: 'all' | 'last';
  titleFontSize: number;
  titleFontFamily: string;
  titleAlign: 'left' | 'center' | 'right';
  titleMarginTop: number;
  titleMarginBottom: number;
  infoBlockPadding: number;
  infoBlockMarginTop: number;
  infoBlockMarginBottom: number;
  infoBlockColumnGap: number;
  infoBlockLineHeight: number;
}

export const DEFAULT_DOCUMENT_DESIGN: DocumentTableDesign = {
  headerBackground: '#111827',
  headerTextColor: '#ffffff',
  rowStripeColor: '#f3f4f6',
  borderColor: '#e5e7eb',
  borderWidth: 1,
  cornerRadius: 8,
  cellPadding: 12,
  fontFamily: 'Inter',
  fontSize: 12,
  backgroundImageUrl: '',
  backgroundPositionX: 50,
  backgroundPositionY: 50,
  backgroundScale: 1,
  logoImageUrl: '',
  logoPositionX: 8,
  logoPositionY: 8,
  logoScale: 1,
  tableBackdropMode: 'opaque',
  tableBackdropColor: '#ffffff',
  tableBackdropOpacity: 0.88,
  legalFooterMode: 'last',
  titleFontSize: 0,
  titleFontFamily: '',
  titleAlign: 'left',
  titleMarginTop: 0,
  titleMarginBottom: 6,
  infoBlockPadding: 0,
  infoBlockMarginTop: 8,
  infoBlockMarginBottom: 8,
  infoBlockColumnGap: 20,
  infoBlockLineHeight: 1.35,
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
};

export const normalizeDocumentDesign = (raw: unknown): DocumentTableDesign => {
  let source: Record<string, unknown> = {};
  if (!raw) {
    return { ...DEFAULT_DOCUMENT_DESIGN };
  }
  try {
    if (typeof raw === 'string') {
      source = JSON.parse(raw);
    } else if (typeof raw === 'object') {
      source = { ...(raw as Record<string, unknown>) };
    }
  } catch (err) {
    console.warn('document design parse error', err);
    source = {};
  }

  return {
    headerBackground: typeof source.headerBackground === 'string' ? source.headerBackground : DEFAULT_DOCUMENT_DESIGN.headerBackground,
    headerTextColor: typeof source.headerTextColor === 'string' ? source.headerTextColor : DEFAULT_DOCUMENT_DESIGN.headerTextColor,
    rowStripeColor: typeof source.rowStripeColor === 'string' ? source.rowStripeColor : DEFAULT_DOCUMENT_DESIGN.rowStripeColor,
    borderColor: typeof source.borderColor === 'string' ? source.borderColor : DEFAULT_DOCUMENT_DESIGN.borderColor,
    borderWidth: toNumber(source.borderWidth, DEFAULT_DOCUMENT_DESIGN.borderWidth),
    cornerRadius: toNumber(source.cornerRadius, DEFAULT_DOCUMENT_DESIGN.cornerRadius),
    cellPadding: toNumber(source.cellPadding, DEFAULT_DOCUMENT_DESIGN.cellPadding),
    fontFamily: typeof source.fontFamily === 'string' && source.fontFamily.trim().length
      ? source.fontFamily
      : DEFAULT_DOCUMENT_DESIGN.fontFamily,
    fontSize: toNumber(source.fontSize, DEFAULT_DOCUMENT_DESIGN.fontSize),
    backgroundImageUrl: typeof source.backgroundImageUrl === 'string' ? source.backgroundImageUrl : DEFAULT_DOCUMENT_DESIGN.backgroundImageUrl,
    backgroundPositionX: toNumber(source.backgroundPositionX, DEFAULT_DOCUMENT_DESIGN.backgroundPositionX),
    backgroundPositionY: toNumber(source.backgroundPositionY, DEFAULT_DOCUMENT_DESIGN.backgroundPositionY),
    backgroundScale: Math.max(0.5, toNumber(source.backgroundScale, DEFAULT_DOCUMENT_DESIGN.backgroundScale)),
    logoImageUrl: typeof source.logoImageUrl === 'string' ? source.logoImageUrl : DEFAULT_DOCUMENT_DESIGN.logoImageUrl,
    logoPositionX: toNumber(source.logoPositionX, DEFAULT_DOCUMENT_DESIGN.logoPositionX),
    logoPositionY: toNumber(source.logoPositionY, DEFAULT_DOCUMENT_DESIGN.logoPositionY),
    logoScale: Math.min(3, Math.max(0.3, toNumber(source.logoScale, DEFAULT_DOCUMENT_DESIGN.logoScale))),
    tableBackdropMode: source.tableBackdropMode === 'solid' ? 'solid' : DEFAULT_DOCUMENT_DESIGN.tableBackdropMode,
    tableBackdropColor: typeof source.tableBackdropColor === 'string' ? source.tableBackdropColor : DEFAULT_DOCUMENT_DESIGN.tableBackdropColor,
    tableBackdropOpacity: Math.min(1, Math.max(0, toNumber(source.tableBackdropOpacity, DEFAULT_DOCUMENT_DESIGN.tableBackdropOpacity))),
    legalFooterMode: source.legalFooterMode === 'all' ? 'all' : DEFAULT_DOCUMENT_DESIGN.legalFooterMode,
    titleFontSize: Math.max(0, toNumber(source.titleFontSize, DEFAULT_DOCUMENT_DESIGN.titleFontSize)),
    titleFontFamily: typeof source.titleFontFamily === 'string' ? source.titleFontFamily : DEFAULT_DOCUMENT_DESIGN.titleFontFamily,
    titleAlign: source.titleAlign === 'center' || source.titleAlign === 'right' || source.titleAlign === 'left'
      ? source.titleAlign
      : DEFAULT_DOCUMENT_DESIGN.titleAlign,
    titleMarginTop: Math.max(0, toNumber(source.titleMarginTop, DEFAULT_DOCUMENT_DESIGN.titleMarginTop)),
    titleMarginBottom: Math.max(0, toNumber(source.titleMarginBottom, DEFAULT_DOCUMENT_DESIGN.titleMarginBottom)),
    infoBlockPadding: Math.max(0, toNumber(source.infoBlockPadding, DEFAULT_DOCUMENT_DESIGN.infoBlockPadding)),
    infoBlockMarginTop: Math.max(0, toNumber(source.infoBlockMarginTop, DEFAULT_DOCUMENT_DESIGN.infoBlockMarginTop)),
    infoBlockMarginBottom: Math.max(0, toNumber(source.infoBlockMarginBottom, DEFAULT_DOCUMENT_DESIGN.infoBlockMarginBottom)),
    infoBlockColumnGap: Math.max(0, toNumber(source.infoBlockColumnGap, DEFAULT_DOCUMENT_DESIGN.infoBlockColumnGap)),
    infoBlockLineHeight: Math.min(2, Math.max(1, toNumber(source.infoBlockLineHeight, DEFAULT_DOCUMENT_DESIGN.infoBlockLineHeight))),
  };
};

const parseFeaturesMap = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (map && typeof map === 'object') return { ...(map as Record<string, unknown>) };
  } catch (err) {
    console.warn('features parse error', err);
  }
  return {};
};

export const extractDocumentDesign = (settings: { document_design?: unknown; features?: unknown } | null | undefined): DocumentTableDesign => {
  if (settings?.document_design) {
    const normalized = normalizeDocumentDesign(settings.document_design);
    if (normalized) return normalized;
  }
  const featuresMap = parseFeaturesMap(settings?.features);
  if (featuresMap.document_design) {
    return normalizeDocumentDesign(featuresMap.document_design);
  }
  return { ...DEFAULT_DOCUMENT_DESIGN };
};
