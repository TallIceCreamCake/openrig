const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const LOGO_BASE_WIDTH_MM = 49.4;
const LOGO_BASE_HEIGHT_MM = 24.7;

const DEFAULT_DOCUMENT_DESIGN = {
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

const toNumber = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
};

const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const applyOpacityToColor = (color, opacityPercent) => {
  const normalized = String(color || '').trim();
  if (!normalized) return 'transparent';
  if (normalized.toLowerCase() === 'transparent') return 'transparent';

  const alpha = clampValue(toNumber(opacityPercent, 100), 0, 100) / 100;
  if (alpha >= 1) return normalized;
  if (alpha <= 0) return 'transparent';

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
      const r = clampValue(parts[0], 0, 255);
      const g = clampValue(parts[1], 0, 255);
      const b = clampValue(parts[2], 0, 255);
      const baseAlpha = parts.length >= 4 && Number.isFinite(parts[3]) ? clampValue(parts[3], 0, 1) : 1;
      return `rgba(${r}, ${g}, ${b}, ${baseAlpha * alpha})`;
    }
  }

  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    const expandedHex = hex.length === 3 || hex.length === 4
      ? hex.split('').map((char) => `${char}${char}`).join('')
      : hex;
    if (expandedHex.length === 6 || expandedHex.length === 8) {
      const r = parseInt(expandedHex.slice(0, 2), 16);
      const g = parseInt(expandedHex.slice(2, 4), 16);
      const b = parseInt(expandedHex.slice(4, 6), 16);
      const baseAlpha = expandedHex.length === 8 ? parseInt(expandedHex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, baseAlpha].every((part) => Number.isFinite(part))) {
        return `rgba(${r}, ${g}, ${b}, ${clampValue(baseAlpha, 0, 1) * alpha})`;
      }
    }
  }

  return normalized;
};

const normalizeDocumentDesign = (raw) => {
  let source = {};
  if (!raw) return { ...DEFAULT_DOCUMENT_DESIGN };
  try {
    if (typeof raw === 'string') {
      source = JSON.parse(raw);
    } else if (typeof raw === 'object') {
      source = { ...raw };
    }
  } catch (_err) {
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

const normalizeStudioSnapshot = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const marginsRaw = raw.margins && typeof raw.margins === 'object' ? raw.margins : {};
  const backgroundRaw = raw.background && typeof raw.background === 'object' ? raw.background : {};
  const headerFooterRaw = raw.headerFooter && typeof raw.headerFooter === 'object' ? raw.headerFooter : {};
  const blocks = Array.isArray(raw.blocks) ? raw.blocks.filter((b) => b && typeof b === 'object') : [];
  const sizeValue = typeof backgroundRaw.size === 'string' ? backgroundRaw.size : 'cover';
  const size = sizeValue === 'contain' || sizeValue === 'auto' || sizeValue === 'cover' ? sizeValue : 'cover';
  const readHeaderFooterSlot = (value) => {
    const slotRaw = value && typeof value === 'object' ? value : {};
    return {
      left: typeof slotRaw.left === 'string' ? slotRaw.left : '',
      center: typeof slotRaw.center === 'string' ? slotRaw.center : '',
      right: typeof slotRaw.right === 'string' ? slotRaw.right : '',
    };
  };
  return {
    margins: {
      top: clampValue(toNumber(marginsRaw.top, 20), 0, 80),
      bottom: clampValue(toNumber(marginsRaw.bottom, 20), 0, 80),
      left: clampValue(toNumber(marginsRaw.left, 14), 0, 80),
      right: clampValue(toNumber(marginsRaw.right, 14), 0, 80),
    },
    background: {
      color: typeof backgroundRaw.color === 'string' ? backgroundRaw.color : '#ffffff',
      image: typeof backgroundRaw.image === 'string' ? backgroundRaw.image : '',
      opacity: clampValue(toNumber(backgroundRaw.opacity, 100), 0, 100),
      size,
    },
    headerFooter: {
      enabled: typeof headerFooterRaw.enabled === 'boolean' ? headerFooterRaw.enabled : false,
      fontSizePt: clampValue(toNumber(headerFooterRaw.fontSizePt, 9), 6, 24),
      textColor: typeof headerFooterRaw.textColor === 'string' ? headerFooterRaw.textColor : '#334155',
      topOffsetMm: clampValue(toNumber(headerFooterRaw.topOffsetMm, 4), 0, 40),
      bottomOffsetMm: clampValue(toNumber(headerFooterRaw.bottomOffsetMm, 4), 0, 40),
      sidePaddingMm: clampValue(toNumber(headerFooterRaw.sidePaddingMm, 3), 0, 40),
      header: readHeaderFooterSlot(headerFooterRaw.header),
      footer: readHeaderFooterSlot(headerFooterRaw.footer),
    },
    blocks,
  };
};

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const clampPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, num));
};

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch (_err) {
    return String(value || '');
  }
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (_err) {
    return String(value || '');
  }
};

const formatDateStudio = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const datePart = date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const timePart = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${datePart} ${timePart}`;
  } catch (_err) {
    return String(value || '');
  }
};

const formatDateOnlyStudio = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (_err) {
    return String(value || '');
  }
};

const formatCurrency = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return `${num.toFixed(2)}€`;
};

const formatCurrencyStudio = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${formatted.replace(/\u00a0|\u202f/g, ' ')} EUR`;
};

const formatTableMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return `${num.toFixed(2)} EUR`;
};

