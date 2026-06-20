import React from 'react';
import { DocumentTableDesign } from './documentDesign';
import { buildLegalFooterLines, LegalCompanyInfo } from './documentLegalFooter';
import { toPdfImageSource } from './documentImages';
import { Rental } from '../types/rental';

type RentalDocumentType = 'devis' | 'facture' | 'bon_prepa';

type Payment = {
  id: string;
  amount: number;
  status?: string | null;
  payment_type?: 'deposit' | 'payment' | 'refund' | null;
};

export type DocumentClientInfo = {
  name?: string | null;
  company_client_name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type DocumentPackItem = {
  name: string;
  quantity: number;
};

type PdfRenderer = {
  Document: React.ComponentType<any>;
  Page: React.ComponentType<any>;
  Text: React.ComponentType<any>;
  View: React.ComponentType<any>;
  Image: React.ComponentType<any>;
  StyleSheet: { create: (styles: Record<string, any>) => Record<string, any> };
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_TO_PT = A4_WIDTH / A4_WIDTH_MM;
const LOGO_BASE_WIDTH = 140;
const LOGO_BASE_HEIGHT = 70;

type StudioTableColumnKey = 'quantity' | 'designation' | 'discount' | 'unit_price' | 'total' | 'days' | 'coefficient';

type StudioTableColumnDefinition = {
  key: StudioTableColumnKey;
  label: string;
  align: 'left' | 'right' | 'center';
  weight: number;
};

type StudioBlockType = 'title' | 'subtitle' | 'separator' | 'grid' | 'image' | 'qrcode' | 'zone' | 'table';
type GridBorderSide = 'top' | 'right' | 'bottom' | 'left';
type GridBorderStyle = { color: string; width: number };
type GridBorderSet = Record<GridBorderSide, GridBorderStyle>;
type SimpleBorderStyle = 'solid' | 'dashed' | 'dotted';

type StudioTemplateBlock = {
  id: string;
  type: StudioBlockType;
  text?: string;
  contentHtml?: string;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  layoutMode?: 'flow' | 'floating' | 'semi-fixed';
  floatX?: number;
  floatY?: number;
  floatWidth?: number;
  floatHeight?: number;
  separatorStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'gradient' | 'glow';
  separatorThickness?: number;
  separatorWidthPercent?: number;
  separatorRadius?: number;
  separatorColor?: string;
  separatorSecondaryColor?: string;
  separatorOpacity?: number;
  separatorAlign?: 'left' | 'center' | 'right';
  gridRows?: number;
  gridColumns?: number;
  gridCells?: StudioTemplateBlock[][];
  gridDividerColor?: string;
  gridDividerWidth?: number;
  gridBorders?: GridBorderSet;
  gridBorderTransparent?: boolean;
  gridDividerStyle?: SimpleBorderStyle;
  gridCellPaddingXMm?: number;
  gridCellPaddingYMm?: number;
  gridCellMinHeightMm?: number;
  gridBackgroundColor?: string;
  gridCellBackgroundColor?: string;
  gridOpacity?: number;
  gridBorderOpacity?: number;
  gridBackgroundOpacity?: number;
  gridCellBackgroundOpacity?: number;
  gridBorderRadius?: number;
  imageUrl?: string;
  imageAlt?: string;
  imageFit?: 'cover' | 'contain' | 'fill' | 'none';
  imageAlign?: 'left' | 'center' | 'right';
  imageWidthPercent?: number;
  imageHeightMm?: number;
  imageOpacity?: number;
  imageBorderRadius?: number;
  imageBorderWidth?: number;
  imageBorderColor?: string;
  imageBackgroundColor?: string;
  zoneChildren?: StudioTemplateBlock[];
  zonePaddingMm?: number;
  zonePaddingXMm?: number;
  zonePaddingYMm?: number;
  zoneMinHeightMm?: number;
  zoneOpacity?: number;
  zoneBackgroundColor?: string;
  zoneBorderColor?: string;
  zoneBorderWidth?: number;
  zoneBorderRadius?: number;
  zoneBorderTransparent?: boolean;
  zoneBorderStyle?: SimpleBorderStyle;
  zoneBorderOpacity?: number;
  zoneBackgroundOpacity?: number;
  tableColumns?: StudioTableColumnKey[];
  tableShowCategories?: boolean;
  tableHeaderBackground?: string;
  tableHeaderTextColor?: string;
  tableBodyBackground?: string;
  tableCategoryBackground?: string;
  tableCategoryTextColor?: string;
  tableBorderColor?: string;
  tableBorderWidth?: number;
  tableBorderRadius?: number;
  tableCellPaddingX?: number;
  tableCellPaddingY?: number;
  tableRowGapPx?: number;
  tableFontSizePt?: number;
  tableHeaderFontSizePt?: number;
  tableHeaderBold?: boolean;
};

type StudioSnapshot = {
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  background: {
    color: string;
    image: string;
    opacity: number;
    size: 'cover' | 'contain' | 'auto';
  };
  blocks: StudioTemplateBlock[];
};

type StudioTableRow = Record<StudioTableColumnKey, string>;

type StudioTableGroup = {
  category: string;
  rows: StudioTableRow[];
};

const STUDIO_TABLE_COLUMN_DEFINITIONS: StudioTableColumnDefinition[] = [
  { key: 'quantity', label: 'Qté', align: 'right', weight: 0.85 },
  { key: 'designation', label: 'Désignation', align: 'left', weight: 2.35 },
  { key: 'discount', label: 'Rem', align: 'right', weight: 0.85 },
  { key: 'unit_price', label: 'PU', align: 'right', weight: 1.15 },
  { key: 'total', label: 'Total', align: 'right', weight: 1.25 },
  { key: 'days', label: 'Jours', align: 'right', weight: 0.8 },
  { key: 'coefficient', label: 'Coef', align: 'right', weight: 0.85 },
];

const STUDIO_TABLE_DEFAULT_COLUMNS: StudioTableColumnKey[] = ['quantity', 'designation', 'discount', 'unit_price', 'total'];

const createDefaultGridBorders = (): GridBorderSet => ({
  top: { color: '#94a3b8', width: 0 },
  right: { color: '#94a3b8', width: 0 },
  bottom: { color: '#94a3b8', width: 0 },
  left: { color: '#94a3b8', width: 0 },
});

const normalizeGridBorders = (value: unknown): GridBorderSet => {
  const base = createDefaultGridBorders();
  if (!value || typeof value !== 'object') return base;
  const source = value as Partial<Record<GridBorderSide, { color?: unknown; width?: unknown }>>;
  (['top', 'right', 'bottom', 'left'] as GridBorderSide[]).forEach((side) => {
    const candidate = source[side];
    if (!candidate || typeof candidate !== 'object') return;
    const color = typeof candidate.color === 'string' ? candidate.color : base[side].color;
    const width = clampValue(Number(candidate.width), 0, 12);
    base[side] = {
      color,
      width: Number.isFinite(width) ? width : base[side].width,
    };
  });
  const normalizeColor = (color: string) => color.trim().toLowerCase();
  const legacyColors = new Set(['#64748b', '#94a3b8']);
  const sides: GridBorderSide[] = ['top', 'right', 'bottom', 'left'];
  const looksLikeLegacyFullFrame = sides.every((side) => base[side].width === 1)
    && sides.every((side) => legacyColors.has(normalizeColor(base[side].color)));
  if (looksLikeLegacyFullFrame) {
    base.right.width = 0;
    base.bottom.width = 0;
  }
  const looksLikeLegacyRightBottomOnly = base.top.width === 0
    && base.left.width === 0
    && base.right.width === 1
    && base.bottom.width === 1
    && legacyColors.has(normalizeColor(base.right.color))
    && legacyColors.has(normalizeColor(base.bottom.color));
  if (looksLikeLegacyRightBottomOnly) {
    base.right.width = 0;
    base.bottom.width = 0;
  }
  return base;
};

const isLegacyZoneBorderStyle = (params: {
  width: number;
  color: string;
  opacity: number;
  style: SimpleBorderStyle;
  transparent: boolean;
}): boolean => {
  if (params.transparent) return false;
  if (params.style !== 'solid') return false;
  if (params.width <= 0) return false;
  if (params.width > 1) return false;
  return Math.round(params.opacity) >= 80;
};

const blockTreeContainsType = (
  blocks: StudioTemplateBlock[] | undefined,
  targetType: StudioBlockType,
): boolean => {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === targetType) return true;
    if (block.type === 'zone') {
      if (blockTreeContainsType(block.zoneChildren ?? [], targetType)) return true;
      continue;
    }
    if (block.type === 'grid' && Array.isArray(block.gridCells)) {
      for (const cell of block.gridCells) {
        if (Array.isArray(cell) && blockTreeContainsType(cell as StudioTemplateBlock[], targetType)) return true;
      }
    }
  }
  return false;
};

const mmToPt = (value?: number | null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num * MM_TO_PT;
};

const clampValue = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const safeRadius = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, num);
};

const sanitizePdfStyle = (style: Record<string, any>) => {
  const next = { ...style };
  const normalizeRadius = (key: string) => {
    if (!(key in next)) return;
    const num = Number(next[key]);
    if (!Number.isFinite(num) || num <= 0) {
      delete next[key];
      return;
    }
    next[key] = num;
  };
  const normalizeBorderWidth = (key: string, allowZero = true) => {
    if (!(key in next)) return;
    const num = Number(next[key]);
    if (!Number.isFinite(num) || (!allowZero && num <= 0)) {
      delete next[key];
      return;
    }
    next[key] = Math.max(0, num);
  };
  normalizeRadius('borderRadius');
  normalizeRadius('borderTopLeftRadius');
  normalizeRadius('borderTopRightRadius');
  normalizeRadius('borderBottomLeftRadius');
  normalizeRadius('borderBottomRightRadius');
  normalizeBorderWidth('borderWidth', false);
  normalizeBorderWidth('borderTopWidth');
  normalizeBorderWidth('borderRightWidth');
  normalizeBorderWidth('borderBottomWidth');
  normalizeBorderWidth('borderLeftWidth');
  return next;
};

const sanitizePdfStyles = (styles: Record<string, any>) => {
  const output: Record<string, any> = {};
  Object.entries(styles).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = sanitizePdfStyle(value);
    } else {
      output[key] = value;
    }
  });
  return output;
};