const buildQrCodeImageUrl = (value, sizePx = 640) => {
  const safe = String(value || '').trim();
  if (!safe) return '';
  const size = clampValue(toNumber(sizePx, 640), 64, 2000);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${Math.round(size)}x${Math.round(size)}&margin=0&data=${encodeURIComponent(safe)}`;
};

const applyTemplateVariables = (html, variables) => {
  if (!html) return '';
  return html.replace(/\{\{\s*([a-z0-9_]+)\s*}}/gi, (match, key) => {
    const normalized = String(key).toLowerCase();
    if (normalized in variables) {
      return escapeHtml(variables[normalized]);
    }
    return match;
  });
};

const applyPageBandVariablesForPdfTemplate = (text, variables) => {
  const source = typeof text === 'string' ? text : '';
  const escaped = escapeHtml(source).replace(/\r?\n/g, '<br/>');
  return escaped.replace(/\{\{\s*([a-z0-9_]+)\s*}}/gi, (match, key) => {
    const normalized = String(key).toLowerCase();
    if (normalized === 'document_page') {
      return '<span class="pageNumber"></span>';
    }
    if (normalized === 'document_pages') {
      return '<span class="totalPages"></span>';
    }
    if (normalized in variables) {
      return escapeHtml(variables[normalized]);
    }
    return match;
  });
};

const countPageBandLines = (slot) => {
  if (!slot || typeof slot !== 'object') return 1;
  const keys = ['left', 'center', 'right'];
  let maxLines = 1;
  keys.forEach((key) => {
    const value = typeof slot[key] === 'string' ? slot[key] : '';
    const lineCount = value.length === 0 ? 1 : value.split(/\r?\n/).length;
    maxLines = Math.max(maxLines, lineCount);
  });
  return maxLines;
};

const buildPdfPageBandTemplate = ({
  slot,
  variables,
  textColor,
  fontSizePt,
  sidePaddingMm,
  pageMargins,
  offsetMm,
  placement,
}) => {
  const left = applyPageBandVariablesForPdfTemplate(slot?.left || '', variables);
  const center = applyPageBandVariablesForPdfTemplate(slot?.center || '', variables);
  const right = applyPageBandVariablesForPdfTemplate(slot?.right || '', variables);
  const safeSidePadding = Number.isFinite(Number(sidePaddingMm)) ? Number(sidePaddingMm) : 0;
  const safeFontSize = Number.isFinite(Number(fontSizePt)) ? Number(fontSizePt) : 9;
  const safeOffset = Number.isFinite(Number(offsetMm)) ? Number(offsetMm) : 0;
  const marginLeft = Number.isFinite(Number(pageMargins?.left)) ? Number(pageMargins.left) : 14;
  const marginRight = Number.isFinite(Number(pageMargins?.right)) ? Number(pageMargins.right) : 14;
  const placementPadding = placement === 'top'
    ? `padding-top:${safeOffset}mm;`
    : `padding-bottom:${safeOffset}mm;`;

  return `
    <div style="width:100%;box-sizing:border-box;padding-left:${marginLeft + safeSidePadding}mm;padding-right:${marginRight + safeSidePadding}mm;${placementPadding}font-size:${safeFontSize}pt;color:${escapeHtml(textColor || '#334155')};font-family:Helvetica,Arial,sans-serif;line-height:1.25;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;column-gap:${safeSidePadding}mm;align-items:flex-start;width:100%;">
        <div style="min-width:0;word-break:break-word;text-align:left;">${left}</div>
        <div style="min-width:0;word-break:break-word;text-align:center;">${center}</div>
        <div style="min-width:0;word-break:break-word;text-align:right;">${right}</div>
      </div>
    </div>
  `;
};

const buildLine = (parts) =>
  parts.map((part) => (part ?? '').trim()).filter(Boolean).join(' • ');

const buildLegalFooterLines = (info) => {
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
    vat ? `TVA: ${vat}` : null,
  ]);

  return [line1, line2, line3, line4].filter((line) => line.trim().length > 0);
};

const resolveDocumentEquipmentType = (item) => {
  const equipmentType = typeof item?.equipment_type === 'string' ? item.equipment_type.trim() : '';
  const externalType = typeof item?.external_type === 'string' ? item.external_type.trim() : '';

  if (item?.is_external) {
    if (externalType) return externalType;
    if (equipmentType) {
      return equipmentType
        .replace(/\s+\([^)]*\)\s*$/g, '')
        .replace(/\s*\/\s*.+$/g, '')
        .trim() || 'Externe';
    }
    return 'Externe';
  }

  return equipmentType || 'Autre';
};

const buildDesignation = (name, type, includeType, indent) => {
  const prefix = indent ? '  ' : '';
  const base = `${prefix}${name}`;
  if (!includeType || !type) return base;
  return `${base}\n${prefix}${type}`;
};

const stripPackLabel = (value) => {
  const cleaned = String(value || '').replace(/\bpack\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  return cleaned || value;
};

const normalizeRentalDocumentType = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'devis' || normalized === 'quote' || normalized === 'quotation' || normalized === 'estimate') return 'devis';
  if (normalized === 'facture' || normalized === 'invoice') return 'facture';
  if (
    normalized === 'bon_prepa'
    || normalized === 'bon-prepa'
    || normalized === 'bonprepa'
    || normalized === 'prep'
    || normalized === 'preparation'
    || normalized === 'bon'
  ) return 'bon_prepa';
  return null;
};

const columnCatalog = {
  equipment: { key: 'equipment', label: 'Désignation', weight: 2.35 },
  type: { key: 'type', label: 'Type', weight: 1.15 },
  qty: { key: 'qty', label: 'Qté', align: 'right', weight: 0.85 },
  rem: { key: 'rem', label: 'Rem', align: 'right', weight: 0.85 },
  priceperday: { key: 'pricePerDay', label: 'PU', align: 'right', weight: 1.15 },
  pricePerDay: { key: 'pricePerDay', label: 'PU', align: 'right', weight: 1.15 },
  unit_price: { key: 'pricePerDay', label: 'PU', align: 'right', weight: 1.15 },
  days: { key: 'days', label: 'Jours', align: 'right', weight: 0.8 },
  total: { key: 'total', label: 'Total', align: 'right', weight: 1.25 },
  checkbox: { key: 'checkbox', label: '', align: 'center', weight: 0.6 },
  coefficient: { key: 'coefficient', label: 'Coeff.', align: 'right', weight: 0.85 },
  coef: { key: 'coefficient', label: 'Coeff.', align: 'right', weight: 0.85 },
  designation: { key: 'equipment', label: 'Désignation', weight: 2.35 },
  quantity: { key: 'qty', label: 'Qté', align: 'right', weight: 0.85 },
  discount: { key: 'rem', label: 'Rem', align: 'right', weight: 0.85 },
};

const organizeColumns = (cols, docType) => {
  const hasEquipment = cols.some((col) => col.key === 'equipment');
  const hasType = cols.some((col) => col.key === 'type');
  const filtered = hasEquipment ? cols.filter((col) => col.key !== 'type') : cols;
  const qtyCol = filtered.find((col) => col.key === 'qty');
  const equipmentCol = filtered.find((col) => col.key === 'equipment');
  const rest = filtered.filter((col) => col.key !== 'qty' && col.key !== 'equipment');
  const ordered = [
    ...(qtyCol ? [qtyCol] : []),
    ...(equipmentCol ? [equipmentCol] : []),
    ...rest,
  ];
  return { columns: ordered, includeTypeInDesignation: hasEquipment && hasType };
};

const buildTableHtml = ({
  docType,
  columnsToken,
  rental,
  equipmentGroups,
  packItemsByEquipmentId,
  days,
  effectiveEquipmentCoefficient,
  maintenanceCharges,
  insuranceServiceRows,
  personnelServiceRows,
  otherServiceRows,
  deliveryLine,
  design,
  accentColor,
  tableOptions = {},
}) => {
  const tableCols = columnsToken
    ? columnsToken.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : (docType === 'bon_prepa'
      ? ['equipment', 'type', 'qty', 'checkbox']
      : docType === 'facture'
        ? ['equipment', 'qty', 'pricePerDay', 'days', 'total']
        : ['equipment', 'type', 'qty', 'pricePerDay', 'days', 'total']);
  const columns = tableCols.map((key) => columnCatalog[key] || { key, label: key });
  const { columns: orderedColumns, includeTypeInDesignation } = organizeColumns(columns, docType);
  const includeFinancialColumns = docType !== 'bon_prepa';
  const showCategories = tableOptions.showCategories !== false;
  const styleOverrides = tableOptions.style && typeof tableOptions.style === 'object' ? tableOptions.style : {};
  const useStudioFormatting = tableOptions.renderMode === 'studio';
  const formatMoney = useStudioFormatting ? formatTableMoney : formatCurrency;
  const normalizeAlign = (value, fallback = 'auto') => (
    value === 'left' || value === 'center' || value === 'right' || value === 'auto'
      ? value
      : fallback
  );
  const normalizeAlignMap = (value) => {
    if (!value || typeof value !== 'object') return {};
    const aliases = {
      qty: 'qty',
      quantity: 'qty',
      equipment: 'equipment',
      designation: 'equipment',
      type: 'type',
      rem: 'rem',
      discount: 'rem',
      priceperday: 'pricePerDay',
      price_per_day: 'pricePerDay',
      unit_price: 'pricePerDay',
      total: 'total',
      days: 'days',
      coefficient: 'coefficient',
      coef: 'coefficient',
      checkbox: 'checkbox',
    };
    const normalized = {};
    Object.entries(value).forEach(([rawKey, rawAlign]) => {
      const align = normalizeAlign(rawAlign, 'auto');
      if (align === 'auto') return;
      const key = typeof rawKey === 'string' ? rawKey.trim() : '';
      if (!key) return;
      const aliasKey = aliases[key] || aliases[key.toLowerCase()] || key;
      normalized[aliasKey] = align;
    });
    return normalized;
  };
  const resolveAlignClass = (columnAlign, override) => {
    const chosen = !override || override === 'auto' ? columnAlign : override;
    if (chosen === 'right') return 'align-right';
    if (chosen === 'center') return 'align-center';
    return 'align-left';
  };
  const headerAlignOverride = normalizeAlign(styleOverrides.headerTextAlign, 'auto');
  const bodyAlignOverride = normalizeAlign(styleOverrides.bodyTextAlign, 'auto');
  const headerAlignMap = normalizeAlignMap(styleOverrides.headerColumnTextAlign);
  const bodyAlignMap = normalizeAlignMap(styleOverrides.bodyColumnTextAlign);
  const categoryAlign = normalizeAlign(styleOverrides.categoryTextAlign, 'left');
  const totalWeight = orderedColumns.reduce((sum, col) => sum + (Number(col.weight) > 0 ? Number(col.weight) : 1), 0);
  const colgroupHtml = orderedColumns
    .map((col) => {
      const widthPct = ((Number(col.weight) > 0 ? Number(col.weight) : 1) / (totalWeight || 1)) * 100;
      return `<col style="width:${widthPct.toFixed(5)}%" />`;
    })
    .join('');

  const headHtml = orderedColumns.map((col) => {
    const alignClass = resolveAlignClass(col.align, headerAlignMap[col.key] || headerAlignOverride);
    return `<th class="${alignClass}">${escapeHtml(col.label)}</th>`;
  }).join('');

  const rowCells = (valueMap, { isPack = false } = {}) => {
    return orderedColumns.map((col) => {
      const alignClass = resolveAlignClass(col.align, bodyAlignMap[col.key] || bodyAlignOverride);
      const cellClass = isPack && col.key === 'equipment' ? 'pack-cell' : '';
      if (col.key === 'checkbox') {
        const content = isPack ? '' : '<span class="doc-checkbox-box" aria-hidden="true"></span>';
        return `<td class="${alignClass} ${cellClass}">${content}</td>`;
      }
      const value = valueMap[col.key] ?? '';
      const content = typeof value === 'string' ? value : String(value ?? '');
      return `<td class="${alignClass} ${cellClass}">${content}</td>`;
    }).join('');
  };

  const bodyRows = [];

  const flattenedItems = equipmentGroups.reduce((acc, group) => acc.concat(group.items || []), []);
  const groupsToRender = showCategories ? equipmentGroups : [{ name: '', items: flattenedItems }];

  groupsToRender.forEach((group) => {
    if (!group.items.length) return;
    if (showCategories && group.name) {
      bodyRows.push(`<tr class="group-row"><td style="text-align:${categoryAlign === 'auto' ? 'left' : categoryAlign}" colspan="${orderedColumns.length}">${escapeHtml(group.name)}</td></tr>`);
    }
    group.items.forEach((item) => {
      const discountPct = Number.isFinite(item.discount_percent)
        ? Math.min(100, Math.max(0, Number(item.discount_percent)))
        : 0;
      const lineTotal = item.price_per_day * item.quantity * effectiveEquipmentCoefficient * (1 - discountPct / 100);
      const packItems = item.equipment_id ? packItemsByEquipmentId?.[item.equipment_id] : null;
      const baseName = (docType === 'bon_prepa' && Array.isArray(packItems) && packItems.length > 0)
        ? stripPackLabel(item.equipment_name || 'Équipement')
        : (item.equipment_name || 'Équipement');
      const designationRaw = buildDesignation(
        baseName,
        resolveDocumentEquipmentType(item),
        includeTypeInDesignation,
        false,
      );
      const designation = escapeHtml(designationRaw).replace(/\n/g, '<br/>');
      const row = {
        qty: item.quantity,
        equipment: designation,
        type: escapeHtml(resolveDocumentEquipmentType(item)),
        rem: includeFinancialColumns ? (discountPct > 0 ? `${discountPct}%` : '-') : '',
        pricePerDay: includeFinancialColumns ? formatMoney(item.price_per_day) : '',
        days: String(days),
        coefficient: Number.isFinite(effectiveEquipmentCoefficient)
          ? effectiveEquipmentCoefficient.toFixed(2)
          : String(effectiveEquipmentCoefficient ?? ''),
        total: includeFinancialColumns ? formatMoney(lineTotal) : '',
        checkbox: '',
      };
      bodyRows.push(`<tr>${rowCells(row)}</tr>`);

      if (Array.isArray(packItems) && packItems.length > 0) {
        packItems.forEach((packItem) => {
          const label = escapeHtml(`${packItem.quantity} x ${packItem.name}`);
          const packRow = {
            qty: String(packItem.quantity),
            equipment: `&nbsp;&nbsp;${label}`,
            type: '',
            rem: '',
            pricePerDay: '',
            days: '',
            coefficient: '',
            total: '',
            checkbox: '',
            __pack: true,
          };
          bodyRows.push(`<tr class="pack-row">${rowCells(packRow, { isPack: true })}</tr>`);
        });
      }
    });
  });

  const pushServiceGroup = (title, rows) => {
    if (!rows.length) return;
    bodyRows.push(`<tr class="group-row"><td style="text-align:${categoryAlign === 'auto' ? 'left' : categoryAlign}" colspan="${orderedColumns.length}">${escapeHtml(title)}</td></tr>`);
    rows.forEach((row) => {
      bodyRows.push(`<tr>${rowCells(row)}</tr>`);
    });
  };

  if (maintenanceCharges.length > 0) {
    const rows = maintenanceCharges.map((charge) => ({
      qty: 1,
      equipment: escapeHtml(charge.label || 'Maintenance'),
      type: 'Maintenance / SAV',
      rem: '',
      pricePerDay: includeFinancialColumns ? formatMoney(charge.amount || 0) : '',
      days: '1',
      total: includeFinancialColumns ? formatMoney(charge.amount || 0) : '',
      checkbox: '',
    }));
    pushServiceGroup('Maintenance / SAV', rows);
  }

  if (insuranceServiceRows.length > 0) {
    const rows = insuranceServiceRows.map((row) => ({
      qty: 1,
      equipment: escapeHtml(row.title || 'Assurance'),
      type: 'Service assurance',
      rem: '',
      pricePerDay: includeFinancialColumns ? formatMoney(row.unitPrice) : '',
      days: String(row.days),
      total: includeFinancialColumns ? formatMoney(row.total) : '',
      checkbox: '',
    }));
    pushServiceGroup('Assurance', rows);
  }

  if (personnelServiceRows.length > 0) {
    const rows = personnelServiceRows.map((row) => ({
      qty: row.quantity,
      equipment: escapeHtml(row.title || 'Service personnel'),
      type: 'Service personnel',
      rem: includeFinancialColumns ? (row.discountPercent > 0 ? `${row.discountPercent}%` : '-') : '',
      pricePerDay: includeFinancialColumns ? formatMoney(row.unitPrice) : '',
      days: String(row.days),
      total: includeFinancialColumns ? formatMoney(row.total) : '',
      checkbox: '',
    }));
    pushServiceGroup('Personnel', rows);
  }

  if (otherServiceRows.length > 0) {
    const rows = otherServiceRows.map((row) => ({
      qty: row.quantity,
      equipment: escapeHtml(row.title || 'Service'),
      type: 'Autre service',
      rem: includeFinancialColumns ? (row.discountPercent > 0 ? `${row.discountPercent}%` : '0%') : '',
      pricePerDay: includeFinancialColumns ? formatMoney(row.unitPrice) : '',
      days: String(row.days),
      total: includeFinancialColumns ? formatMoney(row.total) : '',
      checkbox: '',
    }));
    pushServiceGroup('Autre', rows);
  }

  if (deliveryLine) {
    const rows = [{
      qty: deliveryLine.quantity,
      equipment: escapeHtml(deliveryLine.designation),
      type: 'Service transport',
      rem: '',
      pricePerDay: includeFinancialColumns ? formatMoney(deliveryLine.unitPrice) : '',
      days: '1',
      total: includeFinancialColumns ? formatMoney(deliveryLine.total) : '',
      checkbox: '',
    }];
    pushServiceGroup('Livraison', rows);
  }

  const radius = Math.max(0, toNumber(styleOverrides.borderRadius, design.cornerRadius || 0));
  const borderWidth = Math.max(0, toNumber(styleOverrides.borderWidth, design.borderWidth || 0));
  const borderColor = styleOverrides.borderColor || design.borderColor || '#e5e7eb';
  const cellPaddingX = Math.max(0, toNumber(styleOverrides.cellPaddingX, design.cellPadding || 0));
  const cellPaddingY = Math.max(0, toNumber(styleOverrides.cellPaddingY, design.cellPadding || 0));
  const headerBg = styleOverrides.headerBackground || design.headerBackground || accentColor;
  const headerText = styleOverrides.headerTextColor || design.headerTextColor || '#ffffff';
  const rowStripe = styleOverrides.rowStripeColor || design.rowStripeColor || '#f3f4f6';
  const categoryBg = styleOverrides.categoryBackground || rowStripe;
  const categoryText = styleOverrides.categoryTextColor || '#111827';
  const bodyBg = styleOverrides.bodyBackground || '#ffffff';
  const tableFontSize = toNumber(styleOverrides.fontSize, design.fontSize || 12);
  const headerFontSize = toNumber(styleOverrides.headerFontSize, tableFontSize);
  const headerBold = typeof styleOverrides.headerBold === 'boolean' ? styleOverrides.headerBold : true;
  const rowGapPxRaw = clampValue(toNumber(styleOverrides.rowGapPx, 0), 0, 48);
  // Studio export must stay stable and predictable in pagination.
  // Any row-gap in Chromium print can trigger table fragmentation artifacts.
  const rowGapPx = useStudioFormatting ? 0 : rowGapPxRaw;
  const borderCollapse = rowGapPx > 0 ? 'separate' : 'collapse';
  const borderSpacing = rowGapPx > 0 ? `0 ${rowGapPx}px` : '0';
  const equipmentColumnIndex = orderedColumns.findIndex((col) => col.key === 'equipment');

  if (useStudioFormatting) {
    const studioBodyHtml = `<tbody>${bodyRows.join('')}</tbody>`;
    const studioCss = `
      .doc-studio-table-wrap{border:${borderWidth}px solid ${borderColor};border-radius:${radius}px;overflow:visible;background:${bodyBg};break-inside:auto;page-break-inside:auto}
      .doc-studio-table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:${tableFontSize / 1.333}pt;background:${bodyBg}}
      .doc-studio-table th,.doc-studio-table td{box-sizing:border-box;padding:${cellPaddingY}px ${cellPaddingX}px;border-top:none;border-bottom:${borderWidth}px solid ${borderColor};border-right:${borderWidth}px solid ${borderColor};vertical-align:top}
      .doc-studio-table th:last-child,.doc-studio-table td:last-child{border-right:none}
      .doc-studio-table td{background:${bodyBg};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .doc-studio-table thead th{background:${headerBg};color:${headerText};font-size:${headerFontSize / 1.333}pt;font-weight:${headerBold ? 700 : 600};border-bottom:${borderWidth}px solid ${borderColor}}
      .doc-studio-table .group-row td{background:${categoryBg};color:${categoryText};font-weight:700;border-top:${borderWidth}px solid ${borderColor};border-bottom:${borderWidth}px solid ${borderColor}}
      .doc-studio-table tbody tr:first-child.group-row td{border-top:none}
      .doc-studio-table tbody tr:last-child td{border-bottom:none}
      .doc-studio-table thead{display:table-row-group}
      .doc-studio-table tbody{display:table-row-group}
      .doc-studio-table tfoot{display:table-row-group}
      .doc-studio-table tr{break-inside:avoid;page-break-inside:avoid}
      .doc-studio-table td,.doc-studio-table th{break-inside:avoid;page-break-inside:avoid}
      .doc-studio-table .group-row{break-after:auto;page-break-after:auto}
      .doc-studio-table .group-row + tr{break-before:auto;page-break-before:auto}
      .doc-studio-table .pack-row td{font-size:${Math.max(10, tableFontSize - 1) / 1.333}pt;color:#475569}
      .doc-studio-table .pack-cell{padding-left:${Math.max(8, cellPaddingX)}px}
      .doc-studio-table-wrap .doc-checkbox-box{display:inline-block;width:11pt;height:11pt;border:1.3px solid #64748b;border-radius:2px;box-sizing:border-box;vertical-align:middle}
      .doc-studio-table-wrap .align-left{text-align:left}
      .doc-studio-table-wrap .align-center{text-align:center}
      .doc-studio-table-wrap .align-right{text-align:right}
      ${equipmentColumnIndex >= 0 ? `.doc-studio-table td:nth-child(${equipmentColumnIndex + 1}),.doc-studio-table th:nth-child(${equipmentColumnIndex + 1}){white-space:normal}` : ''}
    `;
    return `
      <style>${studioCss}</style>
      <div class="doc-studio-table-wrap template-table-wrap">
        <table class="doc-studio-table">
          <colgroup>${colgroupHtml}</colgroup>
          <thead><tr>${headHtml}</tr></thead>
          ${studioBodyHtml}
        </table>
      </div>
    `;
  }

  const tableCss = `
    .doc-table-wrap{border:${borderWidth}px solid ${borderColor};border-radius:${radius}px;overflow:visible;background:${bodyBg};break-inside:auto;page-break-inside:auto;-webkit-region-break-inside:auto}
    .doc-table{width:100%;table-layout:fixed;border-collapse:${borderCollapse};border-spacing:${borderSpacing};font-size:${useStudioFormatting ? tableFontSize / 1.333 : tableFontSize}${useStudioFormatting ? 'pt' : 'px'};background:${bodyBg}}
    .doc-table th,.doc-table td{padding:${cellPaddingY}px ${cellPaddingX}px;border-top:none;border-bottom:${borderWidth}px solid ${borderColor};border-right:${borderWidth}px solid ${borderColor};vertical-align:top}
    .doc-table th:last-child,.doc-table td:last-child{border-right:none}
    .doc-table td{background:${bodyBg};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .doc-table thead th{background:${headerBg};color:${headerText};font-size:${useStudioFormatting ? headerFontSize / 1.333 : headerFontSize}${useStudioFormatting ? 'pt' : 'px'};font-weight:${headerBold ? 700 : 600};border-bottom:${borderWidth}px solid ${borderColor}}
    .doc-table .group-row td{background:${categoryBg};color:${categoryText};font-weight:700;border-top:${borderWidth}px solid ${borderColor};border-bottom:${borderWidth}px solid ${borderColor}}
    .doc-table tbody tr:first-child.group-row td{border-top:none}
    .doc-table tbody tr:last-child td{border-bottom:none}
    .doc-table{break-inside:auto;page-break-inside:auto}
    .doc-table thead{display:table-row-group}
    .doc-table tbody{display:table-row-group}
    .doc-table tfoot{display:table-row-group}
    .doc-table tr{break-inside:avoid;page-break-inside:avoid}
    .doc-table td,.doc-table th{break-inside:avoid;page-break-inside:avoid}
    .doc-table .group-row{break-after:auto;page-break-after:auto}
    .doc-table .group-row + tr{break-before:auto;page-break-before:auto}
    .doc-table .align-left{text-align:left}
    .doc-table .align-right{text-align:right}
    .doc-table .align-center{text-align:center}
    .doc-table .doc-checkbox-box{display:inline-block;width:11pt;height:11pt;border:1.3px solid #64748b;border-radius:2px;box-sizing:border-box;vertical-align:middle}
    .doc-table .pack-row td{font-size:${Math.max(10, tableFontSize - 1)}px;color:#475569}
    .doc-table .pack-cell{padding-left:${Math.max(8, cellPaddingX)}px}
    ${equipmentColumnIndex >= 0 ? `.doc-table td:nth-child(${equipmentColumnIndex + 1}),.doc-table th:nth-child(${equipmentColumnIndex + 1}){white-space:normal;}` : ''}
  `;

  const tableHtml = `
    <style>${tableCss}</style>
    <div class="doc-table-wrap template-table-wrap">
      <table class="doc-table template-table">
        <colgroup>${colgroupHtml}</colgroup>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyRows.join('')}</tbody>
      </table>
    </div>
  `;

  return tableHtml;
};

const normalizeGridBorders = (value) => {
  const defaults = {
    top: { color: '#94a3b8', width: 0 },
    right: { color: '#94a3b8', width: 0 },
    bottom: { color: '#94a3b8', width: 0 },
    left: { color: '#94a3b8', width: 0 },
  };
  if (!value || typeof value !== 'object') return defaults;
  const raw = value;
  const readSide = (side) => {
    const sideRaw = raw[side];
    const color = typeof sideRaw?.color === 'string' ? sideRaw.color : defaults[side].color;
    const width = clampValue(toNumber(sideRaw?.width, defaults[side].width), 0, 12);
    return { color, width };
  };
  const normalized = {
    top: readSide('top'),
    right: readSide('right'),
    bottom: readSide('bottom'),
    left: readSide('left'),
  };
  const normalizeColor = (color) => String(color || '').trim().toLowerCase();
  const legacyColors = new Set(['#64748b', '#94a3b8']);
  const sides = ['top', 'right', 'bottom', 'left'];
  const looksLikeLegacyFullFrame = sides.every((side) => normalized[side].width === 1)
    && sides.every((side) => legacyColors.has(normalizeColor(normalized[side].color)));
  if (looksLikeLegacyFullFrame) {
    normalized.right.width = 0;
    normalized.bottom.width = 0;
  }
  const looksLikeLegacyRightBottomOnly = normalized.top.width === 0
    && normalized.left.width === 0
    && normalized.right.width === 1
    && normalized.bottom.width === 1
    && legacyColors.has(normalizeColor(normalized.right.color))
    && legacyColors.has(normalizeColor(normalized.bottom.color));
  if (looksLikeLegacyRightBottomOnly) {
    normalized.right.width = 0;
    normalized.bottom.width = 0;
  }
  return normalized;
};

const isLegacyZoneBorderStyle = (params) => {
  if (params.transparent) return false;
  if (params.style !== 'solid') return false;
  if (params.width <= 0) return false;
  if (params.width > 1) return false;
  return Math.round(params.opacity) >= 80;
};

const normalizeGridCellList = (cells, rows, columns) => {
  const safeRows = Math.max(1, rows);
  const safeColumns = Math.max(1, columns);
  const safeCells = Array.isArray(cells) ? cells : [];
  const total = safeRows * safeColumns;
  return Array.from({ length: total }, (_, idx) => {
    const cell = safeCells[idx];
    return Array.isArray(cell) ? cell : [];
  });
};

const blockTreeContainsType = (blocks, targetType) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === targetType) return true;
    if (block.type === 'zone') {
      if (blockTreeContainsType(Array.isArray(block.zoneChildren) ? block.zoneChildren : [], targetType)) return true;
      continue;
    }
    if (block.type === 'grid') {
      const rows = Math.max(1, toNumber(block.gridRows, 1));
      const columns = Math.max(1, toNumber(block.gridColumns, 1));
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      for (const cellBlocks of cells) {
        if (blockTreeContainsType(cellBlocks, targetType)) return true;
      }
    }
  }
  return false;
};

const buildStudioTableColumns = (columns) => {
  const map = {
    quantity: 'qty',
    designation: 'equipment',
    discount: 'rem',
    unit_price: 'pricePerDay',
    total: 'total',
    days: 'days',
    coefficient: 'coefficient',
    checkbox: 'checkbox',
  };
  if (!Array.isArray(columns) || columns.length === 0) {
    return 'qty,equipment,rem,pricePerDay,total';
  }
  const tokens = columns.map((col) => {
    const key = typeof col === 'string' ? col.trim() : '';
    return map[key] || key;
  }).filter(Boolean);
  return tokens.length ? tokens.join(',') : 'qty,equipment,rem,pricePerDay,total';
};

const getBlockContentHtml = (block) => {
  const rawHtml = typeof block.contentHtml === 'string' && block.contentHtml.trim().length > 0
    ? block.contentHtml
    : escapeHtml(block.text || '');
  if (rawHtml.includes('<')) return rawHtml;
  return rawHtml.replace(/\n/g, '<br/>');
};

const renderStudioBlock = (block, context, scope = 'root') => {
  if (!block || typeof block !== 'object') return '';
  const type = typeof block.type === 'string' ? block.type : 'title';
  const canFloat = scope === 'root';
  const isFloating = canFloat && block.layoutMode === 'floating';
  const isSemiFixed = canFloat && type === 'zone' && block.layoutMode === 'semi-fixed';
  const marginTop = clampValue(toNumber(block.marginTop, 0), 0, 80);
  const marginBottom = clampValue(toNumber(block.marginBottom, 0), 0, 80);
  const marginLeft = clampValue(toNumber(block.marginLeft, 0), 0, 80);
  const marginRight = clampValue(toNumber(block.marginRight, 0), 0, 80);

  const defaultFloatWidth = type === 'zone'
    ? 160
    : type === 'qrcode'
      ? 35
      : type === 'image'
        ? 120
        : type === 'table'
          ? 180
          : 120;
  const defaultFloatHeight = type === 'zone'
    ? 80
    : type === 'qrcode'
      ? 35
      : type === 'image'
        ? 80
        : type === 'table'
          ? 60
          : 20;
  const contentWidth = context.contentWidthMm;
  const contentHeight = context.contentHeightMm;
  const floatWidth = clampValue(toNumber(block.floatWidth, defaultFloatWidth), 10, contentWidth);
  const floatHeight = clampValue(toNumber(block.floatHeight, defaultFloatHeight), 8, contentHeight);
  const floatX = clampValue(toNumber(block.floatX, 10), 0, Math.max(0, contentWidth - floatWidth));
  const floatY = clampValue(toNumber(block.floatY, 10), 0, Math.max(0, contentHeight - floatHeight));

  const wrapperStyle = isFloating
    ? `position:absolute;left:${floatX}mm;top:${floatY}mm;width:${floatWidth}mm;height:${floatHeight}mm;`
    : `position:relative;box-sizing:border-box;margin:${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;`;

  const textStyle = [
    `font-size:${clampValue(toNumber(block.fontSize, 12), 6, 96)}pt`,
    `font-family:${block.fontFamily || 'Helvetica'}`,
    `font-weight:${block.bold ? 700 : 400}`,
    `font-style:${block.italic ? 'italic' : 'normal'}`,
    `text-decoration:${block.underline ? 'underline' : 'none'}`,
    `text-align:${block.textAlign || 'left'}`,
    `line-height:1.2`,
    `color:${typeof block.textColor === 'string' ? block.textColor : '#111827'}`,
  ].join(';');

  const wrap = (innerHtml, extraStyle = '', wrapperOverride = '') => (
    `<div class="studio-block studio-${type}" style="${wrapperOverride || wrapperStyle}${extraStyle}">${innerHtml}</div>`
  );

  if (type === 'separator') {
    const thickness = clampValue(toNumber(block.separatorThickness, 1), 0, 20);
    const widthPercent = clampValue(toNumber(block.separatorWidthPercent, 100), 0, 100);
    const align = block.separatorAlign === 'center' || block.separatorAlign === 'right' ? block.separatorAlign : 'left';
    const color = typeof block.separatorColor === 'string' ? block.separatorColor : '#111827';
    const secondary = typeof block.separatorSecondaryColor === 'string' ? block.separatorSecondaryColor : color;
    const opacity = clampValue(toNumber(block.separatorOpacity, 100), 0, 100) / 100;
    const radius = clampValue(toNumber(block.separatorRadius, 0), 0, 999);
    const style = typeof block.separatorStyle === 'string' ? block.separatorStyle : 'solid';
    const alignment = align === 'center'
      ? 'margin-left:auto;margin-right:auto;'
      : align === 'right'
        ? 'margin-left:auto;'
        : '';
    let lineStyle = '';
    if (style === 'gradient') {
      lineStyle = `height:${thickness}px;background:linear-gradient(90deg,${color},${secondary});`;
    } else if (style === 'glow') {
      const glowSize = Math.max(2, thickness * 2);
      lineStyle = `height:${thickness}px;background:${color};box-shadow:0 0 ${glowSize}px ${color};`;
    } else {
      const cssStyle = style === 'double' ? 'double' : style;
      lineStyle = `height:0;border-top:${thickness}px ${cssStyle} ${color};`;
    }
    const line = `<div style="${alignment}width:${widthPercent}%;${lineStyle}opacity:${opacity};border-radius:${radius}px;"></div>`;
    return wrap(line);
  }

  if (type === 'image' || type === 'qrcode') {
    const qrProjectId = String(
      context?.rental?.id
      || context?.templateVariablesExtended?.rental_id
      || context?.templateVariablesExtended?.rental_reference
      || ''
    ).trim();
    const qrValue = qrProjectId
      ? (qrProjectId.toLowerCase().startsWith('project:') ? qrProjectId : `project:${qrProjectId}`)
      : '';
    const url = type === 'qrcode'
      ? buildQrCodeImageUrl(qrValue)
      : (typeof block.imageUrl === 'string' ? block.imageUrl.trim() : '');
    if (!url) return '';
    const align = block.imageAlign === 'center' || block.imageAlign === 'right' ? block.imageAlign : 'left';
    const fit = block.imageFit === 'contain' || block.imageFit === 'fill' || block.imageFit === 'none'
      ? block.imageFit
      : (type === 'qrcode' ? 'contain' : 'cover');
    const widthPercent = clampValue(toNumber(block.imageWidthPercent, 100), 5, 100);
    const heightMm = clampValue(toNumber(block.imageHeightMm, type === 'qrcode' ? 35 : 0), 0, 500);
    const opacity = clampValue(toNumber(block.imageOpacity, 100), 0, 100) / 100;
    const radius = clampValue(toNumber(block.imageBorderRadius, 0), 0, 60);
    const borderWidth = clampValue(toNumber(block.imageBorderWidth, 0), 0, 12);
    const borderColor = typeof block.imageBorderColor === 'string' ? block.imageBorderColor : 'transparent';
    const background = typeof block.imageBackgroundColor === 'string'
      ? block.imageBackgroundColor
      : (type === 'qrcode' ? '#ffffff' : 'transparent');
    const rotation = clampValue(toNumber(block.imageRotation, 0), -180, 180);
    const style = [
      `max-width:${widthPercent}%`,
      heightMm > 0 ? `height:${heightMm}mm` : '',
      `object-fit:${fit}`,
      `opacity:${opacity}`,
      `border-radius:${radius}px`,
      `border:${borderWidth}px solid ${borderColor}`,
      `background:${background}`,
      block.imageShadow ? 'box-shadow:0 8px 22px rgba(15,23,42,0.24)' : '',
      rotation !== 0 ? `transform:rotate(${rotation}deg)` : '',
      'display:inline-block',
    ].filter(Boolean).join(';');
    const alt = type === 'qrcode'
      ? `QR ${qrValue || 'code'}`
      : (block.imageAlt || 'Image');
    const img = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="${style}" />`;
    return wrap(`<div style="text-align:${align};">${img}</div>`);
  }

  if (type === 'grid') {
    const configuredRows = Math.max(1, toNumber(block.gridRows, 1));
    const configuredColumns = Math.max(1, toNumber(block.gridColumns, 1));
    const normalizedCells = normalizeGridCellList(block.gridCells, configuredRows, configuredColumns);
    let rows = configuredRows;
    let columns = configuredColumns;

    const cellHasContent = (rowIndex, colIndex) => {
      const idx = rowIndex * configuredColumns + colIndex;
      const cellBlocks = normalizedCells[idx];
      return Array.isArray(cellBlocks) && cellBlocks.length > 0;
    };

    // Trim trailing empty rows/columns in export to avoid phantom divider lines.
    while (rows > 1) {
      const lastRowIndex = rows - 1;
      let hasContent = false;
      for (let col = 0; col < columns; col += 1) {
        if (cellHasContent(lastRowIndex, col)) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) break;
      rows -= 1;
    }

    while (columns > 1) {
      const lastColIndex = columns - 1;
      let hasContent = false;
      for (let row = 0; row < rows; row += 1) {
        if (cellHasContent(row, lastColIndex)) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) break;
      columns -= 1;
    }

    const cells = Array.from({ length: rows * columns }, (_, idx) => {
      const rowIndex = Math.floor(idx / columns);
      const colIndex = idx % columns;
      const sourceIndex = rowIndex * configuredColumns + colIndex;
      return Array.isArray(normalizedCells[sourceIndex]) ? normalizedCells[sourceIndex] : [];
    });
    const borderStyles = normalizeGridBorders(block.gridBorders);
    const gridBorderTransparent = !!block.gridBorderTransparent;
    const gridDividerStyle = block.gridDividerStyle === 'dashed' || block.gridDividerStyle === 'dotted'
      ? block.gridDividerStyle
      : 'solid';
    const gridCellPaddingXmm = clampValue(toNumber(block.gridCellPaddingXMm, 2), 0, 40);
    const gridCellPaddingYmm = clampValue(toNumber(block.gridCellPaddingYMm, 2), 0, 40);
    const gridCellMinHeightMm = clampValue(toNumber(block.gridCellMinHeightMm, 12), 2, 120);
    const gridBackgroundColor = typeof block.gridBackgroundColor === 'string' ? block.gridBackgroundColor : 'transparent';
    const gridCellBackgroundColor = typeof block.gridCellBackgroundColor === 'string' ? block.gridCellBackgroundColor : 'transparent';
    const gridBorderOpacity = clampValue(
      toNumber(block.gridBorderOpacity, gridBorderTransparent ? 0 : 100),
      0,
      100
    );
    const gridBackgroundOpacity = clampValue(
      toNumber(block.gridBackgroundOpacity, toNumber(block.gridOpacity, 100)),
      0,
      100
    );
    const gridCellBackgroundOpacity = clampValue(
      toNumber(block.gridCellBackgroundOpacity, toNumber(block.gridOpacity, 100)),
      0,
      100
    );
    const gridBorderRadius = clampValue(toNumber(block.gridBorderRadius, 0), 0, 999);
    const dividerWidth = clampValue(toNumber(block.gridDividerWidth, 1), 0, 12);
    const dividerColorRaw = typeof block.gridDividerColor === 'string' ? block.gridDividerColor : '#94a3b8';
    const dividerColor = applyOpacityToColor(dividerColorRaw, gridBorderOpacity);
    const borderTopColor = applyOpacityToColor(borderStyles.top.color, gridBorderOpacity);
    const borderRightColor = applyOpacityToColor(borderStyles.right.color, gridBorderOpacity);
    const borderBottomColor = applyOpacityToColor(borderStyles.bottom.color, gridBorderOpacity);
    const borderLeftColor = applyOpacityToColor(borderStyles.left.color, gridBorderOpacity);
    const useGapDividers = dividerWidth > 0;

    const cellHtml = cells.map((cellBlocks, index) => {
      const isLastColumn = (index + 1) % columns === 0;
      const isLastRow = Math.floor(index / columns) === rows - 1;
      const borderRight = isLastColumn ? '0px solid transparent' : `${dividerWidth}px solid ${dividerColor}`;
      const borderBottom = isLastRow ? '0px solid transparent' : `${dividerWidth}px solid ${dividerColor}`;
      const childHtml = cellBlocks.map((child) => renderStudioBlock(child, context, 'nested')).join('');
      const legacyBorders = `border-right:${borderRight};border-bottom:${borderBottom};border-right-style:${gridDividerStyle};border-bottom-style:${gridDividerStyle};`;
      const noBorders = 'border:none;';
      return `<div style="${useGapDividers ? noBorders : legacyBorders}padding:${gridCellPaddingYmm}mm ${gridCellPaddingXmm}mm;min-height:${gridCellMinHeightMm}mm;background:${applyOpacityToColor(gridCellBackgroundColor, gridCellBackgroundOpacity)};">${childHtml}</div>`;
    }).join('');

    const outerStyle = [
      `border-top:0px solid transparent`,
      `border-right:0px solid transparent`,
      `border-bottom:0px solid transparent`,
      `border-left:0px solid transparent`,
      `border-radius:${gridBorderRadius}px`,
      `background:${applyOpacityToColor(gridBackgroundColor, gridBackgroundOpacity)}`,
      `overflow:hidden`,
      `width:100%`,
    ].join(';');

    const gridStyle = [
      `display:grid`,
      `grid-template-columns:repeat(${columns}, minmax(0, 1fr))`,
      `column-gap:${useGapDividers ? `${dividerWidth}px` : '0px'}`,
      `row-gap:${useGapDividers ? `${dividerWidth}px` : '0px'}`,
      `border-radius:${gridBorderRadius}px`,
      `background:${useGapDividers ? dividerColor : 'transparent'}`,
      `width:100%`,
    ].join(';');
    return wrap(`<div style="${outerStyle}"><div style="${gridStyle}">${cellHtml}</div></div>`);
  }

  if (type === 'zone') {
    const zonePaddingMm = clampValue(toNumber(block.zonePaddingMm, 3), 0, 30);
    const zonePaddingXmm = clampValue(toNumber(block.zonePaddingXMm, zonePaddingMm), 0, 30);
    const zonePaddingYmm = clampValue(toNumber(block.zonePaddingYMm, zonePaddingMm), 0, 30);
    const zoneMinHeightMm = clampValue(toNumber(block.zoneMinHeightMm, 45), 10, 260);
    const zoneBackgroundOpacity = clampValue(toNumber(block.zoneBackgroundOpacity, toNumber(block.zoneOpacity, 100)), 0, 100);
    const zoneBackgroundColor = typeof block.zoneBackgroundColor === 'string' ? block.zoneBackgroundColor : '#ffffff';
    const zoneBorderColor = typeof block.zoneBorderColor === 'string' ? block.zoneBorderColor : '#94a3b8';
    const rawZoneBorderWidth = clampValue(toNumber(block.zoneBorderWidth, 0), 0, 12);
    const zoneBorderRadius = clampValue(toNumber(block.zoneBorderRadius, 6), 0, 999);
    const zoneBorderTransparent = !!block.zoneBorderTransparent;
    const zoneBorderOpacity = clampValue(toNumber(block.zoneBorderOpacity, zoneBorderTransparent ? 0 : 100), 0, 100);
    const zoneBorderStyle = block.zoneBorderStyle === 'dashed' || block.zoneBorderStyle === 'dotted'
      ? block.zoneBorderStyle
      : 'solid';
    const zoneChildren = Array.isArray(block.zoneChildren) ? block.zoneChildren : [];
    const hasGridChild = blockTreeContainsType(zoneChildren, 'grid');
    const zoneBorderWidth = isLegacyZoneBorderStyle({
      width: rawZoneBorderWidth,
      color: zoneBorderColor,
      opacity: zoneBorderOpacity,
      style: zoneBorderStyle,
      transparent: zoneBorderTransparent,
    })
      ? 0
      : (hasGridChild ? 0 : rawZoneBorderWidth);
    const zoneMaxWidthMm = Math.max(10, contentWidth - marginLeft - marginRight);
    const zoneSemiWidthMm = clampValue(toNumber(block.floatWidth, 160), 10, zoneMaxWidthMm);
    const zoneSemiHeightMm = clampValue(toNumber(block.floatHeight, 80), 8, contentHeight);
    const zoneSemiOffsetXmm = clampValue(toNumber(block.floatX, 0), 0, Math.max(0, zoneMaxWidthMm - zoneSemiWidthMm));
    const zoneSemiWrapperStyle = isSemiFixed
      ? `position:relative;display:inline-block;vertical-align:top;box-sizing:border-box;margin:${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft + zoneSemiOffsetXmm}mm;width:${zoneSemiWidthMm}mm;height:${zoneSemiHeightMm}mm;`
      : '';
    const innerStyle = [
      `width:100%`,
      isFloating || isSemiFixed ? 'height:100%' : '',
      !isFloating && !isSemiFixed ? `min-height:${zoneMinHeightMm}mm` : '',
      `border:${zoneBorderWidth}px ${zoneBorderStyle} ${applyOpacityToColor(zoneBorderColor, zoneBorderOpacity)}`,
      `border-radius:${zoneBorderRadius}px`,
      `background:${applyOpacityToColor(zoneBackgroundColor, zoneBackgroundOpacity)}`,
      `padding:${zonePaddingYmm}mm ${zonePaddingXmm}mm`,
      block.zoneShadow ? 'box-shadow:0 8px 22px rgba(15,23,42,0.24)' : 'none',
    ].filter(Boolean).join(';');
    const childrenHtml = zoneChildren.map((child) => renderStudioBlock(child, context, 'nested')).join('');
    return wrap(
      `<div style="${innerStyle}">${childrenHtml}</div>`,
      !isFloating && !isSemiFixed ? `min-height:${zoneMinHeightMm}mm;` : '',
      zoneSemiWrapperStyle
    );
  }

  if (type === 'table') {
    const columnsToken = buildStudioTableColumns(block.tableColumns);
    const tableHtml = buildTableHtml({
      docType: context.docType,
      columnsToken,
      rental: context.rental,
      equipmentGroups: context.equipmentGroups,
      packItemsByEquipmentId: context.packItemsByEquipmentId,
      days: context.days,
      effectiveEquipmentCoefficient: context.effectiveEquipmentCoefficient,
      maintenanceCharges: context.maintenanceCharges,
      insuranceServiceRows: context.insuranceServiceRows,
      personnelServiceRows: context.personnelServiceRows,
      otherServiceRows: context.otherServiceRows,
      deliveryLine: context.deliveryLine,
      design: context.design,
      accentColor: context.accentColor,
      tableOptions: {
        showCategories: block.tableShowCategories !== false,
        renderMode: 'studio',
        style: {
          headerBackground: block.tableHeaderBackground,
          headerTextColor: block.tableHeaderTextColor,
          bodyBackground: block.tableBodyBackground,
          categoryBackground: block.tableCategoryBackground,
          categoryTextColor: block.tableCategoryTextColor,
          borderColor: block.tableBorderColor,
          borderWidth: block.tableBorderWidth,
          borderRadius: block.tableBorderRadius,
          cellPaddingX: block.tableCellPaddingX,
          cellPaddingY: block.tableCellPaddingY,
          rowGapPx: block.tableRowGapPx,
          fontSize: Number.isFinite(block.tableFontSizePt) ? block.tableFontSizePt * 1.333 : undefined,
          headerFontSize: Number.isFinite(block.tableHeaderFontSizePt) ? block.tableHeaderFontSizePt * 1.333 : undefined,
          headerBold: typeof block.tableHeaderBold === 'boolean' ? block.tableHeaderBold : undefined,
          headerTextAlign: block.tableHeaderTextAlign,
          categoryTextAlign: block.tableCategoryTextAlign,
          bodyTextAlign: block.tableBodyTextAlign,
          headerColumnTextAlign: block.tableHeaderColumnAlign,
          bodyColumnTextAlign: block.tableBodyColumnAlign,
        },
      },
    });
    return wrap(tableHtml);
  }

  const contentHtml = applyTemplateVariables(getBlockContentHtml(block), context.templateVariablesExtended);
  const textWrapper = `<div style="${textStyle}">${contentHtml}</div>`;
  return wrap(textWrapper);
};

const buildStudioHtml = (snapshot, context) => {
  if (!snapshot) return null;
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const margins = snapshot.margins;
  const headerFooter = snapshot.headerFooter && typeof snapshot.headerFooter === 'object'
    ? snapshot.headerFooter
    : null;
  const hasHeaderFooter = Boolean(
    headerFooter
    && headerFooter.enabled !== false
    && (
      String(headerFooter.header?.left || '').trim().length > 0
      || String(headerFooter.header?.center || '').trim().length > 0
      || String(headerFooter.header?.right || '').trim().length > 0
      || String(headerFooter.footer?.left || '').trim().length > 0
      || String(headerFooter.footer?.center || '').trim().length > 0
      || String(headerFooter.footer?.right || '').trim().length > 0
    )
  );
  if (blocks.length === 0 && !hasHeaderFooter) return null;
  const contentWidthMm = Math.max(10, A4_WIDTH_MM - margins.left - margins.right);
  const contentHeightMm = Math.max(10, A4_HEIGHT_MM - margins.top - margins.bottom);
  const renderContext = {
    ...context,
    contentWidthMm,
    contentHeightMm,
  };
  const semiFixedZones = blocks.filter((candidate) => candidate && candidate.type === 'zone' && candidate.layoutMode === 'semi-fixed');
  let semiFixedRendered = false;
  let blocksHtml = '';
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    const isSemiFixedZone = block && block.type === 'zone' && block.layoutMode === 'semi-fixed';
    if (!isSemiFixedZone) {
      blocksHtml += renderStudioBlock(block, renderContext);
      index += 1;
      continue;
    }

    if (!semiFixedRendered && semiFixedZones.length > 0) {
      const rowHtml = semiFixedZones.map((candidate) => renderStudioBlock(candidate, renderContext)).join('');
      blocksHtml += `<div style="display:flex;flex-wrap:wrap;align-items:flex-start;width:100%;">${rowHtml}</div>`;
      semiFixedRendered = true;
    }
    index += 1;
  }
  let pdfHeaderFooter = null;
  if (hasHeaderFooter) {
    const fontSizePt = Number.isFinite(Number(headerFooter.fontSizePt)) ? Number(headerFooter.fontSizePt) : 9;
    const lineHeightMm = fontSizePt * 0.352778 * 1.25;
    const headerLines = countPageBandLines(headerFooter.header);
    const footerLines = countPageBandLines(headerFooter.footer);
    const marginTopMm = Math.round(clampValue((Number(headerFooter.topOffsetMm) || 0) + (headerLines * lineHeightMm) + 2, 0, 80) * 100) / 100;
    const marginBottomMm = Math.round(clampValue((Number(headerFooter.bottomOffsetMm) || 0) + (footerLines * lineHeightMm) + 2, 0, 80) * 100) / 100;
    pdfHeaderFooter = {
      marginTopMm,
      marginBottomMm,
      headerTemplate: buildPdfPageBandTemplate({
        slot: headerFooter.header,
        variables: context.templateVariablesExtended || {},
        textColor: headerFooter.textColor || '#334155',
        fontSizePt,
        sidePaddingMm: headerFooter.sidePaddingMm,
        pageMargins: margins,
        offsetMm: headerFooter.topOffsetMm,
        placement: 'top',
      }),
      footerTemplate: buildPdfPageBandTemplate({
        slot: headerFooter.footer,
        variables: context.templateVariablesExtended || {},
        textColor: headerFooter.textColor || '#334155',
        fontSizePt,
        sidePaddingMm: headerFooter.sidePaddingMm,
        pageMargins: margins,
        offsetMm: headerFooter.bottomOffsetMm,
        placement: 'bottom',
      }),
    };
  }
  const html = `<div class="studio-content" style="position:relative;width:${contentWidthMm}mm;min-height:${contentHeightMm}mm;">${blocksHtml}</div>`;
  const css = `
    .studio-content{position:relative}
    .studio-block,.studio-block *,.studio-block *::before,.studio-block *::after{box-sizing:border-box}
    .studio-block{box-sizing:border-box}
    .studio-block p,
    .studio-block h1,
    .studio-block h2,
    .studio-block h3,
    .studio-block h4,
    .studio-block h5,
    .studio-block h6,
    .studio-block blockquote,
    .studio-block figure,
    .studio-block pre{margin:0;line-height:inherit}
    .studio-block h1,
    .studio-block h2,
    .studio-block h3,
    .studio-block h4,
    .studio-block h5,
    .studio-block h6{font-size:inherit;font-weight:inherit}
    .studio-block ul,
    .studio-block ol,
    .studio-block menu{margin:0;padding:0;list-style:none}
    .studio-block li{margin:0;line-height:inherit}
    .studio-block a{color:inherit;text-decoration:inherit}
  `;
  return {
    html,
    css,
    contentWidthMm,
    contentHeightMm,
    margins: snapshot.margins,
    background: snapshot.background,
    pdfHeaderFooter,
  };
};

export const buildRentalDocumentHtml = ({
  rental,
  docType,
  documentDesign,
  editorHtml = '',
  payments = [],
  company,
  client,
  deliveryDate,
  packItemsByEquipmentId = {},
  equipmentCoefficient,
  customCss = '',
  baseUrl = '',
  studioTemplate = null,
}) => {
  const normalizedType = normalizeRentalDocumentType(docType);
  if (!normalizedType) {
    throw new Error('Type de document invalide');
  }

  const design = normalizeDocumentDesign(documentDesign);
  const reference = rental?.reference_code || (rental?.id ? rental.id.slice(0, 6).toUpperCase() : '');
  const periodLabel = `${formatDate(rental?.start_date)} → ${formatDate(rental?.end_date)}`.trim();
  const clientName = client?.name || rental?.client_name || '';
  const clientCompany = client?.company?.trim() || '';
  const representsCompany = Boolean(clientCompany) && (rental?.client_represents_company ?? true);
  const clientProfileLabel = representsCompany ? 'Entreprise' : 'Particulier';
  const billingAddress = client?.address?.trim() || '';
  const contactEmail = client?.email?.trim() || '';
  const contactPhone = client?.phone?.trim() || '';
  const contactLine = [contactEmail, contactPhone].filter(Boolean).join(' • ');
  const rawDays = Math.ceil((new Date(rental?.end_date).getTime() - new Date(rental?.start_date).getTime()) / (1000 * 60 * 60 * 24));
  const days = Number.isFinite(rawDays) ? Math.max(1, rawDays) : 1;
  const templateVariables = {
    rental_id: rental?.id || '',
    client_name: clientName || 'Client',
    client_company: clientCompany,
    client_profile: clientProfileLabel.toLowerCase(),
    client_email: contactEmail,
    client_phone: contactPhone,
    client_contact: contactLine,
    client_address: billingAddress,
    reference,
    title: rental?.title || '',
    type: rental?.type || '',
    period: periodLabel,
    start_date: formatDateStudio(rental?.start_date),
    end_date: formatDateStudio(rental?.end_date),
    days: String(days),
    location: rental?.location || '',
    delivery_date: formatDateStudio(deliveryDate),
    total: formatCurrencyStudio(rental?.total_price || 0),
    company_name: company?.name || '',
    company_legal: company?.legalName || '',
    company_address: company?.address || '',
    company_email: company?.email || '',
    company_phone: company?.phone || '',
    company_contact: [company?.email, company?.phone].filter(Boolean).join(' • '),
    company_siren: company?.siren || '',
    company_siret: company?.siret || '',
    company_vat: company?.vat || '',
  };

  const completedPayments = payments.filter((payment) => (payment.status || 'completed') === 'completed');
  const depositTotal = completedPayments
    .filter((payment) => (payment.payment_type || 'payment') === 'deposit')
    .reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? payment.amount : 0), 0);
  const otherPaymentsTotal = completedPayments
    .filter((payment) => (payment.payment_type || 'payment') !== 'deposit')
    .reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? payment.amount : 0), 0);

  const normalizedOverride = Number.isFinite(Number(rental?.rental_coefficient_override))
    ? Number(rental?.rental_coefficient_override)
    : null;
  const effectiveEquipmentCoefficient = Number.isFinite(Number(equipmentCoefficient)) && Number(equipmentCoefficient) > 0
    ? Number(equipmentCoefficient)
    : (normalizedOverride && normalizedOverride > 0 ? normalizedOverride : days);

  const includeMaintenance = normalizedType !== 'bon_prepa';
  const includeDelivery = normalizedType !== 'bon_prepa';
  const includePersonnelServices = normalizedType !== 'bon_prepa';
  const includeInsuranceServices = normalizedType !== 'bon_prepa';
  const includeOtherServices = normalizedType !== 'bon_prepa';
  const maintenanceCharges = includeMaintenance ? (rental?.maintenance_charges || []) : [];
  const personnelServices = includePersonnelServices ? (rental?.personnel_services || []) : [];
  const insuranceServices = includeInsuranceServices ? (rental?.insurance_services || []) : [];
  const otherServices = includeOtherServices ? (rental?.other_services || []) : [];
  const maintenanceTotal = maintenanceCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
  const deliveryTotal = includeDelivery ? Number(rental?.delivery_total_amount || 0) : 0;
  const serviceInsurance = insuranceServices.reduce((sum, service) => {
    const unit = Number(service.amount_per_day || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const daysCount = Number(service.days || 0);
    return sum + safeUnit * daysCount;
  }, 0);
  const serviceTransport = deliveryTotal;
  const servicePersonnel = personnelServices.reduce((sum, service) => {
    const unit = Number(service.cost_per_person || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const qty = Number(service.quantity || 0);
    const daysCount = Number(service.days || 0);
    const discount = clampPercent(service.discount_percent);
    return sum + safeUnit * qty * daysCount * (1 - discount / 100);
  }, 0);
  const serviceOther = otherServices.reduce((sum, service) => {
    const unit = Number(service.price || 0);
    const safeUnit = Number.isFinite(unit) ? unit : 0;
    const qty = Number(service.quantity || 0);
    const daysCount = Number(service.days || 0);
    return sum + safeUnit * qty * daysCount;
  }, 0);
  const servicesTotal = maintenanceTotal + serviceInsurance + serviceTransport + servicePersonnel + serviceOther;

  const orderedGroups = (rental?.item_groups || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const allItemsSorted = (rental?.items || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const hasExplicitGroups = orderedGroups.length > 0 && allItemsSorted.some((it) => it.group_id);
  const ungroupedItems = hasExplicitGroups ? allItemsSorted.filter((item) => !item.group_id) : [];
  const equipmentGroups = hasExplicitGroups
    ? [
      // Ungrouped items first (no section header) to avoid visual confusion with named groups
      ...(ungroupedItems.length > 0 ? [{ id: 'ungrouped', name: '', items: ungroupedItems }] : []),
      ...orderedGroups
        .map((group) => ({
          id: group.id,
          name: group.name,
          items: allItemsSorted.filter((item) => item.group_id === group.id),
        }))
        .filter((group) => group.items.length > 0),
    ]
    : [{ id: 'all', name: '', items: allItemsSorted }];

  const equipmentTotal = allItemsSorted.reduce((sum, it) => {
    const base = it.price_per_day * it.quantity * effectiveEquipmentCoefficient;
    const discount = Number.isFinite(it.discount_percent)
      ? Math.min(100, Math.max(0, Number(it.discount_percent)))
      : 0;
    return sum + base * (1 - discount / 100);
  }, 0);
  const base = equipmentTotal + servicesTotal;
  const discount = rental?.discount_type === 'percentage'
    ? (base * (rental?.discount_value || 0) / 100)
    : (rental?.discount_value || 0);
  const totalNet = Math.max(0, base - discount);
  const totalTTC = totalNet;
  const totalPaid = depositTotal + otherPaymentsTotal;
  const remainingDue = Math.max(0, totalTTC - totalPaid);

  const deliveryQuantity = Number(rental?.delivery_quantity || 0);
  const deliveryUnitPrice = deliveryQuantity > 0 ? deliveryTotal / deliveryQuantity : deliveryTotal;
  const deliveryLineLabel = (rental?.delivery_offer_name || 'Forfait livraison').trim() || 'Forfait livraison';
  const deliveryTripLabel = rental?.delivery_round_trip == null
    ? ''
    : rental?.delivery_round_trip
      ? 'Aller + retour'
      : 'Aller simple';
  const deliveryDesignation = [deliveryLineLabel, deliveryTripLabel ? `(${deliveryTripLabel})` : '']
    .filter(Boolean)
    .join(' ');

  const deliveryLine = includeDelivery && deliveryTotal > 0
    ? {
      quantity: deliveryQuantity > 0 ? deliveryQuantity : 1,
      unitPrice: deliveryUnitPrice,
      total: deliveryTotal,
      designation: deliveryDesignation,
    }
    : null;

  const personnelServiceRows = personnelServices
    .filter((service) => (Number(service.quantity || 0) > 0) && (Number(service.days || 0) > 0))
    .map((service) => {
      const unit = Number(service.cost_per_person || 0);
      const safeUnit = Number.isFinite(unit) ? unit : 0;
      const qty = Number(service.quantity || 0);
      const daysCount = Number(service.days || 0);
      const discount = clampPercent(service.discount_percent);
      const total = safeUnit * qty * daysCount * (1 - discount / 100);
      return {
        id: service.id,
        title: service.title || 'Service',
        quantity: qty,
        days: daysCount,
        unitPrice: safeUnit,
        discountPercent: discount,
        total,
      };
    });
  const insuranceServiceRows = insuranceServices
    .filter((service) => Number(service.days || 0) > 0)
    .map((service) => {
      const unit = Number(service.amount_per_day || 0);
      const safeUnit = Number.isFinite(unit) ? unit : 0;
      const daysCount = Number(service.days || 0);
      const total = safeUnit * daysCount;
      return {
        id: service.id,
        title: service.title || 'Assurance',
        days: daysCount,
        unitPrice: safeUnit,
        total,
      };
    });
  const otherServiceRows = otherServices
    .filter((service) => (Number(service.quantity || 0) > 0) && (Number(service.days || 0) > 0))
    .map((service) => {
      const unit = Number(service.price || 0);
      const safeUnit = Number.isFinite(unit) ? unit : 0;
      const qty = Number(service.quantity || 0);
      const daysCount = Number(service.days || 0);
      const total = safeUnit * qty * daysCount;
      return {
        id: service.id,
        title: service.title || 'Service',
        quantity: qty,
        days: daysCount,
        unitPrice: safeUnit,
        discountPercent: 0,
        total,
      };
    });

  const eventAddress = rental?.delivery_address?.trim() || rental?.location?.trim() || '';
  const eventAddressParts = eventAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const billingAddressParts = billingAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const billingCountry = billingAddressParts.length > 0 ? billingAddressParts[billingAddressParts.length - 1] : '';
  const quoteExpirationDate = rental?.quote_expired_at ? formatDateOnlyStudio(rental?.quote_expired_at) : '';
  const nowDate = formatDateOnlyStudio(new Date().toISOString());
  const coefficientLabel = Number.isFinite(effectiveEquipmentCoefficient) ? effectiveEquipmentCoefficient.toFixed(2) : String(effectiveEquipmentCoefficient);
  const totalVat = 0;

  const templateVariablesExtended = {
    ...templateVariables,
    rental_reference: reference,
    rental_title: rental?.title || '',
    rental_type: rental?.type || '',
    rental_status: rental?.status || '',
    quote_expiration_date: quoteExpirationDate,
    document_date: nowDate,
    document_page: '1',
    document_pages: '1',
    event_start: formatDateStudio(rental?.start_date),
    event_end: formatDateStudio(rental?.end_date),
    return_delivery_date: formatDateStudio(rental?.return_delivery_at),
    return_date: formatDateStudio(rental?.returned_at || rental?.return_info?.completed_at || null),
    rental_days_count: String(days),
    rental_coefficient: coefficientLabel,
    delivery_window: '',
    client_profile_type: clientProfileLabel.toLowerCase(),
    client_contact_name: clientName || '',
    client_contact_email: contactEmail,
    client_contact_phone: contactPhone,
    event_location: rental?.location || '',
    event_address_line1: eventAddressParts[0] || eventAddress,
    event_postcode: '',
    event_city: eventAddressParts.length > 1 ? eventAddressParts[eventAddressParts.length - 1] : '',
    billing_address_line1: billingAddressParts[0] || billingAddress,
    billing_postcode: '',
    billing_city: billingAddressParts.length > 1 ? billingAddressParts[billingAddressParts.length - 1] : '',
    billing_country: billingCountry,
    total_assurance: formatCurrencyStudio(serviceInsurance),
    total_assurance_ht: formatCurrencyStudio(serviceInsurance),
    total_transport: formatCurrencyStudio(serviceTransport),
    total_transport_ht: formatCurrencyStudio(serviceTransport),
    total_personnel: formatCurrencyStudio(servicePersonnel),
    total_personnel_ht: formatCurrencyStudio(servicePersonnel),
    total_autre: formatCurrencyStudio(serviceOther),
    total_autre_ht: formatCurrencyStudio(serviceOther),
    total_services: formatCurrencyStudio(servicesTotal),
    total_services_ht: formatCurrencyStudio(servicesTotal),
    total_location: formatCurrencyStudio(equipmentTotal),
    total_location_ht: formatCurrencyStudio(equipmentTotal),
    sous_total: formatCurrencyStudio(totalNet),
    subtotal_ht: formatCurrencyStudio(totalNet),
    total_prestation: formatCurrencyStudio(totalTTC),
    total_presta: formatCurrencyStudio(totalTTC),
    subtotal_equipment_ht: formatCurrencyStudio(equipmentTotal),
    subtotal_services_ht: formatCurrencyStudio(servicesTotal),
    discount_percent: rental?.discount_type === 'percentage'
      ? `${Number(rental?.discount_value || 0).toFixed(2)}`
      : '0',
    discount_amount: formatCurrencyStudio(discount),
    total_ht: formatCurrencyStudio(totalNet),
    total_vat: formatCurrencyStudio(totalVat),
    total_ttc: formatCurrencyStudio(totalTTC),
    deposit_amount: formatCurrencyStudio(depositTotal),
    balance_due: formatCurrencyStudio(remainingDue),
    company_rib_iban: company?.rib_iban || company?.iban || '',
    company_rib_bic: company?.rib_bic || company?.bic || '',
  };

  const studioSnapshot = normalizeStudioSnapshot(studioTemplate);

  let renderedHtml = applyTemplateVariables(editorHtml, templateVariablesExtended);

  const accentMatch = renderedHtml.match(/\[\[ACCENT:([^\]]+)]]/i);
  const accentColor = accentMatch ? accentMatch[1] : (design.headerBackground || '#2563eb');
  renderedHtml = renderedHtml.replace(/\[\[ACCENT:[^\]]+]]/gi, '');

  renderedHtml = renderedHtml.replace(/\[\[TABLE:([^\]]+)]]/gi, (_match, cols) => (
    buildTableHtml({
      docType: normalizedType,
      columnsToken: cols,
      rental,
      equipmentGroups,
      packItemsByEquipmentId,
      days,
      effectiveEquipmentCoefficient,
      maintenanceCharges,
      insuranceServiceRows,
      personnelServiceRows,
      otherServiceRows,
      deliveryLine,
      design,
      accentColor,
    })
  ));

  let studioCss = '';
  let studioBackground = null;
  let studioPdfHeaderFooter = null;
  let pageMargins = { top: 14, right: 14, bottom: 14, left: 14 };
  let useStudio = false;

  if (studioSnapshot && Array.isArray(studioSnapshot.blocks) && studioSnapshot.blocks.length > 0) {
    const studioResult = buildStudioHtml(studioSnapshot, {
      docType: normalizedType,
      rental,
      equipmentGroups,
      packItemsByEquipmentId,
      days,
      effectiveEquipmentCoefficient,
      maintenanceCharges,
      insuranceServiceRows,
      personnelServiceRows,
      otherServiceRows,
      deliveryLine,
      design,
      accentColor,
      templateVariablesExtended,
    });
    if (studioResult) {
      renderedHtml = studioResult.html;
      studioCss = studioResult.css || '';
      studioBackground = studioResult.background || null;
      studioPdfHeaderFooter = studioResult.pdfHeaderFooter || null;
      pageMargins = studioResult.margins || pageMargins;
      useStudio = true;
    }
  }

  if (!useStudio) {
    renderedHtml = `<div class="template-preview-root">${renderedHtml}</div>`;
  }

  const baseFont = ['Helvetica', 'Arial', 'Times New Roman', 'Times', 'Courier'].includes(design.fontFamily)
    ? design.fontFamily
    : 'Helvetica';
  const titleFont = design.titleFontFamily && design.titleFontFamily.trim().length
    ? design.titleFontFamily
    : baseFont;

  const studioBackgroundColor = useStudio && studioBackground ? studioBackground.color : '';
  const studioBackgroundImage = useStudio && studioBackground ? studioBackground.image : '';
  const backgroundImage = useStudio
    ? (studioBackgroundImage?.trim() || '')
    : (design.backgroundImageUrl?.trim() || '');
  const backgroundOpacity = useStudio && studioBackground
    ? clampValue(toNumber(studioBackground.opacity, 100), 0, 100) / 100
    : 1;
  const backgroundFit = useStudio && studioBackground
    ? (studioBackground.size === 'contain' ? 'contain' : studioBackground.size === 'auto' ? 'none' : 'cover')
    : 'cover';
  const backgroundSizeCss = backgroundFit === 'none' ? 'auto' : backgroundFit;

  const logoImage = useStudio ? '' : (design.logoImageUrl?.trim() || company?.logoUrl?.trim() || '');
  const bgScale = Math.max(0.5, design.backgroundScale || 1);
  const bgWidth = useStudio ? A4_WIDTH_MM : A4_WIDTH_MM * bgScale;
  const bgHeight = useStudio ? A4_HEIGHT_MM : A4_HEIGHT_MM * bgScale;
  const bgLeft = useStudio
    ? 0
    : (A4_WIDTH_MM - bgWidth) * ((Number(design.backgroundPositionX) || 50) / 100);
  const bgTop = useStudio
    ? 0
    : (A4_HEIGHT_MM - bgHeight) * ((Number(design.backgroundPositionY) || 50) / 100);
  const backgroundFrameCss = useStudio
    ? 'left:0;top:0;right:0;bottom:0;width:auto;height:auto;'
    : `left:${bgLeft}mm;top:${bgTop}mm;width:${bgWidth}mm;height:${bgHeight}mm;`;

  const logoScale = Math.min(3, Math.max(0.3, design.logoScale || 1));
  const logoWidth = LOGO_BASE_WIDTH_MM * logoScale;
  const logoHeight = LOGO_BASE_HEIGHT_MM * logoScale;
  const logoLeft = (A4_WIDTH_MM - logoWidth) * ((Number(design.logoPositionX) || 0) / 100);
  const logoTop = (A4_HEIGHT_MM - logoHeight) * ((Number(design.logoPositionY) || 0) / 100);

  const footerLines = buildLegalFooterLines(company);
  // Studio snapshot should export exactly what preview renders.
  // Automatic legal footer is a legacy layer and can create mismatches/ghost text pages.
  const footerEnabled = !useStudio && footerLines.length > 0;
  const footerFixed = footerEnabled && design.legalFooterMode === 'all';

  const footerHtml = footerEnabled
    ? `<div class="doc-footer${footerFixed ? ' fixed' : ''}">${footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
    : '';
  const reservedTopMarginMm = useStudio && studioPdfHeaderFooter
    ? clampValue(toNumber(studioPdfHeaderFooter.marginTopMm, 0), 0, 80)
    : 0;
  const reservedBottomMarginMm = useStudio && studioPdfHeaderFooter
    ? clampValue(toNumber(studioPdfHeaderFooter.marginBottomMm, 0), 0, 80)
    : 0;
  const pageTopMargin = useStudio ? 0 : pageMargins.top;
  const pageRightMargin = useStudio ? 0 : pageMargins.right;
  const pageBottomMargin = useStudio ? 0 : pageMargins.bottom;
  const pageLeftMargin = useStudio ? 0 : pageMargins.left;
  const contentPadding = useStudio
    ? `${Math.max(0, pageMargins.top - reservedTopMarginMm)}mm ${pageMargins.right}mm ${Math.max(0, pageMargins.bottom - reservedBottomMarginMm)}mm ${pageMargins.left}mm`
    : '0';
  const rootWidth = useStudio ? '210mm' : 'auto';
  const rootMinHeight = useStudio ? '297mm' : '100%';
  const pdfOptions = {};
  if (useStudio && studioPdfHeaderFooter) {
    pdfOptions.displayHeaderFooter = true;
    pdfOptions.headerTemplate = studioPdfHeaderFooter.headerTemplate;
    pdfOptions.footerTemplate = studioPdfHeaderFooter.footerTemplate;
    pdfOptions.margin = {
      top: `${reservedTopMarginMm}mm`,
      right: '0mm',
      bottom: `${reservedBottomMarginMm}mm`,
      left: '0mm',
    };
  }

  const baseCss = `
    @page { size: A4; margin: ${pageTopMargin}mm ${pageRightMargin}mm ${pageBottomMargin}mm ${pageLeftMargin}mm; }
    html, body { margin: 0; padding: 0; }
    body { font-family: ${baseFont}, sans-serif; font-size: ${design.fontSize || 12}px; color: #111827; background: ${studioBackgroundColor || '#ffffff'}; }
    .doc-root { position: relative; width: ${rootWidth}; min-height: ${rootMinHeight}; }
    .doc-content { position: relative; z-index: 2; padding: ${contentPadding}; box-sizing: border-box; }
    .doc-background { position: fixed; ${backgroundFrameCss} z-index: 0; opacity: ${backgroundOpacity}; background-size: ${backgroundSizeCss}; background-position: center; background-repeat: no-repeat; }
    .doc-logo { position: fixed; left: ${logoLeft}mm; top: ${logoTop}mm; width: ${logoWidth}mm; height: ${logoHeight}mm; object-fit: contain; z-index: 1; }
    .template-preview-root h1, .template-preview-root h2, .template-preview-root h3 { font-family: ${titleFont}, ${baseFont}, sans-serif; }
    .template-preview-root h1 { font-size: ${Math.max(design.fontSize + 8, design.titleFontSize || 0)}px; margin: ${design.titleMarginTop}px 0 ${design.titleMarginBottom}px; text-align: ${design.titleAlign}; }
    .template-preview-root h2 { font-size: ${design.fontSize + 4}px; margin: 12px 0 8px; }
    .template-preview-root h3 { font-size: ${design.fontSize + 2}px; margin: 10px 0 6px; }
    .template-preview-root p { margin: 0 0 8px; line-height: ${design.infoBlockLineHeight || 1.35}; }
    .doc-footer { margin-top: 12px; font-size: ${Math.max(8, (design.fontSize || 12) - 2)}px; color: #4b5563; text-align: center; }
    .doc-footer.fixed { position: fixed; left: ${pageMargins.left}mm; right: ${pageMargins.right}mm; bottom: 10mm; }
  `;

  const baseTag = baseUrl ? `<base href="${escapeHtml(baseUrl)}" />` : '';

  const html = `<!DOCTYPE html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      ${baseTag}
      <style>${baseCss}${studioCss || ''}${customCss || ''}</style>
    </head>
    <body>
      ${backgroundImage ? `<div class="doc-background" style="background-image:url('${escapeHtml(backgroundImage)}');"></div>` : ''}
      ${logoImage ? `<img class="doc-logo" src="${escapeHtml(logoImage)}" alt="Logo" />` : ''}
      <div class="doc-root">
        <div class="doc-content">
          ${renderedHtml}
        </div>
        ${footerHtml}
      </div>
    </body>
  </html>`;
  return { html, pdfOptions };
};