const sanitizeRadiusValue = (value: unknown) => {
  if (value == null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
};

const sanitizeBorderWidthValue = (value: unknown, allowZero = true) => {
  if (value == null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || (!allowZero && num <= 0)) return undefined;
  return Math.max(0, num);
};

const sanitizeInlineStyle = (style: any): any => {
  if (Array.isArray(style)) {
    return style.map((entry) => sanitizeInlineStyle(entry));
  }
  if (!style || typeof style !== 'object') return style;
  const next = { ...style };
  const radiusKeys = [
    'borderRadius',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
  ];
  radiusKeys.forEach((key) => {
    if (!(key in next)) return;
    const sanitized = sanitizeRadiusValue(next[key]);
    if (sanitized == null) {
      delete next[key];
      return;
    }
    next[key] = sanitized;
  });
  if ('borderWidth' in next) {
    const sanitized = sanitizeBorderWidthValue(next.borderWidth, false);
    if (sanitized == null) {
      delete next.borderWidth;
    } else {
      next.borderWidth = sanitized;
    }
  }
  const sideWidthKeys = [
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
  ];
  sideWidthKeys.forEach((key) => {
    if (!(key in next)) return;
    const sanitized = sanitizeBorderWidthValue(next[key], true);
    if (sanitized == null) {
      delete next[key];
      return;
    }
    next[key] = sanitized;
  });
  return next;
};

const sanitizePdfTree = (node: any): any => {
  if (Array.isArray(node)) return node.map((child) => sanitizePdfTree(child));
  if (!React.isValidElement(node)) return node;
  const props = node.props || {};
  const nextProps: any = { ...props };
  if (props.style) {
    nextProps.style = sanitizeInlineStyle(props.style);
  }
  if (props.children) {
    nextProps.children = React.Children.map(props.children, (child) => sanitizePdfTree(child));
  }
  return React.cloneElement(node, nextProps);
};

const buildQrCodeImageUrl = (value: string, sizePx = 640): string => {
  const safe = String(value || '').trim();
  if (!safe) return '';
  const size = Math.round(clampValue(sizePx, 64, 2000));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(safe)}`;
};

const isRecord = (value: unknown): value is Record<string, any> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const normalizeStudioTemplateSnapshot = (value: unknown): StudioSnapshot | null => {
  if (!isRecord(value)) return null;
  const marginsRaw = isRecord(value.margins) ? value.margins : {};
  const backgroundRaw = isRecord(value.background) ? value.background : {};
  const rawBlocks = Array.isArray(value.blocks) ? value.blocks : [];
  const blocks = rawBlocks
    .filter((entry): entry is Record<string, any> => isRecord(entry))
    .filter((entry): entry is StudioTemplateBlock => (
      entry.type === 'title'
      || entry.type === 'subtitle'
      || entry.type === 'separator'
      || entry.type === 'grid'
      || entry.type === 'image'
      || entry.type === 'qrcode'
      || entry.type === 'zone'
      || entry.type === 'table'
    )) as StudioTemplateBlock[];

  if (blocks.length === 0) return null;

  const readMargin = (side: 'top' | 'bottom' | 'left' | 'right', fallback: number) => {
    const raw = Number(marginsRaw[side]);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(0, raw);
  };

  const sizeMode = backgroundRaw.size === 'contain' || backgroundRaw.size === 'auto'
    ? backgroundRaw.size
    : 'cover';
  const backgroundOpacity = Number(backgroundRaw.opacity);

  return {
    margins: {
      top: readMargin('top', 20),
      bottom: readMargin('bottom', 20),
      left: readMargin('left', 14),
      right: readMargin('right', 14),
    },
    background: {
      color: typeof backgroundRaw.color === 'string' && backgroundRaw.color.trim().length > 0
        ? backgroundRaw.color
        : '#ffffff',
      image: typeof backgroundRaw.image === 'string' ? backgroundRaw.image : '',
      opacity: Number.isFinite(backgroundOpacity) ? Math.min(100, Math.max(0, backgroundOpacity)) : 100,
      size: sizeMode,
    },
    blocks,
  };
};

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

const htmlToLines = (html?: string) => {
  if (!html) return [] as string[];
  try {
    let s = html.replace(/<\/(p|div)>/gi, '\n').replace(/<br\s*\/?>(\n)?/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    return s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  } catch {
    return [];
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  } catch {
    return value || '';
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  } catch {
    return value || '';
  }
};

const formatCurrency = (value?: number | null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return `${num.toFixed(2)}€`;
};

const applyTemplateVariables = (html: string, variables: Record<string, string>) => {
  if (!html) return '';
  return html.replace(/\{\{\s*([a-z0-9_]+)\s*}}/gi, (match, key) => {
    const normalized = String(key).toLowerCase();
    if (normalized in variables) {
      return variables[normalized];
    }
    return match;
  });
};

const toRgba = (color: string, opacity: number) => {
  const normalized = color.trim();
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  if (normalized.toLowerCase() === 'transparent') return 'transparent';

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
      const r = Math.max(0, Math.min(255, parts[0]));
      const g = Math.max(0, Math.min(255, parts[1]));
      const b = Math.max(0, Math.min(255, parts[2]));
      const baseAlpha = parts.length >= 4 && Number.isFinite(parts[3]) ? Math.max(0, Math.min(1, parts[3])) : 1;
      return `rgba(${r}, ${g}, ${b}, ${baseAlpha * clampedOpacity})`;
    }
  }

  if (!normalized.startsWith('#')) return normalized;
  const hex = normalized.slice(1);
  const normalizedHex = hex.length === 3 || hex.length === 4
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  if (!(normalizedHex.length === 6 || normalizedHex.length === 8)) return normalized;
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);
  const baseAlpha = normalizedHex.length === 8 ? parseInt(normalizedHex.slice(6, 8), 16) / 255 : 1;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(baseAlpha)) return normalized;
  return `rgba(${r}, ${g}, ${b}, ${baseAlpha * clampedOpacity})`;
};

const applyOpacityToColor = (color: string, opacityPercent: number) => {
  const normalized = String(color || '').trim();
  if (!normalized) return 'transparent';
  const alpha = Math.max(0, Math.min(100, opacityPercent)) / 100;
  if (alpha <= 0) return 'transparent';
  if (alpha >= 1) return normalized;
  return toRgba(normalized, alpha);
};

const resolveTableBackdropColor = (design: DocumentTableDesign) => {
  const color = design.tableBackdropColor?.trim() || '#ffffff';
  if (design.tableBackdropMode === 'solid') return color;
  const opacity = Math.min(1, Math.max(0.4, design.tableBackdropOpacity || 0.85));
  const rgba = toRgba(color, opacity);
  if (rgba.startsWith('rgba')) return rgba;
  return toRgba('#ffffff', opacity);
};

const columnFlexMap: Record<string, number> = {
  equipment: 2.6,
  type: 1.4,
  qty: 0.7,
  rem: 0.7,
  priceperday: 1.1,
  pricePerDay: 1.1,
  days: 0.7,
  total: 1.2,
  checkbox: 0.6,
};

const columnTextLimits: Record<string, { max: number; line: number; wrap: boolean }> = {
  equipment: { max: 36, line: 18, wrap: true },
  type: { max: 22, line: 11, wrap: true },
  qty: { max: 6, line: 6, wrap: false },
  rem: { max: 6, line: 6, wrap: false },
  priceperday: { max: 12, line: 12, wrap: false },
  pricePerDay: { max: 12, line: 12, wrap: false },
  days: { max: 6, line: 6, wrap: false },
  total: { max: 12, line: 12, wrap: false },
  checkbox: { max: 4, line: 4, wrap: false },
};

const normalizeColumnKey = (key: string) => key.toLowerCase();

const getColumnFlex = (key: string) => columnFlexMap[key] ?? columnFlexMap[normalizeColumnKey(key)] ?? 1;

const fitText = (value: string, key: string) => {
  const text = value ?? '';
  const config = columnTextLimits[key] ?? columnTextLimits[normalizeColumnKey(key)] ?? { max: 20, line: 10, wrap: true };
  if (!config.wrap) {
    if (text.length <= config.max) return text;
    return `${text.slice(0, Math.max(0, config.max - 1)).trimEnd()}…`;
  }

  let normalized = text;
  if (!normalized.includes('\n') && normalized.length > config.line) {
    normalized = `${normalized.slice(0, config.line).trimEnd()}\n${normalized.slice(config.line)}`;
  }
  if (normalized.length > config.max) {
    normalized = `${normalized.slice(0, Math.max(0, config.max - 1)).trimEnd()}…`;
  }
  return normalized;
};

const clampPercent = (value?: number | null) => {
  if (!Number.isFinite(value as number)) return 0;
  return Math.min(100, Math.max(0, Number(value)));
};

const buildDesignation = (name: string, type: string | null | undefined, includeType: boolean, indent: boolean) => {
  const prefix = indent ? '  ' : '';
  const base = `${prefix}${name}`;
  if (!includeType || !type) return base;
  return `${base}\n${prefix}${type}`;
};

const resolveDocumentEquipmentType = (item: Rental['items'][number]): string => {
  const equipmentType = typeof item.equipment_type === 'string' ? item.equipment_type.trim() : '';
  const externalType = typeof item.external_type === 'string' ? item.external_type.trim() : '';

  // Keep document grouping by base material type (no subtype).
  if (item.is_external) {
    if (externalType) return externalType;
    if (equipmentType) {
      return equipmentType
        .replace(/\s+\([^)]*\)\s*$/g, '')
        .replace(/\s*\/\s*.+$/g, '')
        .trim() || 'Externe';
    }
    return 'Externe';
  }

  return equipmentType || 'Autres';
};

const stripPackLabel = (value: string) => {
  const cleaned = value.replace(/\bpack\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  return cleaned || value;
};

export const buildRentalDocument = ({
  renderer,
  rental,
  docType,
  documentDesign,
  editorHtml = '',
  studioTemplate = null,
  payments = [],
  company,
  client,
  deliveryDate,
  packItemsByEquipmentId,
  equipmentCoefficient,
}: {
  renderer: PdfRenderer;
  rental: Rental;
  docType: RentalDocumentType;
  documentDesign: DocumentTableDesign;
  editorHtml?: string;
  studioTemplate?: Record<string, any> | null;
  payments?: Payment[];
  company?: LegalCompanyInfo | null;
  client?: DocumentClientInfo | null;
  deliveryDate?: string | null;
  packItemsByEquipmentId?: Record<string, DocumentPackItem[]>;
  equipmentCoefficient?: number | null;
}) => {
  const { Document, Page, Text, View, StyleSheet, Image } = renderer;
  const reference = rental.reference_code || rental.id.slice(0, 6).toUpperCase();
  const safePackItemsByEquipmentId = packItemsByEquipmentId || {};
  const periodLabel = `${formatDate(rental.start_date)} → ${formatDate(rental.end_date)}`.trim();
  const showSplitInfo = docType === 'devis' || docType === 'facture';
  const clientName = client?.name || rental.client_name || '';
  const clientCompany = client?.company_client_name?.trim() || '';
  const representsCompany = Boolean(clientCompany) && (rental.client_represents_company ?? true);
  const clientProfileLabel = representsCompany ? 'Entreprise' : 'Particulier';
  const billingAddress = client?.address?.trim() || '';
  const contactEmail = client?.email?.trim() || '';
  const contactPhone = client?.phone?.trim() || '';
  const contactLine = [contactEmail, contactPhone].filter(Boolean).join(' • ');
  const deliveryLabel = deliveryDate ? formatDateTime(deliveryDate) : '';
  const days = Math.max(1, Math.ceil((new Date(rental.end_date).getTime() - new Date(rental.start_date).getTime()) / (1000 * 60 * 60 * 24)));
  const templateVariables: Record<string, string> = {
    rental_id: rental.id || '',
    client_name: clientName || 'Client',
    client_company: clientCompany,
    client_profile: clientProfileLabel,
    client_email: contactEmail,
    client_phone: contactPhone,
    client_contact: contactLine,
    client_address: billingAddress,
    reference,
    title: rental.title || '',
    type: rental.type || '',
    period: periodLabel,
    start_date: formatDateTime(rental.start_date),
    end_date: formatDateTime(rental.end_date),
    days: String(days),
    location: rental.location || '',
    delivery_date: deliveryLabel,
    total: formatCurrency(rental.total_price || 0),
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
  const resolvedHtml = applyTemplateVariables(editorHtml, templateVariables);
  const accentMatch = resolvedHtml.match(/\[\[ACCENT:([^\]]+)]]/i);
  const accentColor = accentMatch ? accentMatch[1] : null;
  const titleMatch = resolvedHtml.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const baseTitle = (titleMatch && titleMatch[1]) || (docType === 'devis' ? 'Devis' : docType === 'facture' ? 'Facture' : 'Bon de préparation');

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
  const titleFontSize = documentDesign.titleFontSize > 0 ? documentDesign.titleFontSize : documentDesign.fontSize + 6;
  const tableBackdropColor = resolveTableBackdropColor(documentDesign);
  const safeCornerRadius = safeRadius(documentDesign.cornerRadius, 0);
  const legalFooterLines = buildLegalFooterLines(company);
  const footerEnabled = legalFooterLines.length > 0;
  const footerFixed = footerEnabled && documentDesign.legalFooterMode === 'all';
  const footerFontSize = Math.max(8, documentDesign.fontSize - 2);
  const footerLineHeight = footerFontSize * 1.4;
  const footerHeight = footerFixed
    ? Math.ceil(footerLineHeight * legalFooterLines.length) + 12
    : 0;
  const infoBlockPadding = Math.max(0, documentDesign.infoBlockPadding || 0);
  const infoBlockMarginTop = Math.max(0, documentDesign.infoBlockMarginTop || 0);
  const infoBlockMarginBottom = Math.max(0, documentDesign.infoBlockMarginBottom || 0);
  const infoBlockColumnGap = Math.max(0, documentDesign.infoBlockColumnGap || 0);
  const infoBlockLineHeight = Math.min(2, Math.max(1, documentDesign.infoBlockLineHeight || 1.35));
  const infoColumnGapHalf = infoBlockColumnGap / 2;
  const kitLinePrefix = '    ';
  const kitIndent = Math.max(8, Math.round(documentDesign.cellPadding * 0.75));
  const styles = StyleSheet.create(sanitizePdfStyles({
    page: {
      padding: 24,
      paddingBottom: 24 + footerHeight,
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
    muted: { color: '#666', marginBottom: 8 },
    infoRow: {
      flexDirection: 'row',
      marginTop: infoBlockMarginTop,
      marginBottom: infoBlockMarginBottom,
      padding: infoBlockPadding,
    },
    infoColumn: {
      flexGrow: 1,
      flexBasis: 0,
    },
    infoColumnLeft: {
      paddingRight: infoColumnGapHalf,
    },
    infoColumnRight: {
      paddingLeft: infoColumnGapHalf,
    },
    infoLine: {
      marginBottom: 3,
      lineHeight: infoBlockLineHeight,
    },
    infoLabel: {
      fontWeight: 600,
    },
    summaryRowWrap: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'flex-start',
    },
    summaryCard: {
      padding: 10,
      minWidth: 220,
      border: borderToken,
      borderRadius: safeCornerRadius,
      backgroundColor: tableBackdropColor,
    },
    summaryCardLeft: {
      marginRight: 12,
    },
    kitDetailCell: {
      paddingLeft: documentDesign.cellPadding + kitIndent,
    },
    kitDetailText: {
      fontStyle: 'italic',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    summaryLabel: {
      color: '#111827',
    },
    summaryValue: {
      textAlign: 'right',
      marginLeft: 10,
    },
    summaryDivider: {
      height: Math.max(1, documentDesign.borderWidth || 1),
      backgroundColor: documentDesign.borderColor,
      marginVertical: 6,
    },
    summaryStrong: {
      fontWeight: 700,
    },
    table: {
      marginTop: 6,
      border: borderToken,
      borderRadius: safeCornerRadius,
      overflow: 'hidden',
      backgroundColor: tableBackdropColor,
    },
    headerRow: {
      flexDirection: 'row',
      backgroundColor: documentDesign.headerBackground || accentColor || '#111827',
      color: documentDesign.headerTextColor,
      borderBottom: borderToken,
    },
    bodyRow: {
      flexDirection: 'row',
    },
    cell: {
      padding: documentDesign.cellPadding,
      flexGrow: 1,
      flexBasis: 0,
      borderRight: borderToken,
    },
    headerCell: {
      fontWeight: 600,
      color: documentDesign.headerTextColor,
    },
    right: { textAlign: 'right' },
    footer: {
      position: 'absolute',
      left: 24,
      right: 24,
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
  }));

  const completedPayments = payments.filter((payment) => (payment.status || 'completed') === 'completed');
  const depositTotal = completedPayments
    .filter((payment) => (payment.payment_type || 'payment') === 'deposit')
    .reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? payment.amount : 0), 0);
  const otherPaymentsTotal = completedPayments
    .filter((payment) => (payment.payment_type || 'payment') !== 'deposit')
    .reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? payment.amount : 0), 0);

  const normalizedOverride = Number.isFinite(Number(rental.rental_coefficient_override))
    ? Number(rental.rental_coefficient_override)
    : null;
  const effectiveEquipmentCoefficient = Number.isFinite(Number(equipmentCoefficient)) && Number(equipmentCoefficient) > 0
    ? Number(equipmentCoefficient)
    : (normalizedOverride && normalizedOverride > 0 ? normalizedOverride : days);
  const includeMaintenance = docType !== 'bon_prepa';
  const includeDelivery = docType !== 'bon_prepa';
  const includePersonnelServices = docType !== 'bon_prepa';
  const includeInsuranceServices = docType !== 'bon_prepa';
  const includeOtherServices = docType !== 'bon_prepa';
  const maintenanceCharges = includeMaintenance ? (rental.maintenance_charges || []) : [];
  const personnelServices = includePersonnelServices ? (rental.personnel_services || []) : [];
  const insuranceServices = includeInsuranceServices ? (rental.insurance_services || []) : [];
  const otherServices = includeOtherServices ? (rental.other_services || []) : [];
  const maintenanceTotal = maintenanceCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
  const deliveryTotal = includeDelivery ? Number(rental.delivery_total_amount || 0) : 0;
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
  const serviceBreakdownTotal = serviceInsurance + serviceTransport + servicePersonnel + serviceOther;
  const orderedGroups = (rental.item_groups || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const allItemsSorted = rental.items.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const hasExplicitGroups = orderedGroups.length > 0 && rental.items.some((it) => it.group_id);
  const ungroupedItems = hasExplicitGroups ? allItemsSorted.filter((item) => !item.group_id) : [];
  const equipmentGroups = hasExplicitGroups
    ? [
      // Ungrouped items first (no section header) to avoid visual confusion
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
  const itemRowCount = equipmentGroups.reduce((sum, group) => sum + group.items.length, 0);
  const equipmentTotal = rental.items.reduce((sum, it) => {
    const base = it.price_per_day * it.quantity * effectiveEquipmentCoefficient;
    const discount = Number.isFinite(it.discount_percent)
      ? Math.min(100, Math.max(0, Number(it.discount_percent)))
      : 0;
    return sum + base * (1 - discount / 100);
  }, 0);
  const servicesTotal = maintenanceTotal + serviceBreakdownTotal;
  const base = equipmentTotal + servicesTotal;
  const discount = rental.discount_type === 'percentage' ? (base * (rental.discount_value || 0) / 100) : (rental.discount_value || 0);
  const totalNet = Math.max(0, base - discount);
  const totalTTC = totalNet;
  const totalPaid = depositTotal + otherPaymentsTotal;
  const remainingDue = Math.max(0, totalTTC - totalPaid);
  const deliveryQuantity = Number(rental.delivery_quantity || 0);
  const deliveryUnitPrice = deliveryQuantity > 0 ? deliveryTotal / deliveryQuantity : deliveryTotal;
  const deliveryLineLabel = (rental.delivery_offer_name || 'Forfait livraison').trim() || 'Forfait livraison';
  const deliveryTripLabel = rental.delivery_round_trip == null
    ? ''
    : rental.delivery_round_trip
      ? 'Aller + retour'
      : 'Aller simple';
  const deliveryDesignation = [deliveryLineLabel, deliveryTripLabel ? `(${deliveryTripLabel})` : '']
    .filter(Boolean)
    .join(' ');
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
        total,
      };
    });

  const eventAddress = rental.delivery_address?.trim() || rental.location?.trim() || '';
  const eventAddressParts = eventAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const billingAddressParts = billingAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const billingCountry = billingAddressParts.length > 0 ? billingAddressParts[billingAddressParts.length - 1] : '';
  const quoteExpirationDate = rental.quote_expired_at ? formatDate(rental.quote_expired_at) : '';
  const nowDate = formatDate(new Date().toISOString());
  const coefficientLabel = Number.isFinite(effectiveEquipmentCoefficient) ? effectiveEquipmentCoefficient.toFixed(2) : String(effectiveEquipmentCoefficient);
  const totalVat = 0;

  const templateVariablesExtended: Record<string, string> = {
    ...templateVariables,
    rental_id: rental.id || '',
    rental_reference: reference,
    rental_title: rental.title || '',
    rental_type: rental.type || '',
    rental_status: rental.status || '',
    quote_expiration_date: quoteExpirationDate,
    document_date: nowDate,
    document_page: '1',
    document_pages: '1',
    event_start: formatDateTime(rental.start_date),
    event_end: formatDateTime(rental.end_date),
    return_delivery_date: formatDateTime(rental.return_delivery_at),
    return_date: formatDateTime(rental.returned_at || rental.return_info?.completed_at || null),
    rental_days_count: String(days),
    rental_coefficient: coefficientLabel,
    delivery_window: '',
    client_profile_type: clientProfileLabel.toLowerCase(),
    client_contact_name: clientName || '',
    client_contact_email: contactEmail,
    client_contact_phone: contactPhone,
    event_location: rental.location || '',
    event_address_line1: eventAddressParts[0] || eventAddress,
    event_postcode: '',
    event_city: eventAddressParts.length > 1 ? eventAddressParts[eventAddressParts.length - 1] : '',
    billing_address_line1: billingAddressParts[0] || billingAddress,
    billing_postcode: '',
    billing_city: billingAddressParts.length > 1 ? billingAddressParts[billingAddressParts.length - 1] : '',
    billing_country: billingCountry,
    total_assurance: formatCurrency(serviceInsurance),
    total_assurance_ht: formatCurrency(serviceInsurance),
    total_transport: formatCurrency(serviceTransport),
    total_transport_ht: formatCurrency(serviceTransport),
    total_personnel: formatCurrency(servicePersonnel),
    total_personnel_ht: formatCurrency(servicePersonnel),
    total_autre: formatCurrency(serviceOther),
    total_autre_ht: formatCurrency(serviceOther),
    total_services: formatCurrency(servicesTotal),
    total_services_ht: formatCurrency(servicesTotal),
    total_location: formatCurrency(equipmentTotal),
    total_location_ht: formatCurrency(equipmentTotal),
    sous_total: formatCurrency(totalNet),
    subtotal_ht: formatCurrency(totalNet),
    total_prestation: formatCurrency(totalTTC),
    total_presta: formatCurrency(totalTTC),
    subtotal_equipment_ht: formatCurrency(equipmentTotal),
    subtotal_services_ht: formatCurrency(servicesTotal),
    discount_percent: rental.discount_type === 'percentage'
      ? `${Number(rental.discount_value || 0).toFixed(2)}`
      : '0',
    discount_amount: formatCurrency(discount),
    total_ht: formatCurrency(totalNet),
    total_vat: formatCurrency(totalVat),
    total_ttc: formatCurrency(totalTTC),
    deposit_amount: formatCurrency(depositTotal),
    balance_due: formatCurrency(remainingDue),
    company_rib_iban: (company as any)?.rib_iban || (company as any)?.iban || '',
    company_rib_bic: (company as any)?.rib_bic || (company as any)?.bic || '',
  };

  const makeStudioTableRow = (input: Partial<StudioTableRow>): StudioTableRow => ({
    quantity: input.quantity || '',
    designation: input.designation || '',
    discount: input.discount || '',
    unit_price: input.unit_price || '',
    total: input.total || '',
    days: input.days || '',
    coefficient: input.coefficient || '',
  });

  const studioTableGroups: StudioTableGroup[] = [];
  const includeFinancialColumns = docType !== 'bon_prepa';
  const pushStudioGroup = (category: string, rows: StudioTableRow[]) => {
    if (rows.length === 0) return;
    studioTableGroups.push({ category, rows });
  };

  equipmentGroups.forEach((group) => {
    const rows: StudioTableRow[] = [];
    group.items.forEach((item) => {
      const discountPct = Number.isFinite(item.discount_percent)
        ? Math.min(100, Math.max(0, Number(item.discount_percent)))
        : 0;
      const lineTotal = item.price_per_day * item.quantity * effectiveEquipmentCoefficient * (1 - discountPct / 100);
      rows.push(makeStudioTableRow({
        quantity: String(item.quantity),
        designation: item.equipment_name || 'Équipement',
        discount: includeFinancialColumns ? (discountPct > 0 ? `${discountPct}%` : '-') : '-',
        unit_price: includeFinancialColumns ? formatCurrency(item.price_per_day) : '',
        total: includeFinancialColumns ? formatCurrency(lineTotal) : '',
        days: String(days),
        coefficient: coefficientLabel,
      }));
      const packItems = item.equipment_id ? safePackItemsByEquipmentId[item.equipment_id] : undefined;
      if (Array.isArray(packItems) && packItems.length > 0) {
        packItems.forEach((packItem) => {
          rows.push(makeStudioTableRow({
            quantity: String(packItem.quantity),
            designation: `  ${packItem.quantity} x ${packItem.name}`,
            discount: includeFinancialColumns ? '-' : '',
            unit_price: '',
            total: '',
            days: '',
            coefficient: '',
          }));
        });
      }
    });
    pushStudioGroup(group.name, rows);
  });

  if (includeMaintenance && maintenanceCharges.length > 0) {
    pushStudioGroup('Maintenance / SAV', maintenanceCharges.map((charge) => makeStudioTableRow({
      quantity: '1',
      designation: charge.label || 'Maintenance',
      discount: '-',
      unit_price: includeFinancialColumns ? formatCurrency(charge.amount || 0) : '',
      total: includeFinancialColumns ? formatCurrency(charge.amount || 0) : '',
      days: '1',
      coefficient: '-',
    })));
  }

  if (includeInsuranceServices && insuranceServiceRows.length > 0) {
    pushStudioGroup('Assurance', insuranceServiceRows.map((row) => makeStudioTableRow({
      quantity: '1',
      designation: row.title || 'Assurance',
      discount: '-',
      unit_price: includeFinancialColumns ? formatCurrency(row.unitPrice) : '',
      total: includeFinancialColumns ? formatCurrency(row.total) : '',
      days: String(row.days),
      coefficient: '-',
    })));
  }

  if (includePersonnelServices && personnelServiceRows.length > 0) {
    pushStudioGroup('Personnel', personnelServiceRows.map((row) => makeStudioTableRow({
      quantity: String(row.quantity),
      designation: row.title || 'Service personnel',
      discount: row.discountPercent > 0 ? `${row.discountPercent}%` : '-',
      unit_price: includeFinancialColumns ? formatCurrency(row.unitPrice) : '',
      total: includeFinancialColumns ? formatCurrency(row.total) : '',
      days: String(row.days),
      coefficient: '-',
    })));
  }

  if (includeOtherServices && otherServiceRows.length > 0) {
    pushStudioGroup('Autres services', otherServiceRows.map((row) => makeStudioTableRow({
      quantity: String(row.quantity),
      designation: row.title || 'Service',
      discount: '-',
      unit_price: includeFinancialColumns ? formatCurrency(row.unitPrice) : '',
      total: includeFinancialColumns ? formatCurrency(row.total) : '',
      days: String(row.days),
      coefficient: '-',
    })));
  }

  if (includeDelivery && deliveryTotal > 0) {
    pushStudioGroup('Livraison', [
      makeStudioTableRow({
        quantity: String(deliveryQuantity > 0 ? deliveryQuantity : 1),
        designation: deliveryDesignation,
        discount: '-',
        unit_price: includeFinancialColumns ? formatCurrency(deliveryUnitPrice) : '',
        total: includeFinancialColumns ? formatCurrency(deliveryTotal) : '',
        days: '1',
        coefficient: '-',
      }),
    ]);
  }

  const studioSnapshot = normalizeStudioTemplateSnapshot(studioTemplate);

  if (studioSnapshot) {
    const marginTopPt = mmToPt(studioSnapshot.margins.top);
    const marginBottomPt = mmToPt(studioSnapshot.margins.bottom);
    const marginLeftPt = mmToPt(studioSnapshot.margins.left);
    const marginRightPt = mmToPt(studioSnapshot.margins.right);
    const contentWidthPt = Math.max(20, A4_WIDTH - marginLeftPt - marginRightPt);
    const contentHeightPt = Math.max(20, A4_HEIGHT - marginTopPt - marginBottomPt - footerHeight);
    const backgroundImageSource = studioSnapshot.background.image
      ? toPdfImageSource(studioSnapshot.background.image)
      : null;

    const pdfSupportedFonts = ['Helvetica', 'Times-Roman', 'Courier'];
    const resolveFont = (font?: string) => {
      if (font && pdfSupportedFonts.includes(font)) return font;
      return pdfFontFamily;
    };
    const resolveTextAlign = (align?: string) => {
      if (align === 'left' || align === 'center' || align === 'right' || align === 'justify') return align;
      if (align === 'fill') return 'justify';
      return 'left';
    };

    const resolveBlockText = (block: StudioTemplateBlock) => {
      const html = typeof block.contentHtml === 'string' && block.contentHtml.trim().length > 0
        ? block.contentHtml
        : (block.text || '');
      const replaced = applyTemplateVariables(html, templateVariablesExtended);
      const lines = htmlToLines(replaced);
      if (lines.length > 0) return lines.join('\n');
      return applyTemplateVariables(block.text || '', templateVariablesExtended);
    };

    const getBlockSpacingStyle = (block: StudioTemplateBlock) => ({
      marginTop: mmToPt(block.marginTop),
      marginBottom: mmToPt(block.marginBottom),
      marginLeft: mmToPt(block.marginLeft),
      marginRight: mmToPt(block.marginRight),
    });

    const mapImageFit = (fit?: StudioTemplateBlock['imageFit']) => {
      if (fit === 'contain' || fit === 'fill' || fit === 'none') return fit;
      return 'cover';
    };

    const renderStudioBlock = (
      block: StudioTemplateBlock,
      key: string,
      scope: 'root' | 'nested' = 'root'
    ): React.ReactNode => {
      const isRoot = scope === 'root';
      const wantsFloating = isRoot && block.layoutMode === 'floating';
      const wantsSemiFixed = isRoot && block.type === 'zone' && block.layoutMode === 'semi-fixed';
      const baseWrapperStyle: Record<string, any> = wantsFloating
        ? (() => {
          const widthPt = Math.max(24, mmToPt(block.floatWidth ?? 120));
          const heightPt = Math.max(20, mmToPt(block.floatHeight ?? 20));
          const leftPt = clampValue(mmToPt(block.floatX ?? 0), 0, Math.max(0, contentWidthPt - widthPt));
          const topPt = clampValue(mmToPt(block.floatY ?? 0), 0, Math.max(0, contentHeightPt - heightPt));
          return {
            position: 'absolute',
            left: marginLeftPt + leftPt,
            top: marginTopPt + topPt,
            width: widthPt,
            minHeight: heightPt,
            zIndex: 4,
          };
        })()
        : getBlockSpacingStyle(block);

      if (block.type === 'title' || block.type === 'subtitle') {
        const text = resolveBlockText(block);
        const fontSize = Number.isFinite(block.fontSize) ? Math.max(7, Number(block.fontSize)) : (block.type === 'title' ? 18 : 14);
        return (
          <View key={key} style={baseWrapperStyle}>
            <Text
              style={{
                fontSize,
                fontFamily: resolveFont(block.fontFamily),
                color: block.textColor || '#111827',
                textAlign: resolveTextAlign(block.textAlign),
                fontWeight: block.bold ? 700 : (block.type === 'title' ? 700 : 500),
                fontStyle: block.italic ? 'italic' : 'normal',
                textDecoration: block.underline ? 'underline' : 'none',
                lineHeight: fontSize * 1.35,
              }}
            >
              {text}
            </Text>
          </View>
        );
      }

      if (block.type === 'separator') {
        const thickness = Number.isFinite(block.separatorThickness) ? Math.max(1, Number(block.separatorThickness)) : 2;
        const widthPercent = Number.isFinite(block.separatorWidthPercent) ? clampValue(Number(block.separatorWidthPercent), 10, 100) : 100;
        const radius = safeRadius(block.separatorRadius, 999);
        const align = block.separatorAlign || 'center';
        const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
        const styleType = block.separatorStyle || 'solid';
        const borderStyle = styleType === 'dashed' || styleType === 'dotted' ? styleType : 'solid';
        const color = block.separatorColor || '#64748b';
        const opacity = Number.isFinite(block.separatorOpacity) ? clampValue(Number(block.separatorOpacity) / 100, 0, 1) : 1;
        return (
          <View key={key} style={baseWrapperStyle}>
            <View style={{ width: '100%', alignItems: justify }}>
              <View
                style={{
                  width: `${widthPercent}%`,
                  borderTopWidth: thickness,
                  borderTopColor: color,
                  borderTopStyle: borderStyle,
                  borderRadius: radius,
                  opacity,
                }}
              />
            </View>
          </View>
        );
      }

      if (block.type === 'image' || block.type === 'qrcode') {
        const qrValue = rental.id || templateVariablesExtended.rental_id || templateVariablesExtended.rental_reference || '';
        const src = block.type === 'qrcode'
          ? toPdfImageSource(buildQrCodeImageUrl(qrValue))
          : (block.imageUrl ? toPdfImageSource(block.imageUrl) : null);
        const align = block.imageAlign || 'center';
        const imageWidthPercent = Number.isFinite(block.imageWidthPercent) ? clampValue(Number(block.imageWidthPercent), 10, 100) : 100;
        const imageHeightPt = Math.max(16, mmToPt(block.imageHeightMm ?? (block.type === 'qrcode' ? 35 : 40)));
        const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
        return (
          <View key={key} style={baseWrapperStyle}>
            <View style={{ width: '100%', alignItems: justify }}>
              {src ? (
                <Image
                  src={src}
                  style={{
                    width: `${imageWidthPercent}%`,
                    height: imageHeightPt,
                    objectFit: mapImageFit(block.imageFit),
                    borderRadius: safeRadius(block.imageBorderRadius, 0),
                    borderWidth: Number.isFinite(block.imageBorderWidth) ? Math.max(0, Number(block.imageBorderWidth)) : 0,
                    borderColor: block.imageBorderColor || '#94a3b8',
                    backgroundColor: block.imageBackgroundColor || (block.type === 'qrcode' ? '#ffffff' : 'transparent'),
                    opacity: Number.isFinite(block.imageOpacity) ? clampValue(Number(block.imageOpacity) / 100, 0, 1) : 1,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: `${imageWidthPercent}%`,
                    height: imageHeightPt,
                    borderWidth: 1,
                    borderColor: '#94a3b8',
                    borderStyle: 'dashed',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  >
                    <Text style={{ fontSize: 10, color: '#64748b' }}>
                    {block.type === 'qrcode' ? 'QR code' : (block.imageAlt || 'Image')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      }

      if (block.type === 'zone') {
        const children = Array.isArray(block.zoneChildren) ? block.zoneChildren : [];
        const hasGridChild = blockTreeContainsType(children, 'grid');
        const zoneBorderTransparent = !!block.zoneBorderTransparent;
        const zonePaddingMm = clampValue(typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3, 0, 30);
        const zonePaddingXMm = clampValue(
          typeof block.zonePaddingXMm === 'number' ? block.zonePaddingXMm : zonePaddingMm,
          0,
          30
        );
        const zonePaddingYMm = clampValue(
          typeof block.zonePaddingYMm === 'number' ? block.zonePaddingYMm : zonePaddingMm,
          0,
          30
        );
        const zoneOpacity = clampValue(typeof block.zoneOpacity === 'number' ? block.zoneOpacity : 100, 0, 100);
        const zoneBackgroundOpacity = clampValue(
          typeof block.zoneBackgroundOpacity === 'number'
            ? block.zoneBackgroundOpacity
            : zoneOpacity,
          0,
          100
        );
        const zoneBorderOpacity = clampValue(
          typeof block.zoneBorderOpacity === 'number'
            ? block.zoneBorderOpacity
            : (zoneBorderTransparent ? 0 : 100),
          0,
          100
        );
        const zoneBorderStyle: SimpleBorderStyle = block.zoneBorderStyle === 'dashed' || block.zoneBorderStyle === 'dotted'
          ? block.zoneBorderStyle
          : 'solid';
        const rawZoneBorderWidth = Number.isFinite(block.zoneBorderWidth) ? Math.max(0, Number(block.zoneBorderWidth)) : 0;
        const zoneBorderColor = block.zoneBorderColor || '#94a3b8';
        const zoneMinHeightPt = Math.max(20, mmToPt(block.zoneMinHeightMm ?? 45));
        const zoneMaxWidthMm = Math.max(10, contentWidthMm - Math.max(0, block.marginLeft ?? 0) - Math.max(0, block.marginRight ?? 0));
        const zoneSemiWidthPt = clampValue(mmToPt(block.floatWidth ?? 160), 24, mmToPt(zoneMaxWidthMm));
        const zoneSemiHeightPt = Math.max(20, mmToPt(block.floatHeight ?? 80));
        const zoneSemiOffsetXPt = clampValue(mmToPt(block.floatX ?? 0), 0, Math.max(0, mmToPt(zoneMaxWidthMm) - zoneSemiWidthPt));
        const zoneWrapperStyle: Record<string, any> = wantsSemiFixed
          ? {
            ...getBlockSpacingStyle(block),
            marginLeft: mmToPt(block.marginLeft ?? 0) + zoneSemiOffsetXPt,
            width: zoneSemiWidthPt,
            minHeight: zoneSemiHeightPt,
            height: zoneSemiHeightPt,
          }
          : baseWrapperStyle;
        const zoneBorderWidth = isLegacyZoneBorderStyle({
          width: rawZoneBorderWidth,
          color: zoneBorderColor,
          opacity: zoneBorderOpacity,
          style: zoneBorderStyle,
          transparent: zoneBorderTransparent,
        })
          ? 0
          : (hasGridChild ? 0 : rawZoneBorderWidth);
        return (
          <View
            key={key}
            style={[
              zoneWrapperStyle,
              {
                paddingHorizontal: mmToPt(zonePaddingXMm),
                paddingVertical: mmToPt(zonePaddingYMm),
                minHeight: wantsFloating || wantsSemiFixed ? undefined : zoneMinHeightPt,
                height: wantsFloating || wantsSemiFixed ? '100%' : undefined,
                backgroundColor: applyOpacityToColor(block.zoneBackgroundColor || '#ffffff', zoneBackgroundOpacity),
                borderWidth: zoneBorderWidth,
                borderColor: applyOpacityToColor(zoneBorderColor, zoneBorderOpacity),
                borderStyle: zoneBorderStyle,
                borderRadius: safeRadius(block.zoneBorderRadius, 6),
              },
            ]}
          >
            {children.map((child, index) => renderStudioBlock(child, `${key}_zone_${index}`, 'nested'))}
          </View>
        );
      }

      if (block.type === 'grid') {
        const configuredRows = Number.isFinite(block.gridRows) ? Math.max(1, Math.min(12, Number(block.gridRows))) : 2;
        const configuredColumns = Number.isFinite(block.gridColumns) ? Math.max(1, Math.min(12, Number(block.gridColumns))) : 2;
        const gridCellsRaw = Array.isArray(block.gridCells) ? block.gridCells : [];
        const normalizedCells = Array.from({ length: configuredRows * configuredColumns }, (_, idx) => (
          Array.isArray(gridCellsRaw[idx]) ? gridCellsRaw[idx] : []
        ));
        let rows = configuredRows;
        let columns = configuredColumns;
        const cellHasContent = (rowIndex: number, colIndex: number): boolean => {
          const idx = (rowIndex * configuredColumns) + colIndex;
          const cell = normalizedCells[idx];
          return Array.isArray(cell) && cell.length > 0;
        };

        while (rows > 1) {
          const lastRow = rows - 1;
          let hasContent = false;
          for (let col = 0; col < columns; col += 1) {
            if (cellHasContent(lastRow, col)) {
              hasContent = true;
              break;
            }
          }
          if (hasContent) break;
          rows -= 1;
        }

        while (columns > 1) {
          const lastCol = columns - 1;
          let hasContent = false;
          for (let row = 0; row < rows; row += 1) {
            if (cellHasContent(row, lastCol)) {
              hasContent = true;
              break;
            }
          }
          if (hasContent) break;
          columns -= 1;
        }

        const totalCells = rows * columns;
        const gridBorderTransparent = !!block.gridBorderTransparent;
        const gridDividerStyle: SimpleBorderStyle = block.gridDividerStyle === 'dashed' || block.gridDividerStyle === 'dotted'
          ? block.gridDividerStyle
          : 'solid';
        const gridCellPaddingXMm = clampValue(typeof block.gridCellPaddingXMm === 'number' ? block.gridCellPaddingXMm : 2, 0, 40);
        const gridCellPaddingYMm = clampValue(typeof block.gridCellPaddingYMm === 'number' ? block.gridCellPaddingYMm : 2, 0, 40);
        const gridCellMinHeightMm = clampValue(typeof block.gridCellMinHeightMm === 'number' ? block.gridCellMinHeightMm : 12, 2, 120);
        const gridBackgroundColor = typeof block.gridBackgroundColor === 'string' ? block.gridBackgroundColor : 'transparent';
        const gridCellBackgroundColor = typeof block.gridCellBackgroundColor === 'string' ? block.gridCellBackgroundColor : 'transparent';
        const gridOpacity = clampValue(typeof block.gridOpacity === 'number' ? block.gridOpacity : 100, 0, 100);
        const gridBorderOpacity = clampValue(
          typeof block.gridBorderOpacity === 'number'
            ? block.gridBorderOpacity
            : (gridBorderTransparent ? 0 : 100),
          0,
          100
        );
        const gridBackgroundOpacity = clampValue(
          typeof block.gridBackgroundOpacity === 'number'
            ? block.gridBackgroundOpacity
            : gridOpacity,
          0,
          100
        );
        const gridCellBackgroundOpacity = clampValue(
          typeof block.gridCellBackgroundOpacity === 'number'
            ? block.gridCellBackgroundOpacity
            : gridOpacity,
          0,
          100
        );
        const gridBorderRadius = clampValue(typeof block.gridBorderRadius === 'number' ? block.gridBorderRadius : 0, 0, 999);
        const dividerColor = applyOpacityToColor(block.gridDividerColor || '#94a3b8', gridBorderOpacity);
        const dividerWidth = Number.isFinite(block.gridDividerWidth) ? Math.max(0, Number(block.gridDividerWidth)) : 1;
        const borderStyles = normalizeGridBorders(block.gridBorders);
        const outerTopColor = applyOpacityToColor(borderStyles.top.color, gridBorderOpacity);
        const outerRightColor = applyOpacityToColor(borderStyles.right.color, gridBorderOpacity);
        const outerBottomColor = applyOpacityToColor(borderStyles.bottom.color, gridBorderOpacity);
        const outerLeftColor = applyOpacityToColor(borderStyles.left.color, gridBorderOpacity);
        const useGapDividers = dividerWidth > 0;
        const cells = Array.from({ length: totalCells }, (_, idx) => {
          const rowIndex = Math.floor(idx / columns);
          const colIndex = idx % columns;
          const sourceIndex = (rowIndex * configuredColumns) + colIndex;
          return Array.isArray(normalizedCells[sourceIndex]) ? normalizedCells[sourceIndex] : [];
        });

        return (
          <View
            key={key}
            style={[
              baseWrapperStyle,
              {
                borderTopWidth: 0,
                borderRightWidth: 0,
                borderBottomWidth: 0,
                borderLeftWidth: 0,
                borderTopColor: outerTopColor,
                borderRightColor: outerRightColor,
                borderBottomColor: outerBottomColor,
                borderLeftColor: outerLeftColor,
                borderRadius: gridBorderRadius,
                backgroundColor: applyOpacityToColor(gridBackgroundColor, gridBackgroundOpacity),
                overflow: 'hidden',
              },
            ]}
          >
            <View style={{ backgroundColor: useGapDividers ? dividerColor : 'transparent' }}>
              {Array.from({ length: rows }, (_, rowIndex) => (
                <View
                  key={`${key}_row_${rowIndex}`}
                  style={{
                    flexDirection: 'row',
                    marginBottom: useGapDividers && rowIndex < rows - 1 ? dividerWidth : 0,
                  }}
                >
                  {Array.from({ length: columns }, (_, colIndex) => {
                    const cellIndex = rowIndex * columns + colIndex;
                    const cellBlocks = cells[cellIndex] as StudioTemplateBlock[];
                    return (
                      <View
                        key={`${key}_cell_${cellIndex}`}
                        style={{
                          flexGrow: 1,
                          flexBasis: 0,
                          paddingHorizontal: mmToPt(gridCellPaddingXMm),
                          paddingVertical: mmToPt(gridCellPaddingYMm),
                          minHeight: mmToPt(gridCellMinHeightMm),
                          marginRight: useGapDividers && colIndex < columns - 1 ? dividerWidth : 0,
                          borderRightWidth: useGapDividers ? 0 : (colIndex === columns - 1 ? 0 : dividerWidth),
                          borderBottomWidth: useGapDividers ? 0 : (rowIndex === rows - 1 ? 0 : dividerWidth),
                          borderRightColor: useGapDividers ? 'transparent' : (colIndex === columns - 1 ? 'transparent' : dividerColor),
                          borderBottomColor: useGapDividers ? 'transparent' : (rowIndex === rows - 1 ? 'transparent' : dividerColor),
                          borderRightStyle: useGapDividers ? 'solid' : (colIndex === columns - 1 ? 'solid' : gridDividerStyle),
                          borderBottomStyle: useGapDividers ? 'solid' : (rowIndex === rows - 1 ? 'solid' : gridDividerStyle),
                          backgroundColor: applyOpacityToColor(gridCellBackgroundColor, gridCellBackgroundOpacity),
                        }}
                      >
                        {cellBlocks.map((child, childIndex) => renderStudioBlock(child, `${key}_cell_${cellIndex}_${childIndex}`, 'nested'))}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        );
      }

      if (block.type === 'table') {
        const requested = Array.isArray(block.tableColumns) ? block.tableColumns : [];
        const definitions = (requested.length > 0
          ? requested
          : STUDIO_TABLE_DEFAULT_COLUMNS)
          .map((keyName) => STUDIO_TABLE_COLUMN_DEFINITIONS.find((entry) => entry.key === keyName))
          .filter((entry): entry is StudioTableColumnDefinition => !!entry);
        const activeDefinitions = definitions.length > 0
          ? definitions
          : STUDIO_TABLE_COLUMN_DEFINITIONS.filter((entry) => STUDIO_TABLE_DEFAULT_COLUMNS.includes(entry.key));
        const showCategories = block.tableShowCategories ?? true;
        const borderWidth = Number.isFinite(block.tableBorderWidth) ? Math.max(0, Number(block.tableBorderWidth)) : 1;
        const borderRadius = safeRadius(block.tableBorderRadius, 12);
        const paddingX = Number.isFinite(block.tableCellPaddingX) ? Math.max(0, Number(block.tableCellPaddingX)) : 14;
        const paddingY = Number.isFinite(block.tableCellPaddingY) ? Math.max(0, Number(block.tableCellPaddingY)) : 10;
        const rowGap = Number.isFinite(block.tableRowGapPx) ? Math.max(0, Number(block.tableRowGapPx)) : 0;
        const fontSize = Number.isFinite(block.tableFontSizePt) ? Math.max(7, Number(block.tableFontSizePt)) : 12;
        const headerFontSize = Number.isFinite(block.tableHeaderFontSizePt) ? Math.max(7, Number(block.tableHeaderFontSizePt)) : 13;
        const headerBold = block.tableHeaderBold ?? true;
        const borderColor = block.tableBorderColor || '#cbd5e1';
        const headerBackground = block.tableHeaderBackground || '#0f172a';
        const headerTextColor = block.tableHeaderTextColor || '#f8fafc';
        const bodyBackground = block.tableBodyBackground || '#f8fafc';
        const categoryBackground = block.tableCategoryBackground || '#e2e8f0';
        const categoryTextColor = block.tableCategoryTextColor || '#0f172a';
        const totalWeight = activeDefinitions.reduce((sum, column) => sum + column.weight, 0) || 1;

        return (
          <View
            key={key}
            style={[
              baseWrapperStyle,
              {
                borderWidth,
                borderColor,
                borderRadius,
                overflow: 'hidden',
                backgroundColor: bodyBackground,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', backgroundColor: headerBackground, borderBottomWidth: borderWidth, borderBottomColor: borderColor }}>
              {activeDefinitions.map((definition, index) => (
                <Text
                  key={`${key}_head_${definition.key}`}
                  style={{
                    flexGrow: definition.weight,
                    flexBasis: 0,
                    maxWidth: `${(definition.weight / totalWeight) * 100}%`,
                    paddingHorizontal: paddingX,
                    paddingVertical: paddingY,
                    fontSize: headerFontSize,
                    fontWeight: headerBold ? 700 : 500,
                    color: headerTextColor,
                    textAlign: definition.align,
                    borderRightWidth: index === activeDefinitions.length - 1 ? 0 : borderWidth,
                    borderRightColor: borderColor,
                  }}
                >
                  {definition.label}
                </Text>
              ))}
            </View>
            <View style={{ gap: rowGap }}>
              {studioTableGroups.map((group, groupIndex) => (
                <View key={`${key}_group_${group.category}_${groupIndex}`}>
                  {showCategories && (
                    <Text
                      style={{
                        backgroundColor: categoryBackground,
                        color: categoryTextColor,
                        fontWeight: 700,
                        paddingHorizontal: paddingX,
                        paddingVertical: Math.max(6, paddingY),
                        borderBottomWidth: borderWidth,
                        borderBottomColor: borderColor,
                      }}
                    >
                      {group.category}
                    </Text>
                  )}
                  {group.rows.map((row, rowIndex) => (
                    <View
                      key={`${key}_${group.category}_${rowIndex}`}
                      wrap={false}
                      style={{ flexDirection: 'row', borderBottomWidth: borderWidth, borderBottomColor: borderColor, backgroundColor: bodyBackground }}
                    >
                      {activeDefinitions.map((definition, index) => (
                        <Text
                          key={`${key}_${group.category}_${rowIndex}_${definition.key}`}
                          style={{
                            flexGrow: definition.weight,
                            flexBasis: 0,
                            maxWidth: `${(definition.weight / totalWeight) * 100}%`,
                            paddingHorizontal: paddingX,
                            paddingVertical: paddingY,
                            fontSize,
                            color: block.textColor || '#0f172a',
                            textAlign: definition.align,
                            borderRightWidth: index === activeDefinitions.length - 1 ? 0 : borderWidth,
                            borderRightColor: borderColor,
                          }}
                        >
                          {row[definition.key] || ''}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        );
      }

      return null;
    };

    const flowBlocks = studioSnapshot.blocks.filter((block) => block.layoutMode !== 'floating');
    const floatingBlocks = studioSnapshot.blocks.filter((block) => block.layoutMode === 'floating');

    const renderFlowBlocks = (): React.ReactNode[] => {
      const nodes: React.ReactNode[] = [];
      const semiFixedZones = flowBlocks.filter((candidate) => candidate.type === 'zone' && candidate.layoutMode === 'semi-fixed');
      let semiFixedRendered = false;
      let index = 0;
      while (index < flowBlocks.length) {
        const block = flowBlocks[index];
        const isSemiFixedZone = block.type === 'zone' && block.layoutMode === 'semi-fixed';
        if (!isSemiFixedZone) {
          nodes.push(renderStudioBlock(block, `studio_flow_${index}`, 'root'));
          index += 1;
          continue;
        }

        if (!semiFixedRendered && semiFixedZones.length > 0) {
          nodes.push(
            <View
              key="studio_semifixed_row"
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}
            >
              {semiFixedZones.map((candidate, semiIndex) => renderStudioBlock(candidate, `studio_semifixed_${semiIndex}`, 'root'))}
            </View>
          );
          semiFixedRendered = true;
        }
        index += 1;
      }
      return nodes;
    };

    const docNode = (
      <Document>
        <Page
          size="A4"
          style={{
            paddingTop: marginTopPt,
            paddingBottom: marginBottomPt + footerHeight,
            paddingLeft: marginLeftPt,
            paddingRight: marginRightPt,
            fontSize: documentDesign.fontSize,
            fontFamily: pdfFontFamily,
            position: 'relative',
            backgroundColor: studioSnapshot.background.color || '#ffffff',
          }}
        >
          {backgroundImageSource && (
            <Image
              src={backgroundImageSource}
              fixed
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: A4_WIDTH,
                height: A4_HEIGHT,
                objectFit: studioSnapshot.background.size === 'contain' ? 'contain' : 'cover',
                opacity: clampValue(studioSnapshot.background.opacity / 100, 0, 1),
              }}
            />
          )}
          <View style={{ position: 'relative', minHeight: contentHeightPt }}>
            {renderFlowBlocks()}
            {floatingBlocks.map((block, index) => renderStudioBlock(block, `studio_float_${index}`, 'root'))}
          </View>
          {footerEnabled && documentDesign.legalFooterMode === 'last' && (
            <View style={styles.footerFlow}>
              {legalFooterLines.map((line, index) => (
                <Text key={`studio-footer-line-${index}`}>{line}</Text>
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
    return sanitizePdfTree(docNode);
  }

  const tableTokenMatch = resolvedHtml.match(/\[\[TABLE:([^\]]+)]]/i);
  const tableCols = tableTokenMatch
    ? tableTokenMatch[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : (docType === 'bon_prepa'
      ? ['equipment', 'type', 'qty', 'checkbox']
      : docType === 'facture'
        ? ['equipment', 'qty', 'pricePerDay', 'days', 'total']
        : ['equipment', 'type', 'qty', 'pricePerDay', 'days', 'total']);
  const columnCatalog: Record<string, { key: string; label: string; align?: 'right' | 'left' }> = {
    equipment: { key: 'equipment', label: 'Désignation' },
    type: { key: 'type', label: 'Type' },
    qty: { key: 'qty', label: 'Qté', align: 'right' },
    rem: { key: 'rem', label: 'Rem', align: 'right' },
    priceperday: { key: 'pricePerDay', label: 'PU', align: 'right' },
    pricePerDay: { key: 'pricePerDay', label: 'PU', align: 'right' },
    days: { key: 'days', label: 'Jours', align: 'right' },
    total: { key: 'total', label: 'Total', align: 'right' },
    checkbox: { key: 'checkbox', label: '✓', align: 'left' },
  };
  const columns = tableCols.map((key) => columnCatalog[key] || { key, label: key });

  const organizeColumns = (cols: Array<{ key: string; label: string; align?: 'right' | 'left' }>) => {
    const hasEquipment = cols.some((col) => col.key === 'equipment');
    const hasType = cols.some((col) => col.key === 'type');
    const filtered = hasEquipment ? cols.filter((col) => col.key !== 'type') : cols;
    const map = new Map(filtered.map((col) => [col.key, col]));
    const getColumn = (key: string) => map.get(key) || columnCatalog[key] || columnCatalog[key.toLowerCase()];
    if (hasEquipment && docType !== 'bon_prepa') {
      const ordered = ['qty', 'equipment', 'rem', 'pricePerDay', 'total']
        .map((key) => getColumn(key))
        .filter(Boolean) as Array<{ key: string; label: string; align?: 'right' | 'left' }>;
      const forcedColumns = ordered.length
        ? ordered
        : filtered;
      return { columns: forcedColumns, includeTypeInDesignation: hasType };
    }
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

  const { columns: orderedColumns, includeTypeInDesignation } = organizeColumns(columns);
  const totalFlex = orderedColumns.reduce((sum, col) => sum + getColumnFlex(col.key), 0);

  const parts = resolvedHtml.split(/\[\[TABLE:[^\]]+]]/i);
  const preLines = htmlToLines(parts[0]);
  const postLines = htmlToLines(parts[1]);
  const backgroundStyle = getPdfBackgroundStyle(documentDesign);
  const logoStyle = getPdfLogoStyle(documentDesign, company?.logoUrl);
  const docNode = (
    <Document>
      <Page size="A4" style={styles.page}>
        {backgroundStyle && <Image src={backgroundStyle.src} style={backgroundStyle.style} fixed />}
        {logoStyle && <Image src={logoStyle.src} style={logoStyle.style} fixed />}
        <Text style={styles.title}>{baseTitle}</Text>
        {showSplitInfo ? (
          <>
            {preLines.length > 0 && (
              <View style={{ marginTop: 6 }}>
                {preLines.map((line, index) => (<Text key={index}>{line}</Text>))}
              </View>
            )}
            <View style={styles.infoRow}>
              <View style={[styles.infoColumn, styles.infoColumnLeft]}>
                <Text style={styles.infoLine}>
                  <Text style={styles.infoLabel}>Date de location: </Text>
                  {formatDateTime(rental.start_date)}
                </Text>
                <Text style={styles.infoLine}>
                  <Text style={styles.infoLabel}>Nombre de jours: </Text>
                  {days}
                </Text>
                <Text style={styles.infoLine}>
                  <Text style={styles.infoLabel}>Référence: </Text>
                  {reference}
                </Text>
                <Text style={styles.infoLine}>
                  <Text style={styles.infoLabel}>Coefficient: </Text>
                  {effectiveEquipmentCoefficient.toFixed(2)}
                </Text>
                {deliveryLabel ? (
                  <Text style={styles.infoLine}>
                    <Text style={styles.infoLabel}>Livraison: </Text>
                    {deliveryLabel}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.infoColumn, styles.infoColumnRight]}>
                {representsCompany ? (
                  <>
                    <Text style={styles.infoLine}>
                      <Text style={styles.infoLabel}>Client: </Text>
                      {clientCompany}
                    </Text>
                    {clientName ? (
                      <Text style={styles.infoLine}>
                        À l'attention de {clientName}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.infoLine}>
                    <Text style={styles.infoLabel}>Client: </Text>
                    {clientName || 'Client'}
                  </Text>
                )}
                <Text style={styles.infoLine}>
                  <Text style={styles.infoLabel}>Profil client: </Text>
                  {clientProfileLabel}
                </Text>
                {billingAddress ? (
                  <Text style={styles.infoLine}>
                    <Text style={styles.infoLabel}>Adresse de facturation: </Text>
                    {billingAddress}
                  </Text>
                ) : null}
                {contactLine ? (
                  <Text style={styles.infoLine}>
                    <Text style={styles.infoLabel}>Contacts: </Text>
                    {contactLine}
                  </Text>
                ) : null}
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.muted}>Réf: {reference} • Client: {rental.client_name || ''}</Text>
            <Text style={styles.muted}>Profil client: {clientProfileLabel}</Text>
            <Text style={styles.muted}>Période: {new Date(rental.start_date).toLocaleString()} → {new Date(rental.end_date).toLocaleString()}</Text>
            {rental.location ? <Text style={styles.muted}>Lieu: {rental.location}</Text> : null}
            {preLines.length > 0 && (
              <View style={{ marginTop: 6 }}>
                {preLines.map((line, index) => (<Text key={index}>{line}</Text>))}
              </View>
            )}
          </>
        )}
        <View style={styles.table}>
          <View style={styles.headerRow}>
            {orderedColumns.map((col, idx) => (
              <Text
                key={col.key}
                style={[
                  styles.cell,
                  styles.headerCell,
                  { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                  col.align === 'right' ? styles.right : {},
                  idx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                ]}
              >
                {fitText(col.label, col.key)}
              </Text>
            ))}
          </View>
          {equipmentGroups.map((group, groupIdx) => (
            <React.Fragment key={`group-${group.id}`}>
              <View
                wrap={false}
                style={[
                  styles.bodyRow,
                  { backgroundColor: documentDesign.rowStripeColor },
                  { borderBottom: borderToken },
                ]}
              >
                <Text
                  style={[
                    styles.cell,
                    { flexGrow: totalFlex, flexBasis: 0, fontWeight: 600, borderRight: '0 solid transparent' },
                  ]}
                >
                  {fitText(group.name, 'equipment')}
                </Text>
              </View>
              {group.items.map((it, idx) => {
                const packItems = it.equipment_id ? safePackItemsByEquipmentId[it.equipment_id] : undefined;
                const hasPackItems = Boolean(packItems && packItems.length);
                if (hasPackItems && docType === 'bon_prepa') {
                  return (
                    <React.Fragment key={`equip-${group.id}-${idx}`}>
                      <View
                        wrap={false}
                        style={[
                          styles.bodyRow,
                          { borderBottom: borderToken },
                        ]}
                      >
                        {orderedColumns.map((col, colIdx) => {
                          let value: string | number = '';
                          if (col.key === 'equipment') {
                            value = stripPackLabel(it.equipment_name);
                          }
                          if (col.key === 'type') value = '';
                          if (col.key === 'qty') value = it.quantity;
                          if (col.key === 'rem') value = '';
                          if (col.key === 'pricePerDay') value = '';
                          if (col.key === 'days') value = '';
                          if (col.key === 'total') value = '';
                          if (col.key === 'checkbox') value = '[ ]';
                          return (
                            <Text
                              key={col.key}
                              style={[
                                styles.cell,
                                { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                                col.align === 'right' ? styles.right : {},
                                colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                              ]}
                            >
                              {fitText(String(value), col.key)}
                            </Text>
                          );
                        })}
                      </View>
                      {packItems!.map((packItem, detailIdx) => (
                        <View
                          key={`equip-${group.id}-${idx}-pack-${detailIdx}`}
                          wrap={false}
                          style={[
                            styles.bodyRow,
                            { borderBottom: borderToken },
                          ]}
                        >
                          {orderedColumns.map((col, colIdx) => {
                            let value: string | number = '';
                            if (col.key === 'equipment') value = `${packItem.quantity} x ${packItem.name}`;
                            if (col.key === 'type') value = '';
                            if (col.key === 'qty') value = packItem.quantity;
                            if (col.key === 'rem') value = '';
                            if (col.key === 'pricePerDay') value = '';
                            if (col.key === 'days') value = '';
                            if (col.key === 'total') value = '';
                            if (col.key === 'checkbox') value = '[ ]';
                            return (
                              <Text
                                key={`${col.key}-${detailIdx}`}
                                style={[
                                  styles.cell,
                                  { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                                  col.align === 'right' ? styles.right : {},
                                  colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                                  col.key === 'equipment' ? styles.kitDetailCell : {},
                                  col.key === 'equipment' ? styles.kitDetailText : {},
                                ]}
                              >
                                {fitText(String(value), col.key)}
                              </Text>
                            );
                          })}
                        </View>
                      ))}
                    </React.Fragment>
                  );
                }
                return (
                  <View
                    key={`equip-${group.id}-${idx}`}
                    wrap={false}
                    style={[
                      styles.bodyRow,
                      { borderBottom: borderToken },
                    ]}
                  >
                    {(() => {
                      const itemTypeForDocument = itemTypeById.get(it.id) || resolveDocumentEquipmentType(it);
                      return orderedColumns.map((col, colIdx) => {
                        let content: React.ReactNode = '';
                        if (col.key === 'equipment') {
                          if (hasPackItems) {
                            content = (
                              <>
                                {stripPackLabel(it.equipment_name)}
                                {packItems!.map((packItem, detailIdx) => (
                                  <Text key={`pack-line-${detailIdx}`} style={styles.kitDetailText}>
                                    {'\n'}{kitLinePrefix}{packItem.quantity} x {packItem.name}
                                  </Text>
                                ))}
                              </>
                            );
                          } else {
                            content = buildDesignation(it.equipment_name, itemTypeForDocument, includeTypeInDesignation, true);
                          }
                        }
                        if (col.key === 'type') content = hasPackItems ? '' : itemTypeForDocument;
                        if (col.key === 'qty') content = it.quantity;
                        if (col.key === 'rem') {
                          const discount = Number.isFinite(it.discount_percent)
                            ? Math.min(100, Math.max(0, Number(it.discount_percent)))
                            : 0;
                          content = discount > 0 ? `${discount}%` : '-';
                        }
                        if (col.key === 'pricePerDay') content = `${it.price_per_day.toFixed(2)}€`;
                        if (col.key === 'days') content = days;
                        if (col.key === 'total') {
                          const discount = Number.isFinite(it.discount_percent)
                            ? Math.min(100, Math.max(0, Number(it.discount_percent)))
                            : 0;
                          const lineTotal = it.price_per_day * it.quantity * effectiveEquipmentCoefficient * (1 - discount / 100);
                          content = `${lineTotal.toFixed(2)}€`;
                        }
                        if (col.key === 'checkbox') content = '[ ]';
                        const shouldSkipFit = hasPackItems && col.key === 'equipment';
                        const asString = typeof content === 'string' || typeof content === 'number'
                          ? String(content)
                          : '';
                        return (
                          <Text
                            key={col.key}
                            style={[
                              styles.cell,
                              { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                              col.align === 'right' ? styles.right : {},
                              colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                            ]}
                          >
                            {shouldSkipFit ? content : fitText(asString, col.key)}
                          </Text>
                        );
                      });
                    })()}
                  </View>
                );
              })}
            </React.Fragment>
          ))}
          {maintenanceCharges.length > 0 && (
            <React.Fragment>
              <View
                wrap={false}
                style={[
                  styles.bodyRow,
                  { backgroundColor: documentDesign.rowStripeColor },
                  { borderBottom: borderToken },
                ]}
              >
                <Text
                  style={[
                    styles.cell,
                    { flexGrow: totalFlex, flexBasis: 0, fontWeight: 600, borderRight: '0 solid transparent' },
                  ]}
                >
                  {fitText('Maintenance / SAV', 'equipment')}
                </Text>
              </View>
              {maintenanceCharges.map((charge, idx) => (
                <View
                  key={`maint-${idx}`}
                  wrap={false}
                  style={[
                    styles.bodyRow,
                    { borderBottom: borderToken },
                  ]}
                >
                  {orderedColumns.map((col, colIdx) => {
                    let value: string | number = '';
                    if (col.key === 'equipment') value = charge.label;
                    if (col.key === 'type') value = 'Maintenance / SAV';
                    if (col.key === 'qty') value = 1;
                    if (col.key === 'rem') value = '';
                    if (col.key === 'pricePerDay') value = `${(charge.amount || 0).toFixed(2)}€`;
                    if (col.key === 'days') value = 1;
                    if (col.key === 'total') value = `${(charge.amount || 0).toFixed(2)}€`;
                    if (col.key === 'checkbox') value = '';
                    return (
                      <Text
                        key={col.key}
                        style={[
                          styles.cell,
                          { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                          col.align === 'right' ? styles.right : {},
                          colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                        ]}
                      >
                        {fitText(String(value), col.key)}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </React.Fragment>
          )}
          {insuranceServiceRows.length > 0 && (
            <React.Fragment>
              <View
                wrap={false}
                style={[
                  styles.bodyRow,
                  { backgroundColor: documentDesign.rowStripeColor },
                  { borderBottom: borderToken },
                ]}
              >
                <Text
                  style={[
                    styles.cell,
                    { flexGrow: totalFlex, flexBasis: 0, fontWeight: 600, borderRight: '0 solid transparent' },
                  ]}
                >
                  {fitText('Assurance', 'equipment')}
                </Text>
              </View>
              {insuranceServiceRows.map((row) => (
                <View
                  key={`insurance-${row.id}`}
                  wrap={false}
                  style={[
                    styles.bodyRow,
                    { borderBottom: borderToken },
                  ]}
                >
                  {orderedColumns.map((col, colIdx) => {
                    let value: string | number = '';
                    if (col.key === 'equipment') value = row.title;
                    if (col.key === 'type') value = 'Service assurance';
                    if (col.key === 'qty') value = 1;
                    if (col.key === 'rem') value = '';
                    if (col.key === 'pricePerDay') value = `${row.unitPrice.toFixed(2)}€`;
                    if (col.key === 'days') value = row.days;
                    if (col.key === 'total') value = `${row.total.toFixed(2)}€`;
                    if (col.key === 'checkbox') value = '';
                    return (
                      <Text
                        key={col.key}
                        style={[
                          styles.cell,
                          { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                          col.align === 'right' ? styles.right : {},
                          colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                        ]}
                      >
                        {fitText(String(value), col.key)}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </React.Fragment>
          )}
          {personnelServiceRows.length > 0 && (
            <React.Fragment>
              <View
                wrap={false}
                style={[
                  styles.bodyRow,
                  { backgroundColor: documentDesign.rowStripeColor },
                  { borderBottom: borderToken },
                ]}
              >
                <Text
                  style={[
                    styles.cell,
                    { flexGrow: totalFlex, flexBasis: 0, fontWeight: 600, borderRight: '0 solid transparent' },
                  ]}
                >
                  {fitText('Personnel', 'equipment')}
                </Text>
              </View>
              {personnelServiceRows.map((row) => (
                <View
                  key={`personnel-${row.id}`}
                  wrap={false}
                  style={[
                    styles.bodyRow,
                    { borderBottom: borderToken },
                  ]}
                >
                  {orderedColumns.map((col, colIdx) => {
                    let value: string | number = '';
                    if (col.key === 'equipment') value = row.title;
                    if (col.key === 'type') value = 'Service personnel';
                    if (col.key === 'qty') value = row.quantity;
                    if (col.key === 'rem') value = row.discountPercent > 0 ? `${row.discountPercent}%` : '-';
                    if (col.key === 'pricePerDay') value = `${row.unitPrice.toFixed(2)}€`;
                    if (col.key === 'days') value = row.days;
                    if (col.key === 'total') value = `${row.total.toFixed(2)}€`;
                    if (col.key === 'checkbox') value = '';
                    return (
                      <Text
                        key={col.key}
                        style={[
                          styles.cell,
                          { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                          col.align === 'right' ? styles.right : {},
                          colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                        ]}
                      >
                        {fitText(String(value), col.key)}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </React.Fragment>
          )}
          {otherServiceRows.length > 0 && (
            <React.Fragment>
              <View
                wrap={false}
                style={[
                  styles.bodyRow,
                  { backgroundColor: documentDesign.rowStripeColor },
                  { borderBottom: borderToken },
                ]}
              >
                <Text
                  style={[
                    styles.cell,
                    { flexGrow: totalFlex, flexBasis: 0, fontWeight: 600, borderRight: '0 solid transparent' },
                  ]}
                >
                  {fitText('Autre', 'equipment')}
                </Text>
              </View>
              {otherServiceRows.map((row) => (
                <View
                  key={`other-${row.id}`}
                  wrap={false}
                  style={[
                    styles.bodyRow,
                    { borderBottom: borderToken },
                  ]}
                >
                  {orderedColumns.map((col, colIdx) => {
                    let value: string | number = '';
                    if (col.key === 'equipment') value = row.title;
                    if (col.key === 'type') value = 'Autre service';
                    if (col.key === 'qty') value = row.quantity;
                    if (col.key === 'rem') value = '';
                    if (col.key === 'pricePerDay') value = `${row.unitPrice.toFixed(2)}€`;
                    if (col.key === 'days') value = row.days;
                    if (col.key === 'total') value = `${row.total.toFixed(2)}€`;
                    if (col.key === 'checkbox') value = '';
                    return (
                      <Text
                        key={col.key}
                        style={[
                          styles.cell,
                          { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                          col.align === 'right' ? styles.right : {},
                          colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                        ]}
                      >
                        {fitText(String(value), col.key)}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </React.Fragment>
          )}
          {includeDelivery && deliveryTotal > 0 && (
            <React.Fragment>
              <View
                wrap={false}
                style={[
                  styles.bodyRow,
                  { backgroundColor: documentDesign.rowStripeColor },
                  { borderBottom: borderToken },
                ]}
              >
                <Text
                  style={[
                    styles.cell,
                    { flexGrow: totalFlex, flexBasis: 0, fontWeight: 600, borderRight: '0 solid transparent' },
                  ]}
                >
                  {fitText('Livraison', 'equipment')}
                </Text>
              </View>
              <View
                wrap={false}
                style={[
                  styles.bodyRow,
                  { borderBottom: borderToken },
                ]}
              >
                {orderedColumns.map((col, colIdx) => {
                  let value: string | number = '';
                  if (col.key === 'equipment') value = deliveryDesignation;
                  if (col.key === 'type') value = 'Service transport';
                  if (col.key === 'qty') value = deliveryQuantity > 0 ? deliveryQuantity : 1;
                  if (col.key === 'rem') value = '';
                  if (col.key === 'pricePerDay') value = `${deliveryUnitPrice.toFixed(2)}€`;
                  if (col.key === 'days') value = 1;
                  if (col.key === 'total') value = `${deliveryTotal.toFixed(2)}€`;
                  if (col.key === 'checkbox') value = '';
                  return (
                    <Text
                      key={col.key}
                      style={[
                        styles.cell,
                        { flexGrow: getColumnFlex(col.key), flexBasis: 0 },
                        col.align === 'right' ? styles.right : {},
                        colIdx === orderedColumns.length - 1 ? { borderRight: '0 solid transparent' } : {},
                      ]}
                    >
                      {fitText(String(value), col.key)}
                    </Text>
                  );
                })}
              </View>
            </React.Fragment>
          )}
        </View>
        {docType !== 'bon_prepa' && (
          <>
            <View style={styles.summaryRowWrap}>
              <View style={[styles.summaryCard, styles.summaryCardLeft]}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Assurance</Text>
                  <Text style={styles.summaryValue}>{serviceInsurance.toFixed(2)}€</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Transport</Text>
                  <Text style={styles.summaryValue}>{serviceTransport.toFixed(2)}€</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Personnel</Text>
                  <Text style={styles.summaryValue}>{servicePersonnel.toFixed(2)}€</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Autre</Text>
                  <Text style={styles.summaryValue}>{serviceOther.toFixed(2)}€</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, styles.summaryStrong]}>Services</Text>
                  <Text style={[styles.summaryValue, styles.summaryStrong]}>{servicesTotal.toFixed(2)}€</Text>
                </View>
              </View>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Location</Text>
                  <Text style={styles.summaryValue}>{equipmentTotal.toFixed(2)}€</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Services</Text>
                  <Text style={styles.summaryValue}>{servicesTotal.toFixed(2)}€</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Sous-total</Text>
                  <Text style={styles.summaryValue}>{base.toFixed(2)}€</Text>
                </View>
                {discount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Remise</Text>
                    <Text style={styles.summaryValue}>-{discount.toFixed(2)}€</Text>
                  </View>
                )}
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, styles.summaryStrong]}>Total</Text>
                  <Text style={[styles.summaryValue, styles.summaryStrong]}>{totalTTC.toFixed(2)}€</Text>
                </View>
              </View>
            </View>
            {docType === 'facture' && depositTotal > 0 && (
              <Text style={{ marginTop: 6 }}>Acomptes déjà perçus: -{depositTotal.toFixed(2)}€</Text>
            )}
            {docType === 'facture' && otherPaymentsTotal > 0 && (
              <Text>Paiements enregistrés: -{otherPaymentsTotal.toFixed(2)}€</Text>
            )}
            {docType === 'facture' && (
              <Text style={{ fontWeight: 600, marginTop: 4 }}>Montant restant dû: {remainingDue.toFixed(2)}€</Text>
            )}
          </>
        )}
        {postLines.length > 0 && (
          <View style={{ marginTop: 8 }}>
            {postLines.map((line, index) => (<Text key={index}>{line}</Text>))}
          </View>
        )}
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
  return sanitizePdfTree(docNode);
};
