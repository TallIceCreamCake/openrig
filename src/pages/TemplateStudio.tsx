import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Blend, ChevronLeft, ChevronRight, Columns2, Copy, CornerDownRight, GripVertical, Image as ImageIcon, Layers, Link2, Link2Off, Maximize2, Minus, MoveHorizontal, MoveVertical, Palette, PenLine, Plus, QrCode, Rows2, Ruler, Save, SlidersHorizontal, SquareStack, Table2, Trash2, Type as TypeIcon, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ContentState, EditorState, Modifier, SelectionState, convertFromHTML, convertToRaw } from 'draft-js';
import draftToHtml from 'draftjs-to-html';
import { Editor } from 'react-draft-wysiwyg';
import { useLocation } from 'react-router-dom';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { supabase } from '../lib/supabase';
import { ColorPickerButton } from '../components/ui-kit';
import {
  TEMPLATE_STUDIO_DOC_PARAM,
  TEMPLATE_STUDIO_DOCUMENT_TYPES,
  TEMPLATE_STUDIO_SAVE_EVENT,
  TEMPLATE_STUDIO_PDF_PREVIEW_REQUEST,
  TEMPLATE_STUDIO_PDF_PREVIEW_READY,
  TEMPLATE_STUDIO_DOM_CAPTURE_REQUEST,
  TEMPLATE_STUDIO_DOM_CAPTURE_READY,
  getTemplateStudioDocumentLabel,
  normalizeTemplateStudioDocumentType,
} from '../constants/templateStudio';
import 'react-draft-wysiwyg/dist/react-draft-wysiwyg.css';

type TextLayoutMode = 'flow' | 'floating' | 'semi-fixed';
type SeparatorStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'gradient' | 'glow';
type SimpleBorderStyle = 'solid' | 'dashed' | 'dotted';
type SeparatorAlign = 'left' | 'center' | 'right';
type ImageFit = 'cover' | 'contain' | 'fill' | 'none';
type ImageAlign = 'left' | 'center' | 'right';
type BackgroundSizeMode = 'cover' | 'contain' | 'auto';
type PageBreakReplicationMode = 'fixed' | 'flow';
type PageBreakAnchor = 'top' | 'bottom';
type FollowPosition = 'below' | 'above' | 'left' | 'right';
type FollowAlign = 'start' | 'center' | 'end';
type TableDataSource = 'equipment_by_category';
type TableColumnKey = 'quantity' | 'designation' | 'discount' | 'unit_price' | 'total' | 'days' | 'coefficient' | 'checkbox';
type TableTextAlign = 'auto' | 'left' | 'center' | 'right';
type TableTextAlignValue = Exclude<TableTextAlign, 'auto'>;
type TableColumnAlignMap = Partial<Record<TableColumnKey, TableTextAlignValue>>;
type TableTextTargetKind = 'header' | 'category' | 'body';
type TableTextSelection = {
  blockId: string;
  kind: TableTextTargetKind;
  columnKey?: TableColumnKey;
};
type FlowDropPosition = 'before' | 'after';
type PageBandZone = 'header' | 'footer';
type PageBandSide = 'left' | 'center' | 'right';
type PageBandFieldKey = `${PageBandZone}.${PageBandSide}`;
type PageBandSlots = Record<PageBandSide, string>;
type PageBandSettings = {
  enabled: boolean;
  fontSizePt: number;
  textColor: string;
  topOffsetMm: number;
  bottomOffsetMm: number;
  sidePaddingMm: number;
  header: PageBandSlots;
  footer: PageBandSlots;
};

type StudioUndoSnapshot = {
  zoom: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  pageBackgroundColor: string;
  pageBackgroundImage: string;
  pageBackgroundOpacity: number;
  pageBackgroundSize: BackgroundSizeMode;
  pageBandSettings: PageBandSettings;
  linkVertical: boolean;
  linkHorizontal: boolean;
  blocks: TemplateBlock[];
  layerGroups: LayerGroup[];
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  selectedTableText: TableTextSelection | null;
  tablePreviewSimulationByBlockId: Record<string, TablePreviewSimulationSettings>;
  savedTemplates: StudioNamedTemplate[];
  activeSavedTemplateId: string | null;
  savedTemplateName: string;
  libraryActiveByDoc: Record<string, string>;
};

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_TO_PX = 96 / 25.4;
const UNDO_HISTORY_LIMIT = 120;

const SettingsFieldLabel = ({
  icon: Icon,
  label,
  className = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className?: string;
}) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#cbd5e1] ${className}`}>
    <Icon className="h-3.5 w-3.5 text-[#8fb3de]" />
    <span>{label}</span>
  </span>
);

type TemplateBlock = {
  id: string;
  type: 'title' | 'subtitle' | 'separator' | 'grid' | 'image' | 'qrcode' | 'zone' | 'table';
  text: string;
  contentHtml?: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  linkVertical: boolean;
  linkHorizontal: boolean;
  fontSize: number;
  fontFamily: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textColor?: string;
  layoutMode?: TextLayoutMode;
  floatX?: number;
  floatY?: number;
  floatWidth?: number;
  floatHeight?: number;
  separatorStyle?: SeparatorStyle;
  separatorThickness?: number;
  separatorWidthPercent?: number;
  separatorRadius?: number;
  separatorColor?: string;
  separatorSecondaryColor?: string;
  separatorOpacity?: number;
  separatorAlign?: SeparatorAlign;
  gridRows?: number;
  gridColumns?: number;
  gridCells?: TemplateBlock[][];
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
  imageFit?: ImageFit;
  imageAlign?: ImageAlign;
  imageWidthPercent?: number;
  imageHeightMm?: number;
  imageOpacity?: number;
  imageBorderRadius?: number;
  imageBorderWidth?: number;
  imageBorderColor?: string;
  imageShadow?: boolean;
  imageBackgroundColor?: string;
  imageRotation?: number;
  zoneChildren?: TemplateBlock[];
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
  zoneShadow?: boolean;
  tableDataSource?: TableDataSource;
  tableColumns?: TableColumnKey[];
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
  tableHeaderTextAlign?: TableTextAlign;
  tableCategoryTextAlign?: Exclude<TableTextAlign, 'auto'>;
  tableBodyTextAlign?: TableTextAlign;
  tableHeaderColumnAlign?: TableColumnAlignMap;
  tableBodyColumnAlign?: TableColumnAlignMap;
  pageBreakReplicate?: boolean;
  pageBreakMode?: PageBreakReplicationMode;
  pageBreakAnchor?: PageBreakAnchor;
  pageBreakOffsetMm?: number;
  pageBreakFlowGapMm?: number;
  followEnabled?: boolean;
  followTargetId?: string | null;
  followPosition?: FollowPosition;
  followAlign?: FollowAlign;
  followGapMm?: number;
  followOffsetXMm?: number;
  followOffsetYMm?: number;
};

type StudioBlockType = 'title' | 'subtitle' | 'separator' | 'grid' | 'image' | 'qrcode' | 'zone' | 'table';

type GridBorderSide = 'top' | 'right' | 'bottom' | 'left';

type GridBorderStyle = {
  color: string;
  width: number;
};

type GridBorderSet = Record<GridBorderSide, GridBorderStyle>;

type BlockContextMenu = {
  blockId: string;
  x: number;
  y: number;
  selectedIds: string[];
};

type LayerGroup = {
  id: string;
  name: string;
  blockIds: string[];
};

type LayerEntry = {
  id: string;
  type: StudioBlockType;
  label: string;
  depth: number;
};

type StudioNamedTemplate = {
  id: string;
  name: string;
  studio_by_doc?: Record<string, Record<string, any>>;
  created_at?: string;
  updated_at?: string;
};

type StudioCommonLibrary = {
  templates: StudioNamedTemplate[];
  activeTemplateByDoc: Record<string, string>;
};

type StudioVariable = {
  key: string;
  label: string;
  placeholder: string;
};

type StudioVariableGroup = {
  id: string;
  label: string;
  variables: StudioVariable[];
};

type BlockRenderScope = 'root' | 'nested';

type FloatingResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

type FloatingInteraction = {
  blockId: string;
  mode: 'drag' | 'resize';
  layoutMode: 'floating' | 'semi-fixed';
  handle?: FloatingResizeHandle;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  maxWidthMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
  contentRect: DOMRect;
};

const DEFAULT_FONT_FAMILIES = [
  'Inter',
  'Helvetica',
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier New',
];

const DEFAULT_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

const TABLE_COLUMN_DEFINITIONS: Array<{ key: TableColumnKey; label: string; align: 'left' | 'right' | 'center'; weight: number }> = [
  { key: 'quantity', label: 'Qté', align: 'right', weight: 0.85 },
  { key: 'designation', label: 'Désignation', align: 'left', weight: 2.35 },
  { key: 'discount', label: 'Rem', align: 'right', weight: 0.85 },
  { key: 'unit_price', label: 'PU', align: 'right', weight: 1.15 },
  { key: 'total', label: 'Total', align: 'right', weight: 1.25 },
  { key: 'days', label: 'Jours', align: 'right', weight: 0.8 },
  { key: 'coefficient', label: 'Coef', align: 'right', weight: 0.85 },
  { key: 'checkbox', label: 'Case à cocher', align: 'center', weight: 0.6 },
];

const DEFAULT_TABLE_COLUMNS: TableColumnKey[] = ['quantity', 'designation', 'discount', 'unit_price', 'total'];

const TABLE_COLUMN_KEY_SET = new Set<TableColumnKey>(TABLE_COLUMN_DEFINITIONS.map((entry) => entry.key));
const TABLE_COLUMN_LABEL_MAP = new Map<TableColumnKey, string>(
  TABLE_COLUMN_DEFINITIONS.map((entry) => [entry.key, entry.label])
);
const DEFAULT_PAGE_BAND_SETTINGS: PageBandSettings = {
  enabled: false,
  fontSizePt: 9,
  textColor: '#334155',
  topOffsetMm: 4,
  bottomOffsetMm: 4,
  sidePaddingMm: 3,
  header: {
    left: '',
    center: '',
    right: '',
  },
  footer: {
    left: '',
    center: '',
    right: '',
  },
};

const normalizePageBandSlots = (value: unknown): PageBandSlots => {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    left: typeof raw.left === 'string' ? raw.left : '',
    center: typeof raw.center === 'string' ? raw.center : '',
    right: typeof raw.right === 'string' ? raw.right : '',
  };
};

const normalizePageBandSettings = (value: unknown): PageBandSettings => {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const readNumber = (candidate: unknown, fallback: number): number => (
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? candidate
      : fallback
  );
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_PAGE_BAND_SETTINGS.enabled,
    fontSizePt: clampValue(readNumber(raw.fontSizePt, DEFAULT_PAGE_BAND_SETTINGS.fontSizePt), 6, 24),
    textColor: typeof raw.textColor === 'string' ? raw.textColor : DEFAULT_PAGE_BAND_SETTINGS.textColor,
    topOffsetMm: clampValue(readNumber(raw.topOffsetMm, DEFAULT_PAGE_BAND_SETTINGS.topOffsetMm), 0, 40),
    bottomOffsetMm: clampValue(readNumber(raw.bottomOffsetMm, DEFAULT_PAGE_BAND_SETTINGS.bottomOffsetMm), 0, 40),
    sidePaddingMm: clampValue(readNumber(raw.sidePaddingMm, DEFAULT_PAGE_BAND_SETTINGS.sidePaddingMm), 0, 40),
    header: normalizePageBandSlots(raw.header),
    footer: normalizePageBandSlots(raw.footer),
  };
};

const isTableColumnKey = (value: unknown): value is TableColumnKey => (
  typeof value === 'string' && TABLE_COLUMN_KEY_SET.has(value as TableColumnKey)
);

const sanitizeTableColumnAlignMap = (value: unknown): TableColumnAlignMap => {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const map: TableColumnAlignMap = {};
  Object.entries(raw).forEach(([key, align]) => {
    if (!isTableColumnKey(key)) return;
    if (align === 'left' || align === 'center' || align === 'right') {
      map[key] = align;
    }
  });
  return map;
};

const getTableColumnLabel = (key: TableColumnKey): string => (
  TABLE_COLUMN_LABEL_MAP.get(key) ?? key
);

const isFlowLayoutBlock = (block: TemplateBlock): boolean => (
  (block.layoutMode ?? 'flow') !== 'floating'
);

type TablePreviewItem = {
  quantity: number;
  price_per_day: number;
  discount_percent?: number | null;
  equipment_type?: string | null;
  external_type?: string | null;
  external_subtype?: string | null;
  is_external?: boolean | null;
  equipment_name?: string | null;
  external_name?: string | null;
  equipment?: {
    name?: string | null;
    type?: string | null;
  } | null;
};

type TablePreviewRentalSource = {
  start_date?: string | null;
  end_date?: string | null;
  rental_coefficient_override?: number | null;
  rental_items?: TablePreviewItem[] | null;
};

type TablePreviewGroup = {
  category: string;
  items: Array<Record<TableColumnKey, string>>;
};

type TablePreviewSimulationSettings = {
  enabled: boolean;
  targetRows: number;
};

const TABLE_FALLBACK_DATA = [
  {
    category: 'Vidéo',
    items: [
      {
        designation: 'Sony ZVe10 Vidéo',
        quantity: '1',
        discount: '-',
        unit_price: '25.00 EUR',
        total: '37.50 EUR',
        days: '3',
        coefficient: '1.5',
        checkbox: '□',
      },
    ],
  },
  {
    category: 'Autre',
    items: [
      {
        designation: 'Montage Vidéo Basique',
        quantity: '1',
        discount: '0%',
        unit_price: '130.00 EUR',
        total: '130.00 EUR',
        days: '1',
        coefficient: '1.0',
        checkbox: '□',
      },
    ],
  },
];

const TABLE_SIMULATION_DEFAULT_ROWS = 80;
const TABLE_SIMULATION_MIN_ROWS = 20;
const TABLE_SIMULATION_MAX_ROWS = 400;
const TABLE_SIMULATION_DESIGNATION_SEEDS = [
  'Pack caméras',
  'Micro HF',
  'Console audio',
  'Projecteur LED',
  'Structure aluminium',
  'Diffusion façade',
  'Régie mobile',
  'Kit intercom',
  'Habillage scène',
  'Transport utilitaire',
  'Technicien plateau',
  'Technicien son',
  'Technicien lumière',
  'Montage / démontage',
  'Support exploitation',
  'Maintenance site',
];

const createDefaultTableSimulationSettings = (): TablePreviewSimulationSettings => ({
  enabled: false,
  targetRows: TABLE_SIMULATION_DEFAULT_ROWS,
});

const buildSimulatedTableGroups = (
  sourceGroups: TablePreviewGroup[],
  requestedRows: number
): TablePreviewGroup[] => {
  const safeGroups = sourceGroups.length > 0 ? sourceGroups : TABLE_FALLBACK_DATA;
  const targetRows = clampValue(
    Math.round(Number.isFinite(requestedRows) ? requestedRows : TABLE_SIMULATION_DEFAULT_ROWS),
    TABLE_SIMULATION_MIN_ROWS,
    TABLE_SIMULATION_MAX_ROWS
  );

  const clonedGroups = safeGroups.map((group) => ({
    category: group.category,
    items: group.items.map((item) => ({ ...item })),
  }));

  const existingRows = clonedGroups.reduce((sum, group) => sum + group.items.length, 0);
  if (existingRows >= targetRows) return clonedGroups;

  const categories = Array.from(
    new Set([
      ...clonedGroups.map((group) => group.category).filter((value) => value.trim().length > 0),
      'Services',
      'Transport',
      'Personnel',
      'Autre',
    ])
  );

  const byCategory = new Map<string, Array<Record<TableColumnKey, string>>>();
  clonedGroups.forEach((group) => {
    byCategory.set(group.category, [...group.items]);
  });
  categories.forEach((category) => {
    if (!byCategory.has(category)) byCategory.set(category, []);
  });

  const rowsToGenerate = targetRows - existingRows;
  for (let index = 0; index < rowsToGenerate; index += 1) {
    const category = categories[index % categories.length];
    const quantity = (index % 4) + 1;
    const days = (index % 6) + 1;
    const unitPrice = 12 + ((index * 11) % 240);
    const coefficient = 1 + ((index % 4) * 0.25);
    const discount = index % 7 === 0 ? 10 : index % 5 === 0 ? 5 : 0;
    const total = unitPrice * quantity * days * coefficient * (1 - discount / 100);
    const designationSeed = TABLE_SIMULATION_DESIGNATION_SEEDS[index % TABLE_SIMULATION_DESIGNATION_SEEDS.length];
    const designation = `${designationSeed} ${String(index + 1).padStart(2, '0')}`;

    const row: Record<TableColumnKey, string> = {
      quantity: String(quantity),
      designation,
      discount: discount > 0 ? `${discount}%` : '-',
      unit_price: formatTableMoney(unitPrice),
      total: formatTableMoney(total),
      days: String(days),
      coefficient: coefficient.toFixed(2),
      checkbox: '□',
    };

    byCategory.get(category)!.push(row);
  }

  const orderedResult = categories
    .map((category) => ({
      category,
      items: byCategory.get(category) ?? [],
    }))
    .filter((group) => group.items.length > 0);

  return orderedResult.length > 0 ? orderedResult : clonedGroups;
};

const getTableCategoryType = (item: TablePreviewItem): string => {
  const equipmentType = typeof item.equipment?.type === 'string'
    ? item.equipment.type.trim()
    : (typeof item.equipment_type === 'string' ? item.equipment_type.trim() : '');
  const externalType = typeof item.external_type === 'string' ? item.external_type.trim() : '';

  // For documents we only group by the base type (not subtype).
  if (item.is_external) {
    if (externalType) return externalType;
    if (equipmentType) return equipmentType;
    return 'Externe';
  }
  if (equipmentType) return equipmentType;
  return 'Autre';
};

const getTableDesignation = (item: TablePreviewItem): string => {
  const equipmentName = typeof item.equipment?.name === 'string' ? item.equipment.name.trim() : '';
  const externalName = typeof item.external_name === 'string' ? item.external_name.trim() : '';
  const inlineName = typeof item.equipment_name === 'string' ? item.equipment_name.trim() : '';
  return equipmentName || externalName || inlineName || 'Équipement';
};

const formatTableMoney = (value: number): string => `${value.toFixed(2)} EUR`;

const buildPreviewTableGroupsFromRental = (source: TablePreviewRentalSource | null | undefined): TablePreviewGroup[] => {
  const items = Array.isArray(source?.rental_items) ? source!.rental_items! : [];
  if (items.length === 0) return TABLE_FALLBACK_DATA;

  const startDate = source?.start_date ? new Date(source.start_date) : null;
  const endDate = source?.end_date ? new Date(source.end_date) : null;
  const diffDays = startDate && endDate
    ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : 1;
  const days = Math.max(1, Number.isFinite(diffDays) ? diffDays : 1);

  const override = Number(source?.rental_coefficient_override ?? null);
  const coefficient = Number.isFinite(override) && override > 0 ? override : days;

  const grouped = new Map<string, Array<Record<TableColumnKey, string>>>();

  items.forEach((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitPrice = Number.isFinite(Number(item.price_per_day)) ? Number(item.price_per_day) : 0;
    const discount = clampValue(Number(item.discount_percent || 0), 0, 100);
    const lineTotal = unitPrice * quantity * coefficient * (1 - discount / 100);
    const category = getTableCategoryType(item);

    const row: Record<TableColumnKey, string> = {
      quantity: String(quantity),
      designation: getTableDesignation(item),
      discount: discount > 0 ? `${discount}%` : '-',
      unit_price: formatTableMoney(unitPrice),
      total: formatTableMoney(lineTotal),
      days: String(days),
      coefficient: String(coefficient),
      checkbox: '□',
    };

    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(row);
  });

  const sortedGroups = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([category, categoryItems]) => ({
      category,
      items: categoryItems,
    }));

  return sortedGroups.length > 0 ? sortedGroups : TABLE_FALLBACK_DATA;
};

const STUDIO_VARIABLE_GROUPS: StudioVariableGroup[] = [
  {
    id: 'project',
    label: 'Projet / Document',
    variables: [
      { key: 'rental_id', label: 'ID projet', placeholder: 'a1b2c3d4-e5f6-7890-abcd-1234567890ef' },
      { key: 'rental_reference', label: 'Référence', placeholder: 'DEV-2026-0042' },
      { key: 'rental_title', label: 'Titre prestation', placeholder: 'Festival Printemps' },
      { key: 'rental_type', label: 'Type (presta/location/vente)', placeholder: 'location' },
      { key: 'rental_status', label: 'État dossier', placeholder: 'en cours' },
      { key: 'quote_expiration_date', label: 'Date limite devis', placeholder: '20/03/2026' },
      { key: 'document_date', label: 'Date document', placeholder: '13/02/2026' },
      { key: 'document_page', label: 'Page courante', placeholder: '1' },
      { key: 'document_pages', label: 'Nombre de pages', placeholder: '3' },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    variables: [
      { key: 'event_start', label: 'Début prestation', placeholder: '12/03/2026 09:00' },
      { key: 'event_end', label: 'Fin prestation', placeholder: '14/03/2026 23:00' },
      { key: 'delivery_date', label: 'Date livraison aller', placeholder: '12/03/2026 06:00' },
      { key: 'return_delivery_date', label: 'Date livraison retour', placeholder: '15/03/2026 08:00' },
      { key: 'return_date', label: 'Date retour dépôt', placeholder: '15/03/2026 14:30' },
      { key: 'rental_days_count', label: 'Nombre de jours', placeholder: '3' },
      { key: 'rental_coefficient', label: 'Coefficient', placeholder: '1.25' },
      { key: 'delivery_window', label: "Heure d'arrivée souhaitée", placeholder: 'Entre 08:00 et 09:00' },
    ],
  },
  {
    id: 'client',
    label: 'Client',
    variables: [
      { key: 'client_name', label: 'Nom client', placeholder: 'Jean Dupont' },
      { key: 'client_company', label: 'Entreprise cliente', placeholder: 'Acme Events' },
      { key: 'client_profile_type', label: 'Profil client', placeholder: 'entreprise' },
      { key: 'client_contact_name', label: 'Contact principal', placeholder: 'Marie Martin' },
      { key: 'client_contact_email', label: 'Email contact', placeholder: 'marie@acme-events.fr' },
      { key: 'client_contact_phone', label: 'Téléphone contact', placeholder: '+33 6 12 34 56 78' },
      { key: 'client_email', label: 'Email client', placeholder: 'contact@acme-events.fr' },
      { key: 'client_phone', label: 'Téléphone client', placeholder: '+33 1 23 45 67 89' },
    ],
  },
  {
    id: 'addresses',
    label: 'Adresses',
    variables: [
      { key: 'event_location', label: 'Lieu prestation', placeholder: 'Palais des Congrès, Paris' },
      { key: 'event_address_line1', label: 'Adresse prestation', placeholder: '2 Pl. de la Porte Maillot' },
      { key: 'event_postcode', label: 'Code postal prestation', placeholder: '75017' },
      { key: 'event_city', label: 'Ville prestation', placeholder: 'Paris' },
      { key: 'billing_address_line1', label: 'Adresse facturation', placeholder: '25 Rue de la Paix' },
      { key: 'billing_postcode', label: 'Code postal facturation', placeholder: '75002' },
      { key: 'billing_city', label: 'Ville facturation', placeholder: 'Paris' },
      { key: 'billing_country', label: 'Pays facturation', placeholder: 'France' },
    ],
  },
  {
    id: 'financial',
    label: 'Financier',
    variables: [
      { key: 'subtotal_equipment_ht', label: 'Sous-total matériel HT', placeholder: '2 950,00 EUR' },
      { key: 'subtotal_services_ht', label: 'Sous-total services HT', placeholder: '1 610,00 EUR' },
      { key: 'total_assurance', label: 'Total assurance', placeholder: '180,00 EUR' },
      { key: 'total_transport', label: 'Total transport', placeholder: '220,00 EUR' },
      { key: 'total_personnel', label: 'Total personnel', placeholder: '640,00 EUR' },
      { key: 'total_autre', label: 'Total autres services', placeholder: '120,00 EUR' },
      { key: 'total_services', label: 'Total services', placeholder: '1 610,00 EUR' },
      { key: 'total_location', label: 'Total location', placeholder: '2 950,00 EUR' },
      { key: 'sous_total', label: 'Sous-total (avant TVA)', placeholder: '4 332,00 EUR' },
      { key: 'total_prestation', label: 'Total prestation', placeholder: '5 472,00 EUR' },
      { key: 'discount_percent', label: 'Remise (%)', placeholder: '5' },
      { key: 'discount_amount', label: 'Montant remise', placeholder: '228,00 EUR' },
      { key: 'total_ht', label: 'Total HT', placeholder: '4 560,00 EUR' },
      { key: 'total_vat', label: 'TVA', placeholder: '912,00 EUR' },
      { key: 'total_ttc', label: 'Total TTC', placeholder: '5 472,00 EUR' },
      { key: 'deposit_amount', label: 'Acompte', placeholder: '1 500,00 EUR' },
      { key: 'balance_due', label: 'Reste à payer', placeholder: '3 972,00 EUR' },
    ],
  },
  {
    id: 'company',
    label: 'Entreprise',
    variables: [
      { key: 'company_name', label: 'Nom entreprise', placeholder: 'OpenRig' },
      { key: 'company_email', label: 'Email entreprise', placeholder: 'contact@openrig.io' },
      { key: 'company_phone', label: 'Téléphone entreprise', placeholder: '+33 1 02 03 04 05' },
      { key: 'company_address', label: 'Adresse entreprise', placeholder: '10 Avenue des Sons, Lyon' },
      { key: 'company_siret', label: 'SIRET', placeholder: '123 456 789 00012' },
      { key: 'company_vat', label: 'TVA intracom', placeholder: 'FR00123456789' },
      { key: 'company_rib_iban', label: 'IBAN', placeholder: 'FR76 3000 4000 5000 6000 7000 890' },
      { key: 'company_rib_bic', label: 'BIC', placeholder: 'BNPAFRPPXXX' },
    ],
  },
];

const STUDIO_VARIABLES: StudioVariable[] = STUDIO_VARIABLE_GROUPS.flatMap((group) => group.variables);

const STUDIO_VARIABLE_MAP = new Map(STUDIO_VARIABLES.map((entry) => [entry.key, entry.placeholder]));

const VARIABLE_TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const createBlockId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createBlankStudioSnapshot = (): Record<string, any> => ({
  version: 1,
  mode: 'single-page-preview',
  zoom: 60,
  margins: {
    top: 20,
    bottom: 20,
    left: 14,
    right: 14,
  },
  links: {
    vertical: false,
    horizontal: false,
  },
  background: {
    color: '#ffffff',
    image: '',
    opacity: 100,
    size: 'cover',
  },
  headerFooter: {
    ...DEFAULT_PAGE_BAND_SETTINGS,
    header: { ...DEFAULT_PAGE_BAND_SETTINGS.header },
    footer: { ...DEFAULT_PAGE_BAND_SETTINGS.footer },
  },
  blocks: [],
  layerGroups: [],
  updated_at: new Date().toISOString(),
});

const parseCommonStudioLibrary = (templatesRoot: Record<string, any>): StudioCommonLibrary => {
  const rawCommon = templatesRoot.studio_common_library && typeof templatesRoot.studio_common_library === 'object'
    ? templatesRoot.studio_common_library as Record<string, any>
    : {};
  const rawCommonTemplates = Array.isArray(rawCommon.templates) ? rawCommon.templates : [];

  const normalizedFromCommon: StudioNamedTemplate[] = rawCommonTemplates
    .filter((entry): entry is Record<string, any> => !!entry && typeof entry === 'object')
    .map((entry, index) => {
      const rawId = typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : createBlockId();
      const rawName = typeof entry.name === 'string' && entry.name.trim().length > 0
        ? entry.name.trim()
        : `Template ${index + 1}`;
      const rawStudioByDoc = entry.studio_by_doc && typeof entry.studio_by_doc === 'object'
        ? entry.studio_by_doc as Record<string, any>
        : {};
      const legacyStudio = entry.studio && typeof entry.studio === 'object'
        ? entry.studio as Record<string, any>
        : createBlankStudioSnapshot();
      const byDoc: Record<string, Record<string, any>> = {};
      TEMPLATE_STUDIO_DOCUMENT_TYPES.forEach((doc) => {
        const candidate = rawStudioByDoc[doc.key];
        byDoc[doc.key] = candidate && typeof candidate === 'object'
          ? candidate as Record<string, any>
          : legacyStudio;
      });
      return {
        id: rawId,
        name: rawName,
        studio_by_doc: byDoc,
        created_at: typeof entry.created_at === 'string' ? entry.created_at : undefined,
        updated_at: typeof entry.updated_at === 'string' ? entry.updated_at : undefined,
      };
    });

  const dedupedTemplates: StudioNamedTemplate[] = [];
  const seenIds = new Set<string>();
  normalizedFromCommon.forEach((entry) => {
    if (seenIds.has(entry.id)) return;
    seenIds.add(entry.id);
    dedupedTemplates.push(entry);
  });

  if (dedupedTemplates.length === 0) {
    const byDoc: Record<string, Record<string, any>> = {};
    TEMPLATE_STUDIO_DOCUMENT_TYPES.forEach((doc) => {
      const docEntry = templatesRoot[doc.key] && typeof templatesRoot[doc.key] === 'object'
        ? templatesRoot[doc.key] as Record<string, any>
        : {};
      const legacyDocStudio = docEntry.studio && typeof docEntry.studio === 'object'
        ? docEntry.studio as Record<string, any>
        : createBlankStudioSnapshot();
      byDoc[doc.key] = legacyDocStudio;
    });
    dedupedTemplates.push({
      id: 'default',
      name: 'Template principal',
      studio_by_doc: byDoc,
    });
  }

  const firstTemplateId = dedupedTemplates[0].id;
  const rawActiveByDoc = rawCommon.active_template_by_doc && typeof rawCommon.active_template_by_doc === 'object'
    ? rawCommon.active_template_by_doc as Record<string, any>
    : {};

  const activeTemplateByDoc: Record<string, string> = {};
  TEMPLATE_STUDIO_DOCUMENT_TYPES.forEach((doc) => {
    const candidate = typeof rawActiveByDoc[doc.key] === 'string' ? rawActiveByDoc[doc.key] : '';
    activeTemplateByDoc[doc.key] = dedupedTemplates.some((template) => template.id === candidate)
      ? candidate
      : firstTemplateId;
  });

  return {
    templates: dedupedTemplates,
    activeTemplateByDoc,
  };
};

const extractStudioLibraryFromImport = (payload: unknown): StudioCommonLibrary | null => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, any>;

  let templatesRoot: Record<string, any> | null = null;

  if (raw.studio_common_library && typeof raw.studio_common_library === 'object') {
    templatesRoot = { studio_common_library: raw.studio_common_library };
  } else if (
    Array.isArray(raw.templates)
    && raw.active_template_by_doc
    && typeof raw.active_template_by_doc === 'object'
  ) {
    templatesRoot = { studio_common_library: raw };
  } else if (
    raw.library
    && typeof raw.library === 'object'
    && Array.isArray((raw.library as Record<string, any>).templates)
  ) {
    templatesRoot = { studio_common_library: raw.library as Record<string, any> };
  } else if (
    raw.templates
    && typeof raw.templates === 'object'
    && (raw.templates as Record<string, any>).studio_common_library
    && typeof (raw.templates as Record<string, any>).studio_common_library === 'object'
  ) {
    templatesRoot = {
      studio_common_library: (raw.templates as Record<string, any>).studio_common_library as Record<string, any>,
    };
  }

  if (!templatesRoot) return null;
  return parseCommonStudioLibrary(templatesRoot);
};

const getTemplateStudioForDoc = (template: StudioNamedTemplate, docType: string): Record<string, any> => {
  const candidate = template.studio_by_doc && typeof template.studio_by_doc === 'object'
    ? template.studio_by_doc[docType]
    : null;
  return candidate && typeof candidate === 'object'
    ? candidate as Record<string, any>
    : createBlankStudioSnapshot();
};

const setTemplateStudioForDoc = (
  template: StudioNamedTemplate,
  docType: string,
  snapshot: Record<string, any>
): StudioNamedTemplate => {
  const currentByDoc = template.studio_by_doc && typeof template.studio_by_doc === 'object'
    ? template.studio_by_doc
    : {};
  return {
    ...template,
    studio_by_doc: {
      ...currentByDoc,
      [docType]: snapshot,
    },
  };
};

const createDefaultGridBorders = (): GridBorderSet => ({
  top: { color: '#64748b', width: 0 },
  right: { color: '#64748b', width: 0 },
  bottom: { color: '#64748b', width: 0 },
  left: { color: '#64748b', width: 0 },
});

const normalizeGridBorders = (value: unknown): GridBorderSet => {
  const defaults = createDefaultGridBorders();
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Record<string, any>;
  const readSide = (side: GridBorderSide) => {
    const sideRaw = raw[side];
    const color = typeof sideRaw?.color === 'string' ? sideRaw.color : defaults[side].color;
    const width = typeof sideRaw?.width === 'number' ? Math.max(0, sideRaw.width) : defaults[side].width;
    return { color, width };
  };
  const normalized: GridBorderSet = {
    top: readSide('top'),
    right: readSide('right'),
    bottom: readSide('bottom'),
    left: readSide('left'),
  };
  const normalizeColor = (color: string) => color.trim().toLowerCase();
  const legacyColors = new Set(['#64748b', '#94a3b8']);
  const sides: GridBorderSide[] = ['top', 'right', 'bottom', 'left'];
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

const clampInteger = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
};

const clampValue = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, value))
);

const applyOpacityToColor = (color: string, opacityPercent: number): string => {
  const normalized = String(color || '').trim();
  if (!normalized) return 'transparent';
  if (normalized.toLowerCase() === 'transparent') return 'transparent';

  const alpha = clampValue(opacityPercent, 0, 100) / 100;
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
      const finalAlpha = baseAlpha * alpha;
      return `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;
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
        const finalAlpha = clampValue(baseAlpha, 0, 1) * alpha;
        return `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;
      }
    }
  }

  return normalized;
};

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const stripHtml = (value: string): string => (
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const ensureEditorHtml = (block: TemplateBlock): string => {
  if (typeof block.contentHtml === 'string' && block.contentHtml.trim().length > 0) {
    return block.contentHtml;
  }
  return escapeHtml(block.text || '');
};

const createEditorStateFromHtml = (html: string): EditorState => {
  const safeHtml = typeof html === 'string' ? html : '';
  if (!safeHtml.trim()) {
    return EditorState.createEmpty();
  }
  try {
    const parsed = convertFromHTML(safeHtml);
    if (!parsed?.contentBlocks || parsed.contentBlocks.length === 0) {
      return EditorState.createEmpty();
    }
    const contentState = ContentState.createFromBlockArray(parsed.contentBlocks, parsed.entityMap);
    return EditorState.createWithContent(contentState);
  } catch (_error) {
    return EditorState.createEmpty();
  }
};

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('file_read_failed'));
  reader.readAsDataURL(file);
});

const resolveVariablePlaceholders = (html: string): string => {
  return html.replace(VARIABLE_TOKEN_REGEX, (_full, key: string) => {
    const placeholder = STUDIO_VARIABLE_MAP.get(key);
    if (!placeholder) return `{{${key}}}`;
    return `<span style="background:rgba(59,130,246,0.16);color:inherit;border-radius:4px;padding:0 4px;border:1px dashed rgba(59,130,246,0.45);">${escapeHtml(placeholder)}</span>`;
  });
};

const buildQrCodeImageUrl = (value: string, sizePx = 640): string => {
  const safe = String(value || '').trim();
  if (!safe) return '';
  const clampedSize = clampInteger(sizePx, 64, 2000, 640);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${clampedSize}x${clampedSize}&margin=0&data=${encodeURIComponent(safe)}`;
};

const normalizeGridCellList = (
  cells: TemplateBlock[][] | undefined,
  rows: number,
  columns: number
): TemplateBlock[][] => {
  const safeRows = Math.max(1, rows);
  const safeColumns = Math.max(1, columns);
  const safeCells = Array.isArray(cells) ? cells : [];
  const total = safeRows * safeColumns;
  return Array.from({ length: total }, (_, idx) => {
    const cell = safeCells[idx];
    return Array.isArray(cell) ? cell : [];
  });
};

const resizeGridCells = (
  cells: TemplateBlock[][] | undefined,
  oldRows: number,
  oldColumns: number,
  nextRows: number,
  nextColumns: number
): TemplateBlock[][] => {
  const safeOldRows = Math.max(1, oldRows);
  const safeOldColumns = Math.max(1, oldColumns);
  const safeNextRows = Math.max(1, nextRows);
  const safeNextColumns = Math.max(1, nextColumns);
  const normalizedOld = normalizeGridCellList(cells, safeOldRows, safeOldColumns);
  const nextCells = normalizeGridCellList(undefined, safeNextRows, safeNextColumns);

  const maxRows = Math.min(safeOldRows, safeNextRows);
  const maxColumns = Math.min(safeOldColumns, safeNextColumns);

  for (let row = 0; row < maxRows; row += 1) {
    for (let col = 0; col < maxColumns; col += 1) {
      const oldIndex = row * safeOldColumns + col;
      const nextIndex = row * safeNextColumns + col;
      nextCells[nextIndex] = [...normalizedOld[oldIndex]];
    }
  }

  return nextCells;
};

const createDefaultTitleBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'title',
  text: 'Titre',
  contentHtml: 'Titre',
  marginTop: 0,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 18,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: true,
  italic: false,
  underline: false,
  textColor: '#111827',
  layoutMode: 'flow',
  floatX: 10,
  floatY: 10,
  floatWidth: 120,
  floatHeight: 20,
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createDefaultSubtitleBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'subtitle',
  text: 'Sous-titre',
  contentHtml: 'Sous-titre',
  marginTop: 0,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 14,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: false,
  italic: false,
  underline: false,
  textColor: '#111827',
  layoutMode: 'flow',
  floatX: 10,
  floatY: 36,
  floatWidth: 120,
  floatHeight: 16,
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createDefaultSeparatorBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'separator',
  text: 'Séparateur',
  marginTop: 2,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 12,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: false,
  italic: false,
  underline: false,
  textColor: '#111827',
  layoutMode: 'flow',
  floatX: 10,
  floatY: 52,
  floatWidth: 120,
  floatHeight: 8,
  separatorStyle: 'solid',
  separatorThickness: 2,
  separatorWidthPercent: 100,
  separatorRadius: 999,
  separatorColor: '#64748b',
  separatorSecondaryColor: '#94a3b8',
  separatorOpacity: 100,
  separatorAlign: 'center',
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createDefaultGridBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'grid',
  text: 'Grille',
  marginTop: 0,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 12,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: false,
  italic: false,
  underline: false,
  gridRows: 2,
  gridColumns: 2,
  gridCells: normalizeGridCellList(undefined, 2, 2),
  gridDividerColor: '#94a3b8',
  gridDividerWidth: 1,
  gridBorders: createDefaultGridBorders(),
  gridBorderTransparent: false,
  gridDividerStyle: 'solid',
  gridCellPaddingXMm: 2,
  gridCellPaddingYMm: 2,
  gridCellMinHeightMm: 12,
  gridBackgroundColor: 'transparent',
  gridCellBackgroundColor: 'transparent',
  gridOpacity: 100,
  gridBorderOpacity: 100,
  gridBackgroundOpacity: 100,
  gridCellBackgroundOpacity: 100,
  gridBorderRadius: 0,
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createDefaultImageBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'image',
  text: 'Image',
  marginTop: 0,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 12,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: false,
  italic: false,
  underline: false,
  textColor: '#111827',
  layoutMode: 'flow',
  floatX: 10,
  floatY: 64,
  floatWidth: 120,
  floatHeight: 60,
  imageUrl: '',
  imageAlt: 'Image',
  imageFit: 'cover',
  imageAlign: 'center',
  imageWidthPercent: 100,
  imageHeightMm: 40,
  imageOpacity: 100,
  imageBorderRadius: 0,
  imageBorderWidth: 0,
  imageBorderColor: '#94a3b8',
  imageShadow: false,
  imageBackgroundColor: 'transparent',
  imageRotation: 0,
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createDefaultQrCodeBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'qrcode',
  text: 'QR code',
  marginTop: 0,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 12,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: false,
  italic: false,
  underline: false,
  textColor: '#111827',
  layoutMode: 'flow',
  floatX: 160,
  floatY: 16,
  floatWidth: 35,
  floatHeight: 35,
  imageAlt: 'QR code',
  imageFit: 'contain',
  imageAlign: 'center',
  imageWidthPercent: 100,
  imageHeightMm: 35,
  imageOpacity: 100,
  imageBorderRadius: 0,
  imageBorderWidth: 0,
  imageBorderColor: '#94a3b8',
  imageShadow: false,
  imageBackgroundColor: '#ffffff',
  imageRotation: 0,
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createDefaultZoneBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'zone',
  text: 'Zone',
  marginTop: 0,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 12,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: false,
  italic: false,
  underline: false,
  textColor: '#111827',
  layoutMode: 'flow',
  floatX: 10,
  floatY: 18,
  floatWidth: 160,
  floatHeight: 80,
  zoneChildren: [],
  zonePaddingMm: 3,
  zonePaddingXMm: 3,
  zonePaddingYMm: 3,
  zoneMinHeightMm: 45,
  zoneOpacity: 100,
  zoneBackgroundColor: '#ffffff',
  zoneBorderColor: '#94a3b8',
  zoneBorderWidth: 0,
  zoneBorderRadius: 6,
  zoneBorderTransparent: false,
  zoneBorderStyle: 'solid',
  zoneBorderOpacity: 100,
  zoneBackgroundOpacity: 100,
  zoneShadow: false,
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createDefaultTableBlock = (): TemplateBlock => ({
  id: createBlockId(),
  type: 'table',
  text: 'Tableau équipements',
  marginTop: 0,
  marginBottom: 6,
  marginLeft: 0,
  marginRight: 0,
  linkVertical: false,
  linkHorizontal: false,
  fontSize: 12,
  fontFamily: 'Inter',
  textAlign: 'left',
  bold: false,
  italic: false,
  underline: false,
  textColor: '#0f172a',
  layoutMode: 'flow',
  floatX: 10,
  floatY: 18,
  floatWidth: 180,
  floatHeight: 85,
  tableDataSource: 'equipment_by_category',
  tableColumns: [...DEFAULT_TABLE_COLUMNS],
  tableShowCategories: true,
  tableHeaderBackground: '#0f172a',
  tableHeaderTextColor: '#f8fafc',
  tableBodyBackground: '#f8fafc',
  tableCategoryBackground: '#e2e8f0',
  tableCategoryTextColor: '#0f172a',
  tableBorderColor: '#cbd5e1',
  tableBorderWidth: 1,
  tableBorderRadius: 12,
  tableCellPaddingX: 14,
  tableCellPaddingY: 10,
  tableRowGapPx: 0,
  tableFontSizePt: 12,
  tableHeaderFontSizePt: 13,
  tableHeaderBold: true,
  tableHeaderTextAlign: 'auto',
  tableCategoryTextAlign: 'left',
  tableBodyTextAlign: 'auto',
  tableHeaderColumnAlign: {},
  tableBodyColumnAlign: {},
  pageBreakReplicate: false,
  pageBreakMode: 'fixed',
  pageBreakAnchor: 'top',
  pageBreakOffsetMm: 0,
  pageBreakFlowGapMm: 0,
  followEnabled: false,
  followTargetId: null,
  followPosition: 'below',
  followAlign: 'start',
  followGapMm: 4,
  followOffsetXMm: 0,
  followOffsetYMm: 0,
});

const createBlockFromType = (blockType: StudioBlockType): TemplateBlock => {
  if (blockType === 'subtitle') return createDefaultSubtitleBlock();
  if (blockType === 'separator') return createDefaultSeparatorBlock();
  if (blockType === 'grid') return createDefaultGridBlock();
  if (blockType === 'image') return createDefaultImageBlock();
  if (blockType === 'qrcode') return createDefaultQrCodeBlock();
  if (blockType === 'zone') return createDefaultZoneBlock();
  if (blockType === 'table') return createDefaultTableBlock();
  return createDefaultTitleBlock();
};

const findBlockInTree = (blocks: TemplateBlock[], blockId: string): TemplateBlock | null => {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      for (const cellBlocks of cells) {
        const nested = findBlockInTree(cellBlocks, blockId);
        if (nested) return nested;
      }
      continue;
    }
    if (block.type === 'zone') {
      const nested = findBlockInTree(block.zoneChildren ?? [], blockId);
      if (nested) return nested;
    }
  }
  return null;
};

const updateBlockInTree = (
  blocks: TemplateBlock[],
  blockId: string,
  updater: (block: TemplateBlock) => TemplateBlock
): [TemplateBlock[], boolean] => {
  let found = false;

  const nextBlocks = blocks.map((block) => {
    if (block.id === blockId) {
      found = true;
      return updater(block);
    }

    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      let childrenChanged = false;

      const nextCells = cells.map((cellBlocks) => {
        const [nextCellBlocks, nestedFound] = updateBlockInTree(cellBlocks, blockId, updater);
        if (nestedFound) {
          childrenChanged = true;
          found = true;
          return nextCellBlocks;
        }
        return cellBlocks;
      });

      if (!childrenChanged) return block;
      return { ...block, gridRows: rows, gridColumns: columns, gridCells: nextCells };
    }

    if (block.type === 'zone') {
      const [nextZoneChildren, nestedFound] = updateBlockInTree(block.zoneChildren ?? [], blockId, updater);
      if (!nestedFound) return block;
      found = true;
      return { ...block, zoneChildren: nextZoneChildren };
    }

    return block;
  });

  return [found ? nextBlocks : blocks, found];
};

const deleteBlockInTree = (blocks: TemplateBlock[], blockId: string): [TemplateBlock[], boolean] => {
  let deleted = false;
  const nextBlocks: TemplateBlock[] = [];

  for (const block of blocks) {
    if (block.id === blockId) {
      deleted = true;
      continue;
    }

    if (block.type !== 'grid' && block.type !== 'zone') {
      nextBlocks.push(block);
      continue;
    }

    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      let childDeleted = false;

      const nextCells = cells.map((cellBlocks) => {
        const [nextCellBlocks, didDelete] = deleteBlockInTree(cellBlocks, blockId);
        if (didDelete) {
          childDeleted = true;
          deleted = true;
        }
        return nextCellBlocks;
      });

      if (childDeleted) {
        nextBlocks.push({ ...block, gridRows: rows, gridColumns: columns, gridCells: nextCells });
      } else {
        nextBlocks.push(block);
      }
    } else {
      const [nextZoneChildren, childDeleted] = deleteBlockInTree(block.zoneChildren ?? [], blockId);
      if (childDeleted) {
        deleted = true;
        nextBlocks.push({ ...block, zoneChildren: nextZoneChildren });
      } else {
        nextBlocks.push(block);
      }
    }
  }

  return [deleted ? nextBlocks : blocks, deleted];
};

const blockTreeContainsId = (block: TemplateBlock, blockId: string): boolean => {
  if (block.id === blockId) return true;
  if (block.type === 'grid') {
    const rows = Math.max(1, block.gridRows ?? 1);
    const columns = Math.max(1, block.gridColumns ?? 1);
    const cells = normalizeGridCellList(block.gridCells, rows, columns);
    return cells.some((cellBlocks) => cellBlocks.some((child) => blockTreeContainsId(child, blockId)));
  }
  if (block.type === 'zone') {
    return (block.zoneChildren ?? []).some((child) => blockTreeContainsId(child, blockId));
  }
  return false;
};

const blockTreeContainsType = (blocks: TemplateBlock[] | undefined, type: TemplateBlock['type']): boolean => {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === type) return true;
    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      for (const cell of cells) {
        if (blockTreeContainsType(cell, type)) return true;
      }
    } else if (block.type === 'zone') {
      if (blockTreeContainsType(block.zoneChildren ?? [], type)) return true;
    }
  }
  return false;
};

const extractBlockFromTree = (
  blocks: TemplateBlock[],
  blockId: string
): [TemplateBlock[], TemplateBlock | null, boolean] => {
  const target = findBlockInTree(blocks, blockId);
  if (!target) return [blocks, null, false];
  const [nextBlocks, removed] = deleteBlockInTree(blocks, blockId);
  if (!removed) return [blocks, null, false];
  return [nextBlocks, target, true];
};

const insertBlockIntoGridCell = (
  blocks: TemplateBlock[],
  gridBlockId: string,
  cellIndex: number,
  newBlock: TemplateBlock
): [TemplateBlock[], boolean] => {
  let inserted = false;

  const nextBlocks = blocks.map((block) => {
    if (inserted) return block;

    if (block.id === gridBlockId && block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      if (cellIndex < 0 || cellIndex >= cells.length) return block;

      const nextCells = cells.map((cellBlocks, idx) => (
        idx === cellIndex ? [...cellBlocks, newBlock] : cellBlocks
      ));
      inserted = true;
      return { ...block, gridRows: rows, gridColumns: columns, gridCells: nextCells };
    }

    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      let childrenChanged = false;

      const nextCells = cells.map((cellBlocks) => {
        if (inserted) return cellBlocks;
        const [nextCellBlocks, didInsert] = insertBlockIntoGridCell(cellBlocks, gridBlockId, cellIndex, newBlock);
        if (didInsert) {
          inserted = true;
          childrenChanged = true;
          return nextCellBlocks;
        }
        return cellBlocks;
      });

      if (!childrenChanged) return block;
      return { ...block, gridRows: rows, gridColumns: columns, gridCells: nextCells };
    }

    if (block.type === 'zone') {
      const [nextZoneChildren, didInsert] = insertBlockIntoGridCell(block.zoneChildren ?? [], gridBlockId, cellIndex, newBlock);
      if (!didInsert) return block;
      inserted = true;
      return { ...block, zoneChildren: nextZoneChildren };
    }

    return block;
  });

  return [inserted ? nextBlocks : blocks, inserted];
};

const insertBlockIntoZone = (
  blocks: TemplateBlock[],
  zoneBlockId: string,
  newBlock: TemplateBlock
): [TemplateBlock[], boolean] => {
  let inserted = false;

  const nextBlocks = blocks.map((block) => {
    if (inserted) return block;

    if (block.id === zoneBlockId && block.type === 'zone') {
      inserted = true;
      return { ...block, zoneChildren: [...(block.zoneChildren ?? []), newBlock] };
    }

    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      let childrenChanged = false;

      const nextCells = cells.map((cellBlocks) => {
        if (inserted) return cellBlocks;
        const [nextCellBlocks, didInsert] = insertBlockIntoZone(cellBlocks, zoneBlockId, newBlock);
        if (didInsert) {
          inserted = true;
          childrenChanged = true;
          return nextCellBlocks;
        }
        return cellBlocks;
      });

      if (!childrenChanged) return block;
      return { ...block, gridRows: rows, gridColumns: columns, gridCells: nextCells };
    }

    if (block.type === 'zone') {
      const [nextZoneChildren, didInsert] = insertBlockIntoZone(block.zoneChildren ?? [], zoneBlockId, newBlock);
      if (!didInsert) return block;
      inserted = true;
      return { ...block, zoneChildren: nextZoneChildren };
    }

    return block;
  });

  return [inserted ? nextBlocks : blocks, inserted];
};

const cloneBlockTreeWithNewIds = (
  block: TemplateBlock,
  idMap: Map<string, string>
): TemplateBlock => {
  const clonedId = createBlockId();
  idMap.set(block.id, clonedId);

  const clonedBlock: TemplateBlock = {
    ...block,
    id: clonedId,
  };

  if (block.type === 'grid') {
    const rows = Math.max(1, block.gridRows ?? 1);
    const columns = Math.max(1, block.gridColumns ?? 1);
    const cells = normalizeGridCellList(block.gridCells, rows, columns);
    clonedBlock.gridRows = rows;
    clonedBlock.gridColumns = columns;
    clonedBlock.gridCells = cells.map((cellBlocks) => (
      cellBlocks.map((child) => cloneBlockTreeWithNewIds(child, idMap))
    ));
    return clonedBlock;
  }

  if (block.type === 'zone') {
    clonedBlock.zoneChildren = (block.zoneChildren ?? []).map((child) => cloneBlockTreeWithNewIds(child, idMap));
    return clonedBlock;
  }

  return clonedBlock;
};

const remapFollowTargetsInClonedTree = (
  block: TemplateBlock,
  idMap: Map<string, string>
): TemplateBlock => {
  const remappedFollowTargetId = block.followTargetId && idMap.has(block.followTargetId)
    ? idMap.get(block.followTargetId) ?? null
    : block.followTargetId;

  if (block.type === 'grid') {
    const rows = Math.max(1, block.gridRows ?? 1);
    const columns = Math.max(1, block.gridColumns ?? 1);
    const cells = normalizeGridCellList(block.gridCells, rows, columns);
    return {
      ...block,
      followTargetId: remappedFollowTargetId,
      gridRows: rows,
      gridColumns: columns,
      gridCells: cells.map((cellBlocks) => cellBlocks.map((child) => remapFollowTargetsInClonedTree(child, idMap))),
    };
  }

  if (block.type === 'zone') {
    return {
      ...block,
      followTargetId: remappedFollowTargetId,
      zoneChildren: (block.zoneChildren ?? []).map((child) => remapFollowTargetsInClonedTree(child, idMap)),
    };
  }

  return {
    ...block,
    followTargetId: remappedFollowTargetId,
  };
};

const duplicateBlockInTree = (
  blocks: TemplateBlock[],
  blockId: string
): [TemplateBlock[], TemplateBlock | null, boolean] => {
  let duplicated = false;
  let duplicatedBlock: TemplateBlock | null = null;
  const nextBlocks: TemplateBlock[] = [];

  for (const block of blocks) {
    if (block.id === blockId) {
      const idMap = new Map<string, string>();
      const clonedRaw = cloneBlockTreeWithNewIds(block, idMap);
      const clonedBlock = remapFollowTargetsInClonedTree(clonedRaw, idMap);
      nextBlocks.push(block, clonedBlock);
      duplicated = true;
      duplicatedBlock = clonedBlock;
      continue;
    }

    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      let childrenChanged = false;

      const nextCells = cells.map((cellBlocks) => {
        if (duplicated) return cellBlocks;
        const [nextCellBlocks, nextDuplicatedBlock, didDuplicate] = duplicateBlockInTree(cellBlocks, blockId);
        if (!didDuplicate) return cellBlocks;
        duplicated = true;
        duplicatedBlock = nextDuplicatedBlock;
        childrenChanged = true;
        return nextCellBlocks;
      });

      if (childrenChanged) {
        nextBlocks.push({ ...block, gridRows: rows, gridColumns: columns, gridCells: nextCells });
      } else {
        nextBlocks.push(block);
      }
      continue;
    }

    if (block.type === 'zone') {
      const [nextZoneChildren, nextDuplicatedBlock, didDuplicate] = duplicateBlockInTree(block.zoneChildren ?? [], blockId);
      if (didDuplicate) {
        duplicated = true;
        duplicatedBlock = nextDuplicatedBlock;
        nextBlocks.push({ ...block, zoneChildren: nextZoneChildren });
      } else {
        nextBlocks.push(block);
      }
      continue;
    }

    nextBlocks.push(block);
  }

  return [duplicated ? nextBlocks : blocks, duplicatedBlock, duplicated];
};

const serializeTemplateBlock = (block: TemplateBlock): Record<string, any> => {
  const base = {
    id: block.id,
    type: block.type,
    text: block.text,
    contentHtml: ensureEditorHtml(block),
    marginTop: block.marginTop,
    marginBottom: block.marginBottom,
    marginLeft: block.marginLeft,
    marginRight: block.marginRight,
    linkVertical: block.linkVertical,
    linkHorizontal: block.linkHorizontal,
    fontSize: block.fontSize,
    fontFamily: block.fontFamily,
    textAlign: block.textAlign,
    bold: block.bold,
    italic: block.italic,
    underline: block.underline,
    textColor: typeof block.textColor === 'string' ? block.textColor : '#111827',
    layoutMode: block.layoutMode === 'floating' || block.layoutMode === 'semi-fixed'
      ? block.layoutMode
      : 'flow',
    floatX: typeof block.floatX === 'number' ? block.floatX : 10,
    floatY: typeof block.floatY === 'number' ? block.floatY : 10,
    floatWidth: typeof block.floatWidth === 'number' ? block.floatWidth : 120,
    floatHeight: typeof block.floatHeight === 'number' ? block.floatHeight : 20,
    separatorStyle: block.separatorStyle ?? 'solid',
    separatorThickness: typeof block.separatorThickness === 'number' ? block.separatorThickness : 2,
    separatorWidthPercent: typeof block.separatorWidthPercent === 'number' ? block.separatorWidthPercent : 100,
    separatorRadius: typeof block.separatorRadius === 'number' ? block.separatorRadius : 999,
    separatorColor: block.separatorColor ?? '#64748b',
    separatorSecondaryColor: block.separatorSecondaryColor ?? '#94a3b8',
    separatorOpacity: typeof block.separatorOpacity === 'number' ? block.separatorOpacity : 100,
    separatorAlign: block.separatorAlign ?? 'center',
    imageUrl: typeof block.imageUrl === 'string' ? block.imageUrl : '',
    imageAlt: typeof block.imageAlt === 'string' ? block.imageAlt : 'Image',
    imageFit: block.imageFit === 'contain' || block.imageFit === 'fill' || block.imageFit === 'none'
      ? block.imageFit
      : 'cover',
    imageAlign: block.imageAlign === 'left' || block.imageAlign === 'right'
      ? block.imageAlign
      : 'center',
    imageWidthPercent: typeof block.imageWidthPercent === 'number' ? block.imageWidthPercent : 100,
    imageHeightMm: typeof block.imageHeightMm === 'number' ? block.imageHeightMm : 40,
    imageOpacity: typeof block.imageOpacity === 'number' ? block.imageOpacity : 100,
    imageBorderRadius: typeof block.imageBorderRadius === 'number' ? block.imageBorderRadius : 0,
    imageBorderWidth: typeof block.imageBorderWidth === 'number' ? block.imageBorderWidth : 0,
    imageBorderColor: typeof block.imageBorderColor === 'string' ? block.imageBorderColor : '#94a3b8',
    imageShadow: typeof block.imageShadow === 'boolean' ? block.imageShadow : false,
    imageBackgroundColor: typeof block.imageBackgroundColor === 'string' ? block.imageBackgroundColor : 'transparent',
    imageRotation: typeof block.imageRotation === 'number' ? block.imageRotation : 0,
    zonePaddingMm: typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3,
    zonePaddingXMm: typeof block.zonePaddingXMm === 'number' ? block.zonePaddingXMm : (typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3),
    zonePaddingYMm: typeof block.zonePaddingYMm === 'number' ? block.zonePaddingYMm : (typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3),
    zoneMinHeightMm: typeof block.zoneMinHeightMm === 'number' ? block.zoneMinHeightMm : 45,
    zoneOpacity: typeof block.zoneOpacity === 'number' ? block.zoneOpacity : 100,
    zoneBackgroundOpacity: typeof block.zoneBackgroundOpacity === 'number'
      ? block.zoneBackgroundOpacity
      : (typeof block.zoneOpacity === 'number' ? block.zoneOpacity : 100),
    zoneBackgroundColor: typeof block.zoneBackgroundColor === 'string' ? block.zoneBackgroundColor : '#ffffff',
    zoneBorderColor: typeof block.zoneBorderColor === 'string' ? block.zoneBorderColor : '#94a3b8',
    zoneBorderWidth: typeof block.zoneBorderWidth === 'number' ? block.zoneBorderWidth : 0,
    zoneBorderRadius: typeof block.zoneBorderRadius === 'number' ? block.zoneBorderRadius : 6,
    zoneBorderTransparent: typeof block.zoneBorderTransparent === 'boolean' ? block.zoneBorderTransparent : false,
    zoneBorderStyle: block.zoneBorderStyle === 'dashed' || block.zoneBorderStyle === 'dotted' ? block.zoneBorderStyle : 'solid',
    zoneBorderOpacity: typeof block.zoneBorderOpacity === 'number'
      ? block.zoneBorderOpacity
      : (block.zoneBorderTransparent ? 0 : 100),
    zoneShadow: typeof block.zoneShadow === 'boolean' ? block.zoneShadow : false,
    tableDataSource: block.tableDataSource === 'equipment_by_category' ? 'equipment_by_category' : 'equipment_by_category',
    tableColumns: Array.isArray(block.tableColumns)
      ? block.tableColumns.filter((key): key is TableColumnKey => isTableColumnKey(key))
      : [...DEFAULT_TABLE_COLUMNS],
    tableShowCategories: typeof block.tableShowCategories === 'boolean' ? block.tableShowCategories : true,
    tableHeaderBackground: typeof block.tableHeaderBackground === 'string' ? block.tableHeaderBackground : '#0f172a',
    tableHeaderTextColor: typeof block.tableHeaderTextColor === 'string' ? block.tableHeaderTextColor : '#f8fafc',
    tableBodyBackground: typeof block.tableBodyBackground === 'string' ? block.tableBodyBackground : '#f8fafc',
    tableCategoryBackground: typeof block.tableCategoryBackground === 'string' ? block.tableCategoryBackground : '#e2e8f0',
    tableCategoryTextColor: typeof block.tableCategoryTextColor === 'string' ? block.tableCategoryTextColor : '#0f172a',
    tableBorderColor: typeof block.tableBorderColor === 'string' ? block.tableBorderColor : '#cbd5e1',
    tableBorderWidth: typeof block.tableBorderWidth === 'number' ? block.tableBorderWidth : 1,
    tableBorderRadius: typeof block.tableBorderRadius === 'number' ? block.tableBorderRadius : 12,
    tableCellPaddingX: typeof block.tableCellPaddingX === 'number' ? block.tableCellPaddingX : 14,
    tableCellPaddingY: typeof block.tableCellPaddingY === 'number' ? block.tableCellPaddingY : 10,
    tableRowGapPx: typeof block.tableRowGapPx === 'number' ? block.tableRowGapPx : 0,
    tableFontSizePt: typeof block.tableFontSizePt === 'number' ? block.tableFontSizePt : 12,
    tableHeaderFontSizePt: typeof block.tableHeaderFontSizePt === 'number' ? block.tableHeaderFontSizePt : 13,
    tableHeaderBold: typeof block.tableHeaderBold === 'boolean' ? block.tableHeaderBold : true,
    tableHeaderTextAlign: block.tableHeaderTextAlign === 'left' || block.tableHeaderTextAlign === 'center' || block.tableHeaderTextAlign === 'right'
      ? block.tableHeaderTextAlign
      : 'auto',
    tableCategoryTextAlign: block.tableCategoryTextAlign === 'center' || block.tableCategoryTextAlign === 'right'
      ? block.tableCategoryTextAlign
      : 'left',
    tableBodyTextAlign: block.tableBodyTextAlign === 'left' || block.tableBodyTextAlign === 'center' || block.tableBodyTextAlign === 'right'
      ? block.tableBodyTextAlign
      : 'auto',
    tableHeaderColumnAlign: sanitizeTableColumnAlignMap(block.tableHeaderColumnAlign),
    tableBodyColumnAlign: sanitizeTableColumnAlignMap(block.tableBodyColumnAlign),
    pageBreakReplicate: !!block.pageBreakReplicate,
    pageBreakMode: block.pageBreakMode === 'flow' ? 'flow' : 'fixed',
    pageBreakAnchor: block.pageBreakAnchor === 'bottom' ? 'bottom' : 'top',
    pageBreakOffsetMm: typeof block.pageBreakOffsetMm === 'number' ? block.pageBreakOffsetMm : 0,
    pageBreakFlowGapMm: typeof block.pageBreakFlowGapMm === 'number' ? block.pageBreakFlowGapMm : 0,
    followEnabled: !!block.followEnabled,
    followTargetId: typeof block.followTargetId === 'string' ? block.followTargetId : null,
    followPosition: block.followPosition === 'above' || block.followPosition === 'left' || block.followPosition === 'right'
      ? block.followPosition
      : 'below',
    followAlign: block.followAlign === 'center' || block.followAlign === 'end' ? block.followAlign : 'start',
    followGapMm: typeof block.followGapMm === 'number' ? block.followGapMm : 4,
    followOffsetXMm: typeof block.followOffsetXMm === 'number' ? block.followOffsetXMm : 0,
    followOffsetYMm: typeof block.followOffsetYMm === 'number' ? block.followOffsetYMm : 0,
  };

  if (block.type === 'zone') {
    return {
      ...base,
      zoneChildren: (block.zoneChildren ?? []).map(serializeTemplateBlock),
      zonePaddingMm: clampValue(typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3, 0, 30),
      zonePaddingXMm: clampValue(typeof block.zonePaddingXMm === 'number' ? block.zonePaddingXMm : (typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3), 0, 30),
      zonePaddingYMm: clampValue(typeof block.zonePaddingYMm === 'number' ? block.zonePaddingYMm : (typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3), 0, 30),
      zoneMinHeightMm: clampValue(typeof block.zoneMinHeightMm === 'number' ? block.zoneMinHeightMm : 45, 10, 260),
      zoneOpacity: clampValue(typeof block.zoneOpacity === 'number' ? block.zoneOpacity : 100, 0, 100),
      zoneBackgroundOpacity: clampValue(
        typeof block.zoneBackgroundOpacity === 'number'
          ? block.zoneBackgroundOpacity
          : (typeof block.zoneOpacity === 'number' ? block.zoneOpacity : 100),
        0,
        100
      ),
      zoneBackgroundColor: typeof block.zoneBackgroundColor === 'string' ? block.zoneBackgroundColor : '#ffffff',
      zoneBorderColor: typeof block.zoneBorderColor === 'string' ? block.zoneBorderColor : '#94a3b8',
      zoneBorderWidth: clampValue(typeof block.zoneBorderWidth === 'number' ? block.zoneBorderWidth : 0, 0, 12),
      zoneBorderRadius: clampValue(typeof block.zoneBorderRadius === 'number' ? block.zoneBorderRadius : 6, 0, 999),
      zoneBorderTransparent: !!block.zoneBorderTransparent,
      zoneBorderStyle: block.zoneBorderStyle === 'dashed' || block.zoneBorderStyle === 'dotted' ? block.zoneBorderStyle : 'solid',
      zoneBorderOpacity: clampValue(
        typeof block.zoneBorderOpacity === 'number'
          ? block.zoneBorderOpacity
          : (block.zoneBorderTransparent ? 0 : 100),
        0,
        100
      ),
      zoneShadow: !!block.zoneShadow,
    };
  }

  if (block.type !== 'grid') return base;

  const rows = Math.max(1, block.gridRows ?? 1);
  const columns = Math.max(1, block.gridColumns ?? 1);
  const cells = normalizeGridCellList(block.gridCells, rows, columns);

  return {
    ...base,
    gridRows: rows,
    gridColumns: columns,
    gridDividerColor: typeof block.gridDividerColor === 'string' ? block.gridDividerColor : '#94a3b8',
    gridDividerWidth: typeof block.gridDividerWidth === 'number' ? Math.max(0, block.gridDividerWidth) : 1,
    gridBorders: normalizeGridBorders(block.gridBorders),
    gridBorderTransparent: !!block.gridBorderTransparent,
    gridDividerStyle: block.gridDividerStyle === 'dashed' || block.gridDividerStyle === 'dotted' ? block.gridDividerStyle : 'solid',
    gridCellPaddingXMm: clampValue(typeof block.gridCellPaddingXMm === 'number' ? block.gridCellPaddingXMm : 2, 0, 40),
    gridCellPaddingYMm: clampValue(typeof block.gridCellPaddingYMm === 'number' ? block.gridCellPaddingYMm : 2, 0, 40),
    gridCellMinHeightMm: clampValue(typeof block.gridCellMinHeightMm === 'number' ? block.gridCellMinHeightMm : 12, 2, 120),
    gridBackgroundColor: typeof block.gridBackgroundColor === 'string' ? block.gridBackgroundColor : 'transparent',
    gridCellBackgroundColor: typeof block.gridCellBackgroundColor === 'string' ? block.gridCellBackgroundColor : 'transparent',
    gridOpacity: clampValue(typeof block.gridOpacity === 'number' ? block.gridOpacity : 100, 0, 100),
    gridBorderOpacity: clampValue(
      typeof block.gridBorderOpacity === 'number'
        ? block.gridBorderOpacity
        : (block.gridBorderTransparent ? 0 : 100),
      0,
      100
    ),
    gridBackgroundOpacity: clampValue(
      typeof block.gridBackgroundOpacity === 'number'
        ? block.gridBackgroundOpacity
        : (typeof block.gridOpacity === 'number' ? block.gridOpacity : 100),
      0,
      100
    ),
    gridCellBackgroundOpacity: clampValue(
      typeof block.gridCellBackgroundOpacity === 'number'
        ? block.gridCellBackgroundOpacity
        : (typeof block.gridOpacity === 'number' ? block.gridOpacity : 100),
      0,
      100
    ),
    gridBorderRadius: clampValue(typeof block.gridBorderRadius === 'number' ? block.gridBorderRadius : 0, 0, 999),
    gridCells: cells.map((cellBlocks) => cellBlocks.map(serializeTemplateBlock)),
  };
};

const hydrateTemplateBlock = (raw: unknown): TemplateBlock | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, any>;
  const type: StudioBlockType = (
    source.type === 'subtitle'
    || source.type === 'separator'
    || source.type === 'grid'
    || source.type === 'image'
    || source.type === 'qrcode'
    || source.type === 'zone'
    || source.type === 'table'
  ) ? source.type : 'title';
  const defaults = createBlockFromType(type);

  const hydrated: TemplateBlock = {
    ...defaults,
    id: typeof source.id === 'string' ? source.id : defaults.id,
    type,
    text: typeof source.text === 'string'
      ? source.text
      : (type === 'subtitle'
        ? 'Sous-titre'
        : type === 'separator'
          ? 'Séparateur'
          : type === 'grid'
            ? 'Grille'
            : type === 'image'
              ? 'Image'
              : type === 'qrcode'
                ? 'QR code'
              : type === 'zone'
                ? 'Zone'
                : type === 'table'
                  ? 'Tableau'
            : 'Titre'),
    contentHtml: typeof source.contentHtml === 'string'
      ? source.contentHtml
      : (typeof source.text === 'string' ? escapeHtml(source.text) : defaults.contentHtml),
    marginTop: typeof source.marginTop === 'number' ? Math.max(0, source.marginTop) : defaults.marginTop,
    marginBottom: typeof source.marginBottom === 'number' ? Math.max(0, source.marginBottom) : defaults.marginBottom,
    marginLeft: typeof source.marginLeft === 'number' ? Math.max(0, source.marginLeft) : defaults.marginLeft,
    marginRight: typeof source.marginRight === 'number' ? Math.max(0, source.marginRight) : defaults.marginRight,
    linkVertical: typeof source.linkVertical === 'boolean' ? source.linkVertical : defaults.linkVertical,
    linkHorizontal: typeof source.linkHorizontal === 'boolean' ? source.linkHorizontal : defaults.linkHorizontal,
    fontSize: typeof source.fontSize === 'number' ? Math.max(8, source.fontSize) : defaults.fontSize,
    fontFamily: typeof source.fontFamily === 'string' && source.fontFamily ? source.fontFamily : defaults.fontFamily,
    textAlign: source.textAlign === 'center' || source.textAlign === 'right' || source.textAlign === 'justify'
      ? source.textAlign
      : defaults.textAlign,
    bold: typeof source.bold === 'boolean' ? source.bold : defaults.bold,
    italic: typeof source.italic === 'boolean' ? source.italic : defaults.italic,
    underline: typeof source.underline === 'boolean' ? source.underline : defaults.underline,
    textColor: typeof source.textColor === 'string' ? source.textColor : (defaults.textColor ?? '#111827'),
    layoutMode: source.layoutMode === 'floating' || source.layoutMode === 'semi-fixed'
      ? source.layoutMode
      : 'flow',
    floatX: typeof source.floatX === 'number' ? Math.max(0, source.floatX) : (defaults.floatX ?? 10),
    floatY: typeof source.floatY === 'number' ? Math.max(0, source.floatY) : (defaults.floatY ?? 10),
    floatWidth: typeof source.floatWidth === 'number' ? Math.max(10, source.floatWidth) : (defaults.floatWidth ?? 120),
    floatHeight: typeof source.floatHeight === 'number' ? Math.max(8, source.floatHeight) : (defaults.floatHeight ?? 20),
    separatorStyle: source.separatorStyle === 'dashed'
      || source.separatorStyle === 'dotted'
      || source.separatorStyle === 'double'
      || source.separatorStyle === 'gradient'
      || source.separatorStyle === 'glow'
      ? source.separatorStyle
      : (defaults.separatorStyle ?? 'solid'),
    separatorThickness: typeof source.separatorThickness === 'number'
      ? Math.max(1, Math.min(20, source.separatorThickness))
      : (defaults.separatorThickness ?? 2),
    separatorWidthPercent: typeof source.separatorWidthPercent === 'number'
      ? Math.max(10, Math.min(100, source.separatorWidthPercent))
      : (defaults.separatorWidthPercent ?? 100),
    separatorRadius: typeof source.separatorRadius === 'number'
      ? Math.max(0, Math.min(999, source.separatorRadius))
      : (defaults.separatorRadius ?? 999),
    separatorColor: typeof source.separatorColor === 'string'
      ? source.separatorColor
      : (defaults.separatorColor ?? '#64748b'),
    separatorSecondaryColor: typeof source.separatorSecondaryColor === 'string'
      ? source.separatorSecondaryColor
      : (defaults.separatorSecondaryColor ?? '#94a3b8'),
    separatorOpacity: typeof source.separatorOpacity === 'number'
      ? Math.max(0, Math.min(100, source.separatorOpacity))
      : (defaults.separatorOpacity ?? 100),
    separatorAlign: source.separatorAlign === 'left' || source.separatorAlign === 'right'
      ? source.separatorAlign
      : (defaults.separatorAlign ?? 'center'),
    imageUrl: typeof source.imageUrl === 'string' ? source.imageUrl : (defaults.imageUrl ?? ''),
    imageAlt: typeof source.imageAlt === 'string' ? source.imageAlt : (defaults.imageAlt ?? 'Image'),
    imageFit: source.imageFit === 'contain' || source.imageFit === 'fill' || source.imageFit === 'none'
      ? source.imageFit
      : (defaults.imageFit ?? 'cover'),
    imageAlign: source.imageAlign === 'left' || source.imageAlign === 'right'
      ? source.imageAlign
      : (defaults.imageAlign ?? 'center'),
    imageWidthPercent: typeof source.imageWidthPercent === 'number'
      ? Math.max(10, Math.min(100, source.imageWidthPercent))
      : (defaults.imageWidthPercent ?? 100),
    imageHeightMm: typeof source.imageHeightMm === 'number'
      ? Math.max(8, Math.min(260, source.imageHeightMm))
      : (defaults.imageHeightMm ?? 40),
    imageOpacity: typeof source.imageOpacity === 'number'
      ? Math.max(0, Math.min(100, source.imageOpacity))
      : (defaults.imageOpacity ?? 100),
    imageBorderRadius: typeof source.imageBorderRadius === 'number'
      ? Math.max(0, Math.min(999, source.imageBorderRadius))
      : (defaults.imageBorderRadius ?? 0),
    imageBorderWidth: typeof source.imageBorderWidth === 'number'
      ? Math.max(0, Math.min(24, source.imageBorderWidth))
      : (defaults.imageBorderWidth ?? 0),
    imageBorderColor: typeof source.imageBorderColor === 'string'
      ? source.imageBorderColor
      : (defaults.imageBorderColor ?? '#94a3b8'),
    imageShadow: typeof source.imageShadow === 'boolean'
      ? source.imageShadow
      : (defaults.imageShadow ?? false),
    imageBackgroundColor: typeof source.imageBackgroundColor === 'string'
      ? source.imageBackgroundColor
      : (defaults.imageBackgroundColor ?? 'transparent'),
    imageRotation: typeof source.imageRotation === 'number'
      ? Math.max(-180, Math.min(180, source.imageRotation))
      : (defaults.imageRotation ?? 0),
    zonePaddingMm: typeof source.zonePaddingMm === 'number'
      ? Math.max(0, Math.min(30, source.zonePaddingMm))
      : (defaults.zonePaddingMm ?? 3),
    zonePaddingXMm: typeof source.zonePaddingXMm === 'number'
      ? Math.max(0, Math.min(30, source.zonePaddingXMm))
      : (typeof source.zonePaddingMm === 'number'
        ? Math.max(0, Math.min(30, source.zonePaddingMm))
        : (defaults.zonePaddingXMm ?? defaults.zonePaddingMm ?? 3)),
    zonePaddingYMm: typeof source.zonePaddingYMm === 'number'
      ? Math.max(0, Math.min(30, source.zonePaddingYMm))
      : (typeof source.zonePaddingMm === 'number'
        ? Math.max(0, Math.min(30, source.zonePaddingMm))
        : (defaults.zonePaddingYMm ?? defaults.zonePaddingMm ?? 3)),
    zoneMinHeightMm: typeof source.zoneMinHeightMm === 'number'
      ? Math.max(10, Math.min(260, source.zoneMinHeightMm))
      : (defaults.zoneMinHeightMm ?? 45),
    zoneOpacity: typeof source.zoneOpacity === 'number'
      ? Math.max(0, Math.min(100, source.zoneOpacity))
      : (defaults.zoneOpacity ?? 100),
    zoneBackgroundOpacity: typeof source.zoneBackgroundOpacity === 'number'
      ? Math.max(0, Math.min(100, source.zoneBackgroundOpacity))
      : (typeof source.zoneOpacity === 'number'
        ? Math.max(0, Math.min(100, source.zoneOpacity))
        : (defaults.zoneBackgroundOpacity ?? defaults.zoneOpacity ?? 100)),
    zoneBackgroundColor: typeof source.zoneBackgroundColor === 'string'
      ? source.zoneBackgroundColor
      : (defaults.zoneBackgroundColor ?? '#ffffff'),
    zoneBorderColor: typeof source.zoneBorderColor === 'string'
      ? source.zoneBorderColor
      : (defaults.zoneBorderColor ?? '#94a3b8'),
    zoneBorderWidth: typeof source.zoneBorderWidth === 'number'
      ? Math.max(0, Math.min(12, source.zoneBorderWidth))
      : (defaults.zoneBorderWidth ?? 0),
    zoneBorderRadius: typeof source.zoneBorderRadius === 'number'
      ? Math.max(0, Math.min(999, source.zoneBorderRadius))
      : (defaults.zoneBorderRadius ?? 6),
    zoneBorderTransparent: typeof source.zoneBorderTransparent === 'boolean'
      ? source.zoneBorderTransparent
      : (defaults.zoneBorderTransparent ?? false),
    zoneBorderStyle: source.zoneBorderStyle === 'dashed' || source.zoneBorderStyle === 'dotted'
      ? source.zoneBorderStyle
      : (defaults.zoneBorderStyle ?? 'solid'),
    zoneBorderOpacity: typeof source.zoneBorderOpacity === 'number'
      ? Math.max(0, Math.min(100, source.zoneBorderOpacity))
      : (typeof source.zoneBorderTransparent === 'boolean'
        ? (source.zoneBorderTransparent ? 0 : 100)
        : (defaults.zoneBorderOpacity ?? (defaults.zoneBorderTransparent ? 0 : 100))),
    zoneShadow: typeof source.zoneShadow === 'boolean'
      ? source.zoneShadow
      : (defaults.zoneShadow ?? false),
    tableDataSource: source.tableDataSource === 'equipment_by_category'
      ? source.tableDataSource
      : (defaults.tableDataSource ?? 'equipment_by_category'),
    tableColumns: Array.isArray(source.tableColumns)
      ? source.tableColumns.filter((key: unknown): key is TableColumnKey => isTableColumnKey(key))
      : (defaults.tableColumns ?? [...DEFAULT_TABLE_COLUMNS]),
    tableShowCategories: typeof source.tableShowCategories === 'boolean'
      ? source.tableShowCategories
      : (defaults.tableShowCategories ?? true),
    tableHeaderBackground: typeof source.tableHeaderBackground === 'string'
      ? source.tableHeaderBackground
      : (defaults.tableHeaderBackground ?? '#0f172a'),
    tableHeaderTextColor: typeof source.tableHeaderTextColor === 'string'
      ? source.tableHeaderTextColor
      : (defaults.tableHeaderTextColor ?? '#f8fafc'),
    tableBodyBackground: typeof source.tableBodyBackground === 'string'
      ? source.tableBodyBackground
      : (defaults.tableBodyBackground ?? '#f8fafc'),
    tableCategoryBackground: typeof source.tableCategoryBackground === 'string'
      ? source.tableCategoryBackground
      : (defaults.tableCategoryBackground ?? '#e2e8f0'),
    tableCategoryTextColor: typeof source.tableCategoryTextColor === 'string'
      ? source.tableCategoryTextColor
      : (defaults.tableCategoryTextColor ?? '#0f172a'),
    tableBorderColor: typeof source.tableBorderColor === 'string'
      ? source.tableBorderColor
      : (defaults.tableBorderColor ?? '#cbd5e1'),
    tableBorderWidth: typeof source.tableBorderWidth === 'number'
      ? Math.max(0, Math.min(12, source.tableBorderWidth))
      : (defaults.tableBorderWidth ?? 1),
    tableBorderRadius: typeof source.tableBorderRadius === 'number'
      ? Math.max(0, Math.min(999, source.tableBorderRadius))
      : (defaults.tableBorderRadius ?? 12),
    tableCellPaddingX: typeof source.tableCellPaddingX === 'number'
      ? Math.max(0, Math.min(64, source.tableCellPaddingX))
      : (defaults.tableCellPaddingX ?? 14),
    tableCellPaddingY: typeof source.tableCellPaddingY === 'number'
      ? Math.max(0, Math.min(64, source.tableCellPaddingY))
      : (defaults.tableCellPaddingY ?? 10),
    tableRowGapPx: typeof source.tableRowGapPx === 'number'
      ? Math.max(0, Math.min(48, source.tableRowGapPx))
      : (defaults.tableRowGapPx ?? 0),
    tableFontSizePt: typeof source.tableFontSizePt === 'number'
      ? Math.max(7, Math.min(36, source.tableFontSizePt))
      : (defaults.tableFontSizePt ?? 12),
    tableHeaderFontSizePt: typeof source.tableHeaderFontSizePt === 'number'
      ? Math.max(7, Math.min(42, source.tableHeaderFontSizePt))
      : (defaults.tableHeaderFontSizePt ?? 13),
    tableHeaderBold: typeof source.tableHeaderBold === 'boolean'
      ? source.tableHeaderBold
      : (defaults.tableHeaderBold ?? true),
    tableHeaderTextAlign: source.tableHeaderTextAlign === 'left' || source.tableHeaderTextAlign === 'center' || source.tableHeaderTextAlign === 'right'
      ? source.tableHeaderTextAlign
      : (defaults.tableHeaderTextAlign ?? 'auto'),
    tableCategoryTextAlign: source.tableCategoryTextAlign === 'center' || source.tableCategoryTextAlign === 'right'
      ? source.tableCategoryTextAlign
      : (defaults.tableCategoryTextAlign ?? 'left'),
    tableBodyTextAlign: source.tableBodyTextAlign === 'left' || source.tableBodyTextAlign === 'center' || source.tableBodyTextAlign === 'right'
      ? source.tableBodyTextAlign
      : (defaults.tableBodyTextAlign ?? 'auto'),
    tableHeaderColumnAlign: sanitizeTableColumnAlignMap(source.tableHeaderColumnAlign),
    tableBodyColumnAlign: sanitizeTableColumnAlignMap(source.tableBodyColumnAlign),
    pageBreakReplicate: typeof source.pageBreakReplicate === 'boolean'
      ? source.pageBreakReplicate
      : (defaults.pageBreakReplicate ?? false),
    pageBreakMode: source.pageBreakMode === 'flow'
      ? 'flow'
      : (defaults.pageBreakMode ?? 'fixed'),
    pageBreakAnchor: source.pageBreakAnchor === 'bottom'
      ? 'bottom'
      : (defaults.pageBreakAnchor ?? 'top'),
    pageBreakOffsetMm: typeof source.pageBreakOffsetMm === 'number'
      ? Math.max(0, Math.min(260, source.pageBreakOffsetMm))
      : (defaults.pageBreakOffsetMm ?? 0),
    pageBreakFlowGapMm: typeof source.pageBreakFlowGapMm === 'number'
      ? Math.max(0, Math.min(260, source.pageBreakFlowGapMm))
      : (defaults.pageBreakFlowGapMm ?? 0),
    followEnabled: typeof source.followEnabled === 'boolean'
      ? source.followEnabled
      : (defaults.followEnabled ?? false),
    followTargetId: typeof source.followTargetId === 'string'
      ? source.followTargetId
      : (defaults.followTargetId ?? null),
    followPosition: source.followPosition === 'above' || source.followPosition === 'left' || source.followPosition === 'right'
      ? source.followPosition
      : (defaults.followPosition ?? 'below'),
    followAlign: source.followAlign === 'center' || source.followAlign === 'end'
      ? source.followAlign
      : (defaults.followAlign ?? 'start'),
    followGapMm: typeof source.followGapMm === 'number'
      ? Math.max(0, Math.min(260, source.followGapMm))
      : (defaults.followGapMm ?? 4),
    followOffsetXMm: typeof source.followOffsetXMm === 'number'
      ? Math.max(-210, Math.min(210, source.followOffsetXMm))
      : (defaults.followOffsetXMm ?? 0),
    followOffsetYMm: typeof source.followOffsetYMm === 'number'
      ? Math.max(-297, Math.min(297, source.followOffsetYMm))
      : (defaults.followOffsetYMm ?? 0),
  };

  if (!Array.isArray(hydrated.tableColumns) || hydrated.tableColumns.length === 0) {
    hydrated.tableColumns = [...DEFAULT_TABLE_COLUMNS];
  }

  if (type === 'zone') {
    const hydratedZoneBorderWidth = typeof hydrated.zoneBorderWidth === 'number' ? hydrated.zoneBorderWidth : 0;
    const hydratedZoneBorderColor = typeof hydrated.zoneBorderColor === 'string' ? hydrated.zoneBorderColor : '#94a3b8';
    const hydratedZoneBorderOpacity = typeof hydrated.zoneBorderOpacity === 'number' ? hydrated.zoneBorderOpacity : 100;
    const hydratedZoneBorderStyle: SimpleBorderStyle = hydrated.zoneBorderStyle === 'dashed' || hydrated.zoneBorderStyle === 'dotted'
      ? hydrated.zoneBorderStyle
      : 'solid';
    const hydratedZoneBorderTransparent = !!hydrated.zoneBorderTransparent;

    if (isLegacyZoneBorderStyle({
      width: hydratedZoneBorderWidth,
      color: hydratedZoneBorderColor,
      opacity: hydratedZoneBorderOpacity,
      style: hydratedZoneBorderStyle,
      transparent: hydratedZoneBorderTransparent,
    })) {
      hydrated.zoneBorderWidth = 0;
    }

    const rawZoneChildren = Array.isArray(source.zoneChildren) ? source.zoneChildren : [];
    hydrated.zoneChildren = rawZoneChildren
      .map((rawChild) => hydrateTemplateBlock(rawChild))
      .filter((entry): entry is TemplateBlock => entry !== null);
    const hasGridChild = blockTreeContainsType(hydrated.zoneChildren ?? [], 'grid');
    if (hasGridChild) {
      hydrated.zoneBorderWidth = 0;
    }
    return hydrated;
  }

  if (type !== 'grid') return hydrated;

  const rows = clampInteger(source.gridRows, 1, 12, 2);
  const columns = clampInteger(source.gridColumns, 1, 12, 2);
  const rawCells = Array.isArray(source.gridCells) ? source.gridCells : [];
  const parsedCells = Array.from({ length: rows * columns }, (_, idx) => {
    const rawCellBlocks = Array.isArray(rawCells[idx]) ? rawCells[idx] : [];
    return rawCellBlocks
      .map((cellRaw) => hydrateTemplateBlock(cellRaw))
      .filter((entry): entry is TemplateBlock => entry !== null);
  });

  hydrated.gridRows = rows;
  hydrated.gridColumns = columns;
  hydrated.gridDividerColor = typeof source.gridDividerColor === 'string' ? source.gridDividerColor : '#94a3b8';
  hydrated.gridDividerWidth = typeof source.gridDividerWidth === 'number' ? Math.max(0, source.gridDividerWidth) : 1;
  hydrated.gridDividerStyle = source.gridDividerStyle === 'dashed' || source.gridDividerStyle === 'dotted'
    ? source.gridDividerStyle
    : 'solid';
  hydrated.gridBorders = normalizeGridBorders(source.gridBorders);
  hydrated.gridBorderTransparent = typeof source.gridBorderTransparent === 'boolean' ? source.gridBorderTransparent : false;
  hydrated.gridCellPaddingXMm = typeof source.gridCellPaddingXMm === 'number'
    ? Math.max(0, Math.min(40, source.gridCellPaddingXMm))
    : 2;
  hydrated.gridCellPaddingYMm = typeof source.gridCellPaddingYMm === 'number'
    ? Math.max(0, Math.min(40, source.gridCellPaddingYMm))
    : 2;
  hydrated.gridCellMinHeightMm = typeof source.gridCellMinHeightMm === 'number'
    ? Math.max(2, Math.min(120, source.gridCellMinHeightMm))
    : 12;
  hydrated.gridBackgroundColor = typeof source.gridBackgroundColor === 'string' ? source.gridBackgroundColor : 'transparent';
  hydrated.gridCellBackgroundColor = typeof source.gridCellBackgroundColor === 'string' ? source.gridCellBackgroundColor : 'transparent';
  hydrated.gridOpacity = typeof source.gridOpacity === 'number'
    ? Math.max(0, Math.min(100, source.gridOpacity))
    : 100;
  hydrated.gridBorderOpacity = typeof source.gridBorderOpacity === 'number'
    ? Math.max(0, Math.min(100, source.gridBorderOpacity))
    : (typeof source.gridBorderTransparent === 'boolean' ? (source.gridBorderTransparent ? 0 : 100) : 100);
  hydrated.gridBackgroundOpacity = typeof source.gridBackgroundOpacity === 'number'
    ? Math.max(0, Math.min(100, source.gridBackgroundOpacity))
    : (typeof source.gridOpacity === 'number' ? Math.max(0, Math.min(100, source.gridOpacity)) : 100);
  hydrated.gridCellBackgroundOpacity = typeof source.gridCellBackgroundOpacity === 'number'
    ? Math.max(0, Math.min(100, source.gridCellBackgroundOpacity))
    : (typeof source.gridOpacity === 'number' ? Math.max(0, Math.min(100, source.gridOpacity)) : 100);
  hydrated.gridBorderRadius = typeof source.gridBorderRadius === 'number'
    ? Math.max(0, Math.min(999, source.gridBorderRadius))
    : 0;
  hydrated.gridCells = parsedCells;

  return hydrated;
};

const getBlockLabel = (block: TemplateBlock): string => {
  if (block.type === 'grid') {
    const rows = Math.max(1, block.gridRows ?? 1);
    const columns = Math.max(1, block.gridColumns ?? 1);
    return `Grille ${rows}x${columns}`;
  }
  if (block.type === 'zone') {
    return 'Zone flottante';
  }
  if (block.type === 'table') {
    return 'Tableau';
  }
  const rich = ensureEditorHtml(block);
  const fromHtml = stripHtml(rich);
  if (fromHtml) return fromHtml;
  const text = block.text?.trim();
  if (text) return text;
  if (block.type === 'subtitle') return 'Sous-titre';
  if (block.type === 'separator') return 'Séparateur';
  if (block.type === 'image') return 'Image';
  if (block.type === 'qrcode') return 'QR code';
  return 'Titre';
};

const flattenLayerEntries = (blocks: TemplateBlock[], depth = 0): LayerEntry[] => {
  const entries: LayerEntry[] = [];

  for (const block of blocks) {
    entries.push({
      id: block.id,
      type: block.type,
      label: getBlockLabel(block),
      depth,
    });

    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      for (const cellBlocks of cells) {
        entries.push(...flattenLayerEntries(cellBlocks, depth + 1));
      }
      continue;
    }
    if (block.type === 'zone') {
      entries.push(...flattenLayerEntries(block.zoneChildren ?? [], depth + 1));
    }
  }

  return entries;
};

const collectBlockIds = (blocks: TemplateBlock[]): string[] => {
  const ids: string[] = [];
  for (const block of blocks) {
    ids.push(block.id);
    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      for (const cellBlocks of cells) {
        ids.push(...collectBlockIds(cellBlocks));
      }
      continue;
    }
    if (block.type === 'zone') {
      ids.push(...collectBlockIds(block.zoneChildren ?? []));
    }
  }
  return ids;
};

const updateBlocksInTreeByIds = (
  blocks: TemplateBlock[],
  updatesById: Map<string, Partial<TemplateBlock>>
): [TemplateBlock[], boolean] => {
  let changed = false;

  const nextBlocks = blocks.map((block) => {
    const ownUpdates = updatesById.get(block.id);
    let nextBlock = ownUpdates ? { ...block, ...ownUpdates } : block;
    if (ownUpdates) {
      changed = true;
    }

    if (nextBlock.type === 'grid') {
      const rows = Math.max(1, nextBlock.gridRows ?? 1);
      const columns = Math.max(1, nextBlock.gridColumns ?? 1);
      const cells = normalizeGridCellList(nextBlock.gridCells, rows, columns);
      let nestedChanged = false;

      const nextCells = cells.map((cellBlocks) => {
        const [nextCellBlocks, didChange] = updateBlocksInTreeByIds(cellBlocks, updatesById);
        if (didChange) nestedChanged = true;
        return nextCellBlocks;
      });

      if (nestedChanged) {
        changed = true;
        nextBlock = {
          ...nextBlock,
          gridRows: rows,
          gridColumns: columns,
          gridCells: nextCells,
        };
      }
      return nextBlock;
    }

    if (nextBlock.type === 'zone') {
      const [nextZoneChildren, nestedChanged] = updateBlocksInTreeByIds(nextBlock.zoneChildren ?? [], updatesById);
      if (nestedChanged) {
        changed = true;
        nextBlock = { ...nextBlock, zoneChildren: nextZoneChildren };
      }
      return nextBlock;
    }

    return nextBlock;
  });

  return [changed ? nextBlocks : blocks, changed];
};

const areRectMapsEqual = (
  prev: Record<string, { x: number; y: number; width: number; height: number }>,
  next: Record<string, { x: number; y: number; width: number; height: number }>
): boolean => {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of prevKeys) {
    const a = prev[key];
    const b = next[key];
    if (!a || !b) return false;
    if (Math.abs(a.x - b.x) > 0.05) return false;
    if (Math.abs(a.y - b.y) > 0.05) return false;
    if (Math.abs(a.width - b.width) > 0.05) return false;
    if (Math.abs(a.height - b.height) > 0.05) return false;
  }
  return true;
};

const TemplateStudio: React.FC = () => {
  const location = useLocation();
  const { settings, saveSettings } = useCompanySettings();
  const activeTemplateType = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeTemplateStudioDocumentType(params.get(TEMPLATE_STUDIO_DOC_PARAM));
  }, [location.search]);
  const activeTemplateLabel = useMemo(
    () => getTemplateStudioDocumentLabel(activeTemplateType),
    [activeTemplateType]
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(60);
  const [activeTool, setActiveTool] = useState<'margins' | 'pageBands' | 'blocks' | 'layers' | 'blockStyle' | 'templateLibrary'>('margins');
  const [marginTop, setMarginTop] = useState(20);
  const [marginBottom, setMarginBottom] = useState(20);
  const [marginLeft, setMarginLeft] = useState(14);
  const [marginRight, setMarginRight] = useState(14);
  const [pageBackgroundColor, setPageBackgroundColor] = useState('#ffffff');
  const [pageBackgroundImage, setPageBackgroundImage] = useState('');
  const [pageBackgroundOpacity, setPageBackgroundOpacity] = useState(100);
  const [pageBackgroundSize, setPageBackgroundSize] = useState<BackgroundSizeMode>('cover');
  const [pageBandSettings, setPageBandSettings] = useState<PageBandSettings>(() => ({
    ...DEFAULT_PAGE_BAND_SETTINGS,
    header: { ...DEFAULT_PAGE_BAND_SETTINGS.header },
    footer: { ...DEFAULT_PAGE_BAND_SETTINGS.footer },
  }));
  const [pageBandFocusField, setPageBandFocusField] = useState<PageBandFieldKey | null>(null);
  const [pageBandVariableSearch, setPageBandVariableSearch] = useState('');
  const [linkVertical, setLinkVertical] = useState(false);
  const [linkHorizontal, setLinkHorizontal] = useState(false);
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [layerGroups, setLayerGroups] = useState<LayerGroup[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectedTableText, setSelectedTableText] = useState<TableTextSelection | null>(null);
  const [draggingFlowBlockId, setDraggingFlowBlockId] = useState<string | null>(null);
  const [flowDropTarget, setFlowDropTarget] = useState<{ targetId: string; position: FlowDropPosition } | null>(null);
  const [draggingTableColumnKey, setDraggingTableColumnKey] = useState<TableColumnKey | null>(null);
  const [tableColumnDropTarget, setTableColumnDropTarget] = useState<{ key: TableColumnKey; position: FlowDropPosition } | null>(null);
  const [tableColumnToAdd, setTableColumnToAdd] = useState<TableColumnKey | ''>('');
  const [tableSettingsTab, setTableSettingsTab] = useState<'text' | 'layout' | 'data' | 'style' | 'colors'>('text');
  const [zoneSettingsTab, setZoneSettingsTab] = useState<'layout' | 'dimensions' | 'style'>('layout');
  const [gridSettingsTab, setGridSettingsTab] = useState<'structure' | 'style' | 'brush'>('structure');
  const [blockContextMenu, setBlockContextMenu] = useState<BlockContextMenu | null>(null);
  const [variableSearch, setVariableSearch] = useState('');
  const [gridBrushColor, setGridBrushColor] = useState('#3b82f6');
  const [gridBrushWidth, setGridBrushWidth] = useState(1);
  const [showGuides, setShowGuides] = useState(false);
  const [draftEditorState, setDraftEditorState] = useState<EditorState>(() => EditorState.createEmpty());
  const [blockRectsMm, setBlockRectsMm] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [tablePreviewGroups, setTablePreviewGroups] = useState<TablePreviewGroup[]>(() => TABLE_FALLBACK_DATA);
  const [tablePreviewSimulationByBlockId, setTablePreviewSimulationByBlockId] = useState<Record<string, TablePreviewSimulationSettings>>({});
  const [savedTemplates, setSavedTemplates] = useState<StudioNamedTemplate[]>([]);
  const [activeSavedTemplateId, setActiveSavedTemplateId] = useState<string | null>(null);
  const [savedTemplateName, setSavedTemplateName] = useState('');
  const [libraryActiveByDoc, setLibraryActiveByDoc] = useState<Record<string, string>>({});
  const [canUndo, setCanUndo] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const previewPageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const contentCanvasRef = useRef<HTMLDivElement | null>(null);
  const blockContextMenuRef = useRef<HTMLDivElement | null>(null);
  const localTemplateImportInputRef = useRef<HTMLInputElement | null>(null);
  const renderedBlockRefs = useRef<Record<string, HTMLElement | null>>({});
  const draftLoadedBlockIdRef = useRef<string | null>(null);
  const draftSelectionRef = useRef<SelectionState | null>(null);
  const floatingInteractionRef = useRef<FloatingInteraction | null>(null);
  const guidesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoPastRef = useRef<StudioUndoSnapshot[]>([]);
  const undoFutureRef = useRef<StudioUndoSnapshot[]>([]);
  const lastUndoSnapshotRef = useRef<StudioUndoSnapshot | null>(null);
  const lastUndoSerializedRef = useRef('');
  const applyingUndoSnapshotRef = useRef(false);
  const resetUndoBaselineRef = useRef(true);

  const clampZoom = useCallback((value: number) => {
    if (Number.isNaN(value)) return 100;
    return Math.min(200, Math.max(40, value));
  }, []);

  const pageScale = zoom / 100;
  const pageWidthPx = A4_WIDTH_MM * MM_TO_PX;
  const pageHeightPx = A4_HEIGHT_MM * MM_TO_PX;
  const showPageBandOverlay = useMemo(() => (
    pageBandSettings.enabled && (
      pageBandSettings.header.left.trim().length > 0
      || pageBandSettings.header.center.trim().length > 0
      || pageBandSettings.header.right.trim().length > 0
      || pageBandSettings.footer.left.trim().length > 0
      || pageBandSettings.footer.center.trim().length > 0
      || pageBandSettings.footer.right.trim().length > 0
    )
  ), [pageBandSettings]);

  const showGuidesNow = useCallback(() => {
    if (guidesTimeoutRef.current) {
      clearTimeout(guidesTimeoutRef.current);
    }
    setShowGuides(true);
  }, []);

  const hideGuidesSoon = useCallback(() => {
    if (guidesTimeoutRef.current) {
      clearTimeout(guidesTimeoutRef.current);
    }
    guidesTimeoutRef.current = setTimeout(() => {
      setShowGuides(false);
    }, 1200);
  }, []);

  const flashGuides = useCallback(() => {
    showGuidesNow();
    hideGuidesSoon();
  }, [hideGuidesSoon, showGuidesNow]);

  useEffect(() => {
    return () => {
      if (guidesTimeoutRef.current) {
        clearTimeout(guidesTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTablePreviewFromDatabase = async () => {
      try {
        const { data, error } = await supabase
          .from('rentals')
          .select(`
            start_date,
            end_date,
            rental_coefficient_override,
            created_at,
            rental_items (
              quantity,
              price_per_day,
              discount_percent,
              equipment_type,
              is_external,
              external_name,
              external_type,
              external_subtype,
              equipment:equipment_id (
                name,
                type
              )
            )
          `)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;

        const source = Array.isArray(data) && data.length > 0
          ? data[0] as TablePreviewRentalSource
          : null;
        const nextGroups = buildPreviewTableGroupsFromRental(source);
        if (!cancelled) {
          setTablePreviewGroups(nextGroups);
        }
      } catch (_error) {
        if (!cancelled) {
          setTablePreviewGroups(TABLE_FALLBACK_DATA);
        }
      }
    };

    void loadTablePreviewFromDatabase();

    return () => {
      cancelled = true;
    };
  }, []);

  const setRenderedBlockRef = useCallback((blockId: string, node: HTMLElement | null) => {
    if (node) {
      renderedBlockRefs.current[blockId] = node;
    } else {
      delete renderedBlockRefs.current[blockId];
    }
  }, []);

  const contentWidthMm = useMemo(
    () => Math.max(1, A4_WIDTH_MM - Math.max(0, marginLeft) - Math.max(0, marginRight)),
    [marginLeft, marginRight]
  );

  const contentHeightMm = useMemo(
    () => Math.max(1, A4_HEIGHT_MM - Math.max(0, marginTop) - Math.max(0, marginBottom)),
    [marginBottom, marginTop]
  );

  const totalPages = useMemo(() => {
    const maxBottomMm = Object.values(blockRectsMm).reduce((maxValue, rect) => (
      Math.max(maxValue, rect.y + rect.height)
    ), 0);
    const estimatedHeightMm = Math.max(contentHeightMm, maxBottomMm);
    return Math.max(1, Math.ceil(estimatedHeightMm / contentHeightMm));
  }, [blockRectsMm, contentHeightMm]);

  const previewPageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages]
  );

  const clampPage = useCallback((value: number) => {
    if (Number.isNaN(value)) return 1;
    return Math.min(totalPages, Math.max(1, value));
  }, [totalPages]);

  useEffect(() => {
    const contentNode = contentCanvasRef.current;
    if (!contentNode) return;
    const contentRect = contentNode.getBoundingClientRect();
    if (contentRect.width <= 0 || contentRect.height <= 0) return;

    const nextRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
    Object.entries(renderedBlockRefs.current).forEach(([id, node]) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      nextRects[id] = {
        x: ((rect.left - contentRect.left) / contentRect.width) * contentWidthMm,
        y: ((rect.top - contentRect.top) / contentRect.height) * contentHeightMm,
        width: (rect.width / contentRect.width) * contentWidthMm,
        height: (rect.height / contentRect.height) * contentHeightMm,
      };
    });

    setBlockRectsMm((prev) => (areRectMapsEqual(prev, nextRects) ? prev : nextRects));
  }, [
    blocks,
    contentHeightMm,
    contentWidthMm,
    marginBottom,
    marginLeft,
    marginRight,
    marginTop,
    tablePreviewGroups,
    tablePreviewSimulationByBlockId,
    zoom,
  ]);

  const marginGuidesStyle = useMemo(() => {
    return {
      top: `${(Math.max(0, marginTop) / A4_HEIGHT_MM) * 100}%`,
      bottom: `${(Math.max(0, marginBottom) / A4_HEIGHT_MM) * 100}%`,
      left: `${(Math.max(0, marginLeft) / A4_WIDTH_MM) * 100}%`,
      right: `${(Math.max(0, marginRight) / A4_WIDTH_MM) * 100}%`,
    };
  }, [marginTop, marginBottom, marginLeft, marginRight]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return findBlockInTree(blocks, selectedBlockId);
  }, [blocks, selectedBlockId]);

  const selectedBlockIsRoot = useMemo(
    () => (selectedBlockId ? blocks.some((block) => block.id === selectedBlockId) : false),
    [blocks, selectedBlockId]
  );

  useEffect(() => {
    if (!selectedBlock) return;
    if (selectedBlock.type === 'zone') {
      setZoneSettingsTab('layout');
      return;
    }
    if (selectedBlock.type === 'grid') {
      setGridSettingsTab('structure');
      return;
    }
    if (selectedBlock.type === 'table') {
      setTableSettingsTab('text');
    }
  }, [selectedBlock?.id, selectedBlock?.type]);

  useEffect(() => {
    setSelectedTableText((prev) => {
      if (!prev) return prev;
      if (!selectedBlockId || prev.blockId !== selectedBlockId) return null;
      if (!selectedBlock || selectedBlock.type !== 'table') return null;
      if (prev.columnKey) {
        const columns = Array.isArray(selectedBlock.tableColumns) && selectedBlock.tableColumns.length > 0
          ? selectedBlock.tableColumns.filter((key): key is TableColumnKey => isTableColumnKey(key))
          : [...DEFAULT_TABLE_COLUMNS];
        if (!columns.includes(prev.columnKey)) return null;
      }
      return prev;
    });
  }, [selectedBlock, selectedBlockId]);

  useEffect(() => {
    const tableBlockIds = new Set<string>();
    const collectTableIds = (nodes: TemplateBlock[]) => {
      nodes.forEach((node) => {
        if (node.type === 'table') tableBlockIds.add(node.id);
        if (node.type === 'grid') {
          (node.gridCells ?? []).forEach((cell) => collectTableIds(cell));
        }
        if (node.type === 'zone') {
          collectTableIds(node.zoneChildren ?? []);
        }
      });
    };
    collectTableIds(blocks);

    setTablePreviewSimulationByBlockId((prev) => {
      let changed = false;
      const next: Record<string, TablePreviewSimulationSettings> = {};
      Object.entries(prev).forEach(([blockId, value]) => {
        if (!tableBlockIds.has(blockId)) {
          changed = true;
          return;
        }
        next[blockId] = value;
      });
      return changed ? next : prev;
    });
  }, [blocks]);

  const selectedTableTextAlignValue = useMemo<TableTextAlign | null>(() => {
    if (!selectedBlock || selectedBlock.type !== 'table' || !selectedTableText) return null;
    if (selectedTableText.blockId !== selectedBlock.id) return null;

    if (selectedTableText.kind === 'category') {
      return selectedBlock.tableCategoryTextAlign ?? 'left';
    }

    if (!selectedTableText.columnKey) return null;
    if (selectedTableText.kind === 'header') {
      return selectedBlock.tableHeaderColumnAlign?.[selectedTableText.columnKey] ?? 'auto';
    }
    return selectedBlock.tableBodyColumnAlign?.[selectedTableText.columnKey] ?? 'auto';
  }, [selectedBlock, selectedTableText]);

  const selectedTableTextLabel = useMemo(() => {
    if (!selectedTableText) return null;
    if (selectedTableText.kind === 'category') return 'Texte catégorie';
    if (!selectedTableText.columnKey) return null;
    const columnLabel = getTableColumnLabel(selectedTableText.columnKey);
    return selectedTableText.kind === 'header'
      ? `Titre de colonne: ${columnLabel}`
      : `Cellules matériel/service: ${columnLabel}`;
  }, [selectedTableText]);

  const selectedTableColumnsForPanel = useMemo<TableColumnKey[]>(() => {
    if (!selectedBlock || selectedBlock.type !== 'table') return [];
    const requested = Array.isArray(selectedBlock.tableColumns) && selectedBlock.tableColumns.length > 0
      ? selectedBlock.tableColumns
      : [...DEFAULT_TABLE_COLUMNS];
    const sanitized = requested.filter((key): key is TableColumnKey => isTableColumnKey(key));
    return sanitized.length > 0 ? sanitized : [...DEFAULT_TABLE_COLUMNS];
  }, [selectedBlock]);

  const hiddenTableColumnsForPanel = useMemo<TableColumnKey[]>(() => {
    if (!selectedBlock || selectedBlock.type !== 'table') return [];
    return TABLE_COLUMN_DEFINITIONS
      .map((entry) => entry.key)
      .filter((key) => !selectedTableColumnsForPanel.includes(key));
  }, [selectedBlock, selectedTableColumnsForPanel]);

  const selectedTableSimulationSettings = useMemo<TablePreviewSimulationSettings | null>(() => {
    if (!selectedBlock || selectedBlock.type !== 'table') return null;
    const current = tablePreviewSimulationByBlockId[selectedBlock.id];
    if (!current) return createDefaultTableSimulationSettings();
    return {
      enabled: !!current.enabled,
      targetRows: clampValue(
        Number.isFinite(current.targetRows) ? current.targetRows : TABLE_SIMULATION_DEFAULT_ROWS,
        TABLE_SIMULATION_MIN_ROWS,
        TABLE_SIMULATION_MAX_ROWS
      ),
    };
  }, [selectedBlock, tablePreviewSimulationByBlockId]);

  const updateSelectedTableSimulationSettings = useCallback((updates: Partial<TablePreviewSimulationSettings>) => {
    if (!selectedBlock || selectedBlock.type !== 'table') return;
    setTablePreviewSimulationByBlockId((prev) => {
      const current = prev[selectedBlock.id] ?? createDefaultTableSimulationSettings();
      const next: TablePreviewSimulationSettings = {
        enabled: typeof updates.enabled === 'boolean' ? updates.enabled : current.enabled,
        targetRows: clampValue(
          Number.isFinite(updates.targetRows as number) ? Number(updates.targetRows) : current.targetRows,
          TABLE_SIMULATION_MIN_ROWS,
          TABLE_SIMULATION_MAX_ROWS
        ),
      };
      return {
        ...prev,
        [selectedBlock.id]: next,
      };
    });
  }, [selectedBlock]);

  const getPreviewGroupsForTableBlock = useCallback((block: TemplateBlock): TablePreviewGroup[] => {
    const simulation = tablePreviewSimulationByBlockId[block.id];
    if (!simulation?.enabled) return tablePreviewGroups;
    return buildSimulatedTableGroups(tablePreviewGroups, simulation.targetRows);
  }, [tablePreviewGroups, tablePreviewSimulationByBlockId]);

  const updateSelectedBlock = useCallback((updates: Partial<TemplateBlock>) => {
    if (!selectedBlockId) return;
    setBlocks((prev) => {
      const [nextBlocks] = updateBlockInTree(prev, selectedBlockId, (block) => ({ ...block, ...updates }));
      return nextBlocks;
    });
  }, [selectedBlockId]);

  useEffect(() => {
    if (!selectedBlock || selectedBlock.type !== 'table' || hiddenTableColumnsForPanel.length === 0) {
      setTableColumnToAdd('');
      return;
    }
    setTableColumnToAdd((prev) => (
      prev && hiddenTableColumnsForPanel.includes(prev) ? prev : hiddenTableColumnsForPanel[0]
    ));
  }, [hiddenTableColumnsForPanel, selectedBlock]);

  const addTableColumnToSelectedBlock = useCallback((columnKey: TableColumnKey) => {
    if (!selectedBlock || selectedBlock.type !== 'table') return;
    if (selectedTableColumnsForPanel.includes(columnKey)) return;
    updateSelectedBlock({
      tableColumns: [...selectedTableColumnsForPanel, columnKey],
    });
  }, [selectedBlock, selectedTableColumnsForPanel, updateSelectedBlock]);

  const removeTableColumnFromSelectedBlock = useCallback((columnKey: TableColumnKey) => {
    if (!selectedBlock || selectedBlock.type !== 'table') return;
    if (selectedTableColumnsForPanel.length <= 1) return;
    const next = selectedTableColumnsForPanel.filter((key) => key !== columnKey);
    updateSelectedBlock({
      tableColumns: next.length > 0 ? next : [...DEFAULT_TABLE_COLUMNS],
    });
  }, [selectedBlock, selectedTableColumnsForPanel, updateSelectedBlock]);

  const reorderSelectedTableColumns = useCallback((
    draggedKey: TableColumnKey,
    targetKey: TableColumnKey,
    position: FlowDropPosition
  ) => {
    if (!selectedBlock || selectedBlock.type !== 'table') return;
    if (draggedKey === targetKey) return;
    const fromIndex = selectedTableColumnsForPanel.indexOf(draggedKey);
    const targetIndex = selectedTableColumnsForPanel.indexOf(targetKey);
    if (fromIndex < 0 || targetIndex < 0) return;

    const next = [...selectedTableColumnsForPanel];
    const [moved] = next.splice(fromIndex, 1);
    let insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
    if (fromIndex < insertIndex) insertIndex -= 1;
    next.splice(insertIndex, 0, moved);
    updateSelectedBlock({
      tableColumns: next,
    });
  }, [selectedBlock, selectedTableColumnsForPanel, updateSelectedBlock]);

  const handleTableColumnDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, columnKey: TableColumnKey) => {
    event.dataTransfer.setData('application/x-openrig-table-column', columnKey);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingTableColumnKey(columnKey);
    setTableColumnDropTarget(null);
  }, []);

  const handleTableColumnDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, columnKey: TableColumnKey) => {
    const draggedKeyRaw = event.dataTransfer.getData('application/x-openrig-table-column') || draggingTableColumnKey;
    if (!draggedKeyRaw || !isTableColumnKey(draggedKeyRaw) || draggedKeyRaw === columnKey) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const position: FlowDropPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setTableColumnDropTarget((prev) => (
      prev && prev.key === columnKey && prev.position === position
        ? prev
        : { key: columnKey, position }
    ));
  }, [draggingTableColumnKey]);

  const handleTableColumnDrop = useCallback((event: React.DragEvent<HTMLDivElement>, columnKey: TableColumnKey) => {
    const draggedKeyRaw = event.dataTransfer.getData('application/x-openrig-table-column') || draggingTableColumnKey;
    if (!draggedKeyRaw || !isTableColumnKey(draggedKeyRaw) || draggedKeyRaw === columnKey) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const position: FlowDropPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    reorderSelectedTableColumns(draggedKeyRaw, columnKey, position);
    setDraggingTableColumnKey(null);
    setTableColumnDropTarget(null);
  }, [draggingTableColumnKey, reorderSelectedTableColumns]);

  const handleTableColumnDragEnd = useCallback(() => {
    setDraggingTableColumnKey(null);
    setTableColumnDropTarget(null);
  }, []);

  const isRichTextBlockSelected = !!selectedBlock && (selectedBlock.type === 'title' || selectedBlock.type === 'subtitle');

  const layerEntries = useMemo(() => flattenLayerEntries(blocks), [blocks]);

  const layerEntryMap = useMemo(
    () => new Map(layerEntries.map((entry) => [entry.id, entry])),
    [layerEntries]
  );

  const filteredVariableGroups = useMemo(() => {
    const query = variableSearch.trim().toLowerCase();
    if (!query) return STUDIO_VARIABLE_GROUPS;
    return STUDIO_VARIABLE_GROUPS
      .map((group) => ({
        ...group,
        variables: group.variables.filter((variable) => (
          variable.label.toLowerCase().includes(query)
          || variable.key.toLowerCase().includes(query)
          || variable.placeholder.toLowerCase().includes(query)
        )),
      }))
      .filter((group) => group.variables.length > 0);
  }, [variableSearch]);

  const filteredPageBandVariableGroups = useMemo(() => {
    const query = pageBandVariableSearch.trim().toLowerCase();
    if (!query) return STUDIO_VARIABLE_GROUPS;
    return STUDIO_VARIABLE_GROUPS
      .map((group) => ({
        ...group,
        variables: group.variables.filter((variable) => (
          variable.label.toLowerCase().includes(query)
          || variable.key.toLowerCase().includes(query)
          || variable.placeholder.toLowerCase().includes(query)
        )),
      }))
      .filter((group) => group.variables.length > 0);
  }, [pageBandVariableSearch]);

  const updatePageBandText = useCallback((zone: PageBandZone, side: PageBandSide, value: string) => {
    setPageBandSettings((prev) => ({
      ...prev,
      [zone]: {
        ...prev[zone],
        [side]: value,
      },
    }));
  }, []);

  const insertVariableTokenInPageBand = useCallback((variableKey: string) => {
    if (!pageBandFocusField) return;
    const [zoneRaw, sideRaw] = pageBandFocusField.split('.');
    if ((zoneRaw !== 'header' && zoneRaw !== 'footer') || (sideRaw !== 'left' && sideRaw !== 'center' && sideRaw !== 'right')) {
      return;
    }
    const zone = zoneRaw as PageBandZone;
    const side = sideRaw as PageBandSide;
    const token = `{{${variableKey}}}`;
    setPageBandSettings((prev) => ({
      ...prev,
      [zone]: {
        ...prev[zone],
        [side]: `${prev[zone][side] || ''}${token}`,
      },
    }));
  }, [pageBandFocusField]);

  const getPreviewBandHtml = useCallback((value: string, pageNumber: number, pageCount: number) => {
    const escaped = escapeHtml(value || '').replace(/\r?\n/g, '<br/>');
    return escaped.replace(VARIABLE_TOKEN_REGEX, (_full, key: string) => {
      const normalizedKey = key.trim();
      if (normalizedKey === 'document_page') {
        return `<span style="background:rgba(59,130,246,0.16);color:inherit;border-radius:4px;padding:0 4px;border:1px dashed rgba(59,130,246,0.45);">${String(pageNumber)}</span>`;
      }
      if (normalizedKey === 'document_pages') {
        return `<span style="background:rgba(59,130,246,0.16);color:inherit;border-radius:4px;padding:0 4px;border:1px dashed rgba(59,130,246,0.45);">${String(pageCount)}</span>`;
      }
      const placeholder = STUDIO_VARIABLE_MAP.get(normalizedKey);
      if (!placeholder) return `{{${normalizedKey}}}`;
      return `<span style="background:rgba(59,130,246,0.16);color:inherit;border-radius:4px;padding:0 4px;border:1px dashed rgba(59,130,246,0.45);">${escapeHtml(placeholder)}</span>`;
    });
  }, []);

  const followTargetOptions = useMemo(
    () => layerEntries.filter((entry) => entry.id !== selectedBlockId),
    [layerEntries, selectedBlockId]
  );

  useEffect(() => {
    if (blocks.length === 0) return;
    if (Object.keys(blockRectsMm).length === 0) return;

    const rootIds = new Set(blocks.map((block) => block.id));
    const updatesById = new Map<string, Partial<TemplateBlock>>();

    collectBlockIds(blocks).forEach((blockId) => {
      if (!rootIds.has(blockId)) return;
      const block = findBlockInTree(blocks, blockId);
      if (!block || !block.followEnabled || !block.followTargetId) return;
      if (block.followTargetId === block.id) return;

      const targetRect = blockRectsMm[block.followTargetId];
      if (!targetRect) return;

      const selfRect = blockRectsMm[block.id];
      const selfWidth = Math.max(10, selfRect?.width ?? (typeof block.floatWidth === 'number' ? block.floatWidth : 120));
      const selfHeight = Math.max(8, selfRect?.height ?? (typeof block.floatHeight === 'number' ? block.floatHeight : 24));

      const followPosition = block.followPosition ?? 'below';
      const followAlign = block.followAlign ?? 'start';
      const followGapMm = clampValue(typeof block.followGapMm === 'number' ? block.followGapMm : 4, 0, 260);
      const offsetX = typeof block.followOffsetXMm === 'number' ? block.followOffsetXMm : 0;
      const offsetY = typeof block.followOffsetYMm === 'number' ? block.followOffsetYMm : 0;

      let nextX = targetRect.x + offsetX;
      let nextY = targetRect.y + targetRect.height + followGapMm + offsetY;

      if (followPosition === 'above') {
        nextY = targetRect.y - selfHeight - followGapMm + offsetY;
      } else if (followPosition === 'left') {
        nextX = targetRect.x - selfWidth - followGapMm + offsetX;
        nextY = targetRect.y + offsetY;
      } else if (followPosition === 'right') {
        nextX = targetRect.x + targetRect.width + followGapMm + offsetX;
        nextY = targetRect.y + offsetY;
      }

      if (followPosition === 'below' || followPosition === 'above') {
        if (followAlign === 'center') {
          nextX = targetRect.x + ((targetRect.width - selfWidth) / 2) + offsetX;
        } else if (followAlign === 'end') {
          nextX = targetRect.x + targetRect.width - selfWidth + offsetX;
        }
      } else {
        if (followAlign === 'center') {
          nextY = targetRect.y + ((targetRect.height - selfHeight) / 2) + offsetY;
        } else if (followAlign === 'end') {
          nextY = targetRect.y + targetRect.height - selfHeight + offsetY;
        }
      }

      nextX = clampValue(nextX, 0, Math.max(0, contentWidthMm - selfWidth));
      nextY = clampValue(nextY, 0, Math.max(0, contentHeightMm - selfHeight));

      const currentX = typeof block.floatX === 'number' ? block.floatX : nextX;
      const currentY = typeof block.floatY === 'number' ? block.floatY : nextY;
      const hasMoved = Math.abs(currentX - nextX) > 0.2 || Math.abs(currentY - nextY) > 0.2;
      if (!hasMoved && block.layoutMode === 'floating') return;

      updatesById.set(block.id, {
        layoutMode: 'floating',
        floatX: nextX,
        floatY: nextY,
      });
    });

    if (updatesById.size === 0) return;
    setBlocks((prev) => {
      const [nextBlocks, changed] = updateBlocksInTreeByIds(prev, updatesById);
      return changed ? nextBlocks : prev;
    });
  }, [blocks, blockRectsMm, contentHeightMm, contentWidthMm]);

  useEffect(() => {
    if (!isRichTextBlockSelected || !selectedBlock) {
      draftLoadedBlockIdRef.current = null;
      draftSelectionRef.current = null;
      setDraftEditorState(EditorState.createEmpty());
      return;
    }

    if (draftLoadedBlockIdRef.current !== selectedBlock.id) {
      const nextEditorState = createEditorStateFromHtml(ensureEditorHtml(selectedBlock));
      draftSelectionRef.current = nextEditorState.getSelection();
      setDraftEditorState(nextEditorState);
      draftLoadedBlockIdRef.current = selectedBlock.id;
    }
  }, [isRichTextBlockSelected, selectedBlock]);

  const deleteBlock = useCallback((blockId: string) => {
    setBlocks((prev) => {
      const [nextBlocks] = deleteBlockInTree(prev, blockId);
      return nextBlocks;
    });
    setSelectedBlockId((prev) => (prev === blockId ? null : prev));
    setSelectedBlockIds((prev) => prev.filter((id) => id !== blockId));
    setBlockContextMenu(null);
  }, []);

  const createLayerGroupFromSelection = useCallback(() => {
    if (selectedBlockIds.length === 0) return;
    setLayerGroups((prev) => [
      ...prev,
      {
        id: createBlockId(),
        name: `Groupe ${prev.length + 1}`,
        blockIds: Array.from(new Set(selectedBlockIds)),
      },
    ]);
  }, [selectedBlockIds]);

  const renameLayerGroup = useCallback((groupId: string, name: string) => {
    setLayerGroups((prev) => prev.map((group) => (
      group.id === groupId ? { ...group, name } : group
    )));
  }, []);

  const deleteLayerGroup = useCallback((groupId: string) => {
    setLayerGroups((prev) => prev.filter((group) => group.id !== groupId));
  }, []);

  const addSelectedBlockToGroup = useCallback((groupId: string) => {
    if (selectedBlockIds.length === 0) return;
    setLayerGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) return group;
      const nextIds = Array.from(new Set([...group.blockIds, ...selectedBlockIds]));
      if (nextIds.length === group.blockIds.length) return group;
      return { ...group, blockIds: nextIds };
    }));
  }, [selectedBlockIds]);

  const removeBlockFromGroup = useCallback((groupId: string, blockId: string) => {
    setLayerGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) return group;
      return { ...group, blockIds: group.blockIds.filter((id) => id !== blockId) };
    }));
  }, []);

  const onFloatingPointerMove = useCallback((event: MouseEvent) => {
    const interaction = floatingInteractionRef.current;
    if (!interaction) return;

    const deltaMmX = ((event.clientX - interaction.startClientX) / interaction.contentRect.width) * interaction.contentWidthMm;
    const deltaMmY = ((event.clientY - interaction.startClientY) / interaction.contentRect.height) * interaction.contentHeightMm;

    const minWidth = 10;
    const minHeight = 8;

    let nextX = interaction.startX;
    let nextY = interaction.startY;
    let nextWidth = interaction.startWidth;
    let nextHeight = interaction.startHeight;

    const isSemiFixed = interaction.layoutMode === 'semi-fixed';
    const horizontalLimit = isSemiFixed ? interaction.maxWidthMm : interaction.contentWidthMm;

    if (interaction.mode === 'drag') {
      nextX = clampValue(interaction.startX + deltaMmX, 0, Math.max(0, horizontalLimit - interaction.startWidth));
      nextY = isSemiFixed
        ? interaction.startY
        : clampValue(interaction.startY + deltaMmY, 0, Math.max(0, interaction.contentHeightMm - interaction.startHeight));

      if (isSemiFixed) {
        const verticalStepThresholdPx = 18;
        const deltaClientY = event.clientY - interaction.startClientY;
        if (Math.abs(deltaClientY) >= verticalStepThresholdPx) {
          const direction = deltaClientY > 0 ? 1 : -1;
          setBlocks((prev) => {
            const semiFixedIds = prev
              .filter((block) => block.type === 'zone' && block.layoutMode === 'semi-fixed')
              .map((block) => block.id);
            if (semiFixedIds.length < 2) return prev;
            const fromSemiIndex = semiFixedIds.indexOf(interaction.blockId);
            if (fromSemiIndex < 0) return prev;
            const targetSemiIndex = clampValue(fromSemiIndex + direction, 0, semiFixedIds.length - 1);
            if (targetSemiIndex === fromSemiIndex) return prev;
            const targetId = semiFixedIds[targetSemiIndex];

            const fromIndex = prev.findIndex((block) => block.id === interaction.blockId);
            const targetIndex = prev.findIndex((block) => block.id === targetId);
            if (fromIndex < 0 || targetIndex < 0 || targetIndex === fromIndex) return prev;

            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            let insertIndex = direction > 0 ? targetIndex + 1 : targetIndex;
            if (fromIndex < insertIndex) insertIndex -= 1;
            next.splice(insertIndex, 0, moved);
            return next;
          });
          interaction.startClientY = event.clientY;
        }
      }
    } else if (interaction.mode === 'resize' && interaction.handle) {
      if (interaction.handle.includes('e')) {
        nextWidth = interaction.startWidth + deltaMmX;
      }
      if (interaction.handle.includes('s')) {
        nextHeight = interaction.startHeight + deltaMmY;
      }
      if (interaction.handle.includes('w')) {
        nextX = interaction.startX + deltaMmX;
        nextWidth = interaction.startWidth - deltaMmX;
      }
      if (interaction.handle.includes('n')) {
        if (!isSemiFixed) {
          nextY = interaction.startY + deltaMmY;
        }
        nextHeight = interaction.startHeight - deltaMmY;
      }

      if (nextWidth < minWidth) {
        if (interaction.handle.includes('w')) {
          nextX -= (minWidth - nextWidth);
        }
        nextWidth = minWidth;
      }
      if (nextHeight < minHeight) {
        if (interaction.handle.includes('n') && !isSemiFixed) {
          nextY -= (minHeight - nextHeight);
        }
        nextHeight = minHeight;
      }

      nextX = clampValue(nextX, 0, Math.max(0, horizontalLimit - nextWidth));
      if (!isSemiFixed) {
        nextY = clampValue(nextY, 0, Math.max(0, interaction.contentHeightMm - nextHeight));
      } else {
        nextY = interaction.startY;
      }
      if (nextX + nextWidth > horizontalLimit) {
        nextWidth = Math.max(minWidth, horizontalLimit - nextX);
      }
      if (nextY + nextHeight > interaction.contentHeightMm) {
        nextHeight = Math.max(minHeight, interaction.contentHeightMm - nextY);
      }
    }

    if (isSemiFixed) {
      nextWidth = clampValue(nextWidth, minWidth, interaction.maxWidthMm);
      nextX = clampValue(nextX, 0, Math.max(0, interaction.maxWidthMm - nextWidth));
      nextY = interaction.startY;
    }

    setBlocks((prev) => {
      const [nextBlocks] = updateBlockInTree(prev, interaction.blockId, (block) => {
        if (block.type === 'grid') return block;
        return {
          ...block,
          layoutMode: interaction.layoutMode,
          floatX: nextX,
          floatY: nextY,
          floatWidth: nextWidth,
          floatHeight: nextHeight,
        };
      });
      return nextBlocks;
    });
  }, []);

  const stopFloatingInteraction = useCallback(() => {
    floatingInteractionRef.current = null;
    window.removeEventListener('mousemove', onFloatingPointerMove);
    window.removeEventListener('mouseup', stopFloatingInteraction);
  }, [onFloatingPointerMove]);

  const startFloatingInteraction = useCallback((
    event: React.MouseEvent<HTMLElement>,
    block: TemplateBlock,
    mode: 'drag' | 'resize',
    handle?: FloatingResizeHandle
  ) => {
    if (event.button !== 0 || block.type === 'grid') return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (!contentCanvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = contentCanvasRef.current.getBoundingClientRect();
    const interactionLayoutMode: 'floating' | 'semi-fixed' = block.layoutMode === 'semi-fixed'
      ? 'semi-fixed'
      : 'floating';
    const maxWidthMm = interactionLayoutMode === 'semi-fixed'
      ? Math.max(10, contentWidthMm - Math.max(0, block.marginLeft) - Math.max(0, block.marginRight))
      : contentWidthMm;
    const startWidth = clampValue(typeof block.floatWidth === 'number' ? block.floatWidth : 120, 10, maxWidthMm);
    const startHeight = typeof block.floatHeight === 'number' ? Math.max(8, block.floatHeight) : 20;
    const boundedX = clampValue(
      typeof block.floatX === 'number' ? block.floatX : 0,
      0,
      Math.max(0, maxWidthMm - startWidth)
    );
    const boundedY = clampValue(typeof block.floatY === 'number' ? block.floatY : 10, 0, Math.max(0, contentHeightMm - startHeight));

    floatingInteractionRef.current = {
      blockId: block.id,
      mode,
      layoutMode: interactionLayoutMode,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: boundedX,
      startY: boundedY,
      startWidth,
      startHeight,
      maxWidthMm,
      contentWidthMm,
      contentHeightMm,
      contentRect: rect,
    };

    setSelectedBlockId(block.id);
    setSelectedBlockIds([block.id]);
    setActiveTool('blockStyle');
    setBlockContextMenu(null);
    window.addEventListener('mousemove', onFloatingPointerMove);
    window.addEventListener('mouseup', stopFloatingInteraction);
  }, [contentHeightMm, contentWidthMm, onFloatingPointerMove, stopFloatingInteraction]);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onFloatingPointerMove);
      window.removeEventListener('mouseup', stopFloatingInteraction);
    };
  }, [onFloatingPointerMove, stopFloatingInteraction]);

  const setSelectedBlockVerticalMargins = useCallback((next: number, source: 'top' | 'bottom') => {
    if (!selectedBlock) return;
    const safe = Number.isFinite(next) ? next : 0;
    if (selectedBlock.linkVertical) {
      const bounded = Math.max(0, Math.min(148, safe));
      updateSelectedBlock({ marginTop: bounded, marginBottom: bounded });
      return;
    }
    if (source === 'top') {
      const bounded = Math.max(0, Math.min(296 - selectedBlock.marginBottom, safe));
      updateSelectedBlock({ marginTop: bounded });
    } else {
      const bounded = Math.max(0, Math.min(296 - selectedBlock.marginTop, safe));
      updateSelectedBlock({ marginBottom: bounded });
    }
  }, [selectedBlock, updateSelectedBlock]);

  const setSelectedBlockHorizontalMargins = useCallback((next: number, source: 'left' | 'right') => {
    if (!selectedBlock) return;
    const safe = Number.isFinite(next) ? next : 0;
    if (selectedBlock.linkHorizontal) {
      const bounded = Math.max(0, Math.min(104, safe));
      updateSelectedBlock({ marginLeft: bounded, marginRight: bounded });
      return;
    }
    if (source === 'left') {
      const bounded = Math.max(0, Math.min(209 - selectedBlock.marginRight, safe));
      updateSelectedBlock({ marginLeft: bounded });
    } else {
      const bounded = Math.max(0, Math.min(209 - selectedBlock.marginLeft, safe));
      updateSelectedBlock({ marginRight: bounded });
    }
  }, [selectedBlock, updateSelectedBlock]);

  const handleBlockDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, blockType: StudioBlockType) => {
    event.dataTransfer.setData('application/x-openrig-block', blockType);
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handlePreviewDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const flowBlockId = event.dataTransfer.getData('application/x-openrig-flow-block');
    if (flowBlockId) {
      setBlocks((prev) => {
        const fromIndex = prev.findIndex((block) => block.id === flowBlockId);
        if (fromIndex >= 0) {
          const moving = prev[fromIndex];
          if (!moving || !isFlowLayoutBlock(moving)) return prev;
          const next = [...prev];
          const [moved] = next.splice(fromIndex, 1);
          next.push(moved);
          return next;
        }
        const [withoutBlock, movingBlock, moved] = extractBlockFromTree(prev, flowBlockId);
        if (!moved || !movingBlock || !isFlowLayoutBlock(movingBlock)) return prev;
        return [...withoutBlock, movingBlock];
      });
      setFlowDropTarget(null);
      setDraggingFlowBlockId(null);
      return;
    }
    const blockType = event.dataTransfer.getData('application/x-openrig-block') as StudioBlockType;
    if (blockType !== 'title' && blockType !== 'subtitle' && blockType !== 'separator' && blockType !== 'grid' && blockType !== 'image' && blockType !== 'qrcode' && blockType !== 'zone' && blockType !== 'table') return;
    const nextBlock = createBlockFromType(blockType);
    setBlocks((prev) => [...prev, nextBlock]);
    setSelectedBlockId(nextBlock.id);
    setSelectedBlockIds([nextBlock.id]);
    setActiveTool('blockStyle');
  }, []);

  const handleGridCellDrop = useCallback((event: React.DragEvent<HTMLDivElement>, gridBlockId: string, cellIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const flowBlockId = event.dataTransfer.getData('application/x-openrig-flow-block') || draggingFlowBlockId;
    if (flowBlockId) {
      setBlocks((prev) => {
        const movingBlock = findBlockInTree(prev, flowBlockId);
        if (!movingBlock || !isFlowLayoutBlock(movingBlock)) return prev;
        if (movingBlock.id === gridBlockId || blockTreeContainsId(movingBlock, gridBlockId)) return prev;
        const [withoutBlock, extractedBlock, moved] = extractBlockFromTree(prev, flowBlockId);
        if (!moved || !extractedBlock) return prev;
        const [nextBlocks, inserted] = insertBlockIntoGridCell(withoutBlock, gridBlockId, cellIndex, extractedBlock);
        if (inserted) {
          setSelectedBlockId(extractedBlock.id);
          setSelectedBlockIds([extractedBlock.id]);
          setActiveTool('blockStyle');
        }
        return inserted ? nextBlocks : prev;
      });
      setFlowDropTarget(null);
      setDraggingFlowBlockId(null);
      return;
    }
    const blockType = event.dataTransfer.getData('application/x-openrig-block') as StudioBlockType;
    if (blockType !== 'title' && blockType !== 'subtitle' && blockType !== 'separator' && blockType !== 'grid' && blockType !== 'image' && blockType !== 'qrcode' && blockType !== 'zone' && blockType !== 'table') return;
    const nextBlock = createBlockFromType(blockType);
    setBlocks((prev) => {
      const [nextBlocks, inserted] = insertBlockIntoGridCell(prev, gridBlockId, cellIndex, nextBlock);
      if (inserted) {
        setSelectedBlockId(nextBlock.id);
        setSelectedBlockIds([nextBlock.id]);
        setActiveTool('blockStyle');
      }
      return nextBlocks;
    });
  }, [draggingFlowBlockId]);

  const handleZoneDrop = useCallback((event: React.DragEvent<HTMLDivElement>, zoneBlockId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const flowBlockId = event.dataTransfer.getData('application/x-openrig-flow-block') || draggingFlowBlockId;
    if (flowBlockId) {
      setBlocks((prev) => {
        const movingBlock = findBlockInTree(prev, flowBlockId);
        if (!movingBlock || !isFlowLayoutBlock(movingBlock)) return prev;
        if (movingBlock.id === zoneBlockId || blockTreeContainsId(movingBlock, zoneBlockId)) return prev;
        const [withoutBlock, extractedBlock, moved] = extractBlockFromTree(prev, flowBlockId);
        if (!moved || !extractedBlock) return prev;
        const [nextBlocks, inserted] = insertBlockIntoZone(withoutBlock, zoneBlockId, extractedBlock);
        if (inserted) {
          setSelectedBlockId(extractedBlock.id);
          setSelectedBlockIds([extractedBlock.id]);
          setActiveTool('blockStyle');
        }
        return inserted ? nextBlocks : prev;
      });
      setFlowDropTarget(null);
      setDraggingFlowBlockId(null);
      return;
    }
    const blockType = event.dataTransfer.getData('application/x-openrig-block') as StudioBlockType;
    if (blockType !== 'title' && blockType !== 'subtitle' && blockType !== 'separator' && blockType !== 'grid' && blockType !== 'image' && blockType !== 'qrcode' && blockType !== 'zone' && blockType !== 'table') return;
    const nextBlock = createBlockFromType(blockType);
    setBlocks((prev) => {
      const [nextBlocks, inserted] = insertBlockIntoZone(prev, zoneBlockId, nextBlock);
      if (inserted) {
        setSelectedBlockId(nextBlock.id);
        setSelectedBlockIds([nextBlock.id]);
        setActiveTool('blockStyle');
      }
      return nextBlocks;
    });
  }, [draggingFlowBlockId]);

  const reorderFlowBlocks = useCallback((draggedId: string, targetId: string, position: FlowDropPosition) => {
    if (draggedId === targetId) return;
    setBlocks((prev) => {
      const targetIndex = prev.findIndex((block) => block.id === targetId);
      if (targetIndex < 0) return prev;
      const fromIndex = prev.findIndex((block) => block.id === draggedId);
      if (fromIndex >= 0) {
        const draggedBlock = prev[fromIndex];
        const targetBlock = prev[targetIndex];
        if (!draggedBlock || !targetBlock) return prev;
        if (!isFlowLayoutBlock(draggedBlock) || !isFlowLayoutBlock(targetBlock)) return prev;

        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        let insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
        if (fromIndex < insertIndex) insertIndex -= 1;
        next.splice(insertIndex, 0, moved);
        return next;
      }

      const movingBlock = findBlockInTree(prev, draggedId);
      if (!movingBlock || !isFlowLayoutBlock(movingBlock)) return prev;
      if (blockTreeContainsId(movingBlock, targetId)) return prev;
      const [withoutBlock, extractedBlock, moved] = extractBlockFromTree(prev, draggedId);
      if (!moved || !extractedBlock) return prev;

      const nextTargetIndex = withoutBlock.findIndex((block) => block.id === targetId);
      if (nextTargetIndex < 0) return prev;
      const insertIndex = position === 'before' ? nextTargetIndex : nextTargetIndex + 1;
      const next = [...withoutBlock];
      next.splice(insertIndex, 0, extractedBlock);
      return next;
    });
  }, []);

  const handleFlowBlockDragStart = useCallback((event: React.DragEvent<HTMLElement>, block: TemplateBlock, _scope: BlockRenderScope) => {
    if (!isFlowLayoutBlock(block)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/x-openrig-flow-block', block.id);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingFlowBlockId(block.id);
    setFlowDropTarget(null);
  }, []);

  const handleFlowBlockDragOver = useCallback((event: React.DragEvent<HTMLElement>, block: TemplateBlock, scope: BlockRenderScope) => {
    const draggedId = event.dataTransfer.getData('application/x-openrig-flow-block') || draggingFlowBlockId;
    if (!draggedId) return;
    if (scope !== 'root' || !isFlowLayoutBlock(block) || draggedId === block.id) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const position: FlowDropPosition = event.clientY < mid ? 'before' : 'after';
    setFlowDropTarget((prev) => (
      prev && prev.targetId === block.id && prev.position === position
        ? prev
        : { targetId: block.id, position }
    ));
  }, [draggingFlowBlockId]);

  const handleFlowBlockDrop = useCallback((event: React.DragEvent<HTMLElement>, block: TemplateBlock, scope: BlockRenderScope) => {
    const draggedId = event.dataTransfer.getData('application/x-openrig-flow-block') || draggingFlowBlockId;
    if (!draggedId) return;
    if (scope !== 'root' || !isFlowLayoutBlock(block)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const position: FlowDropPosition = event.clientY < mid ? 'before' : 'after';
    reorderFlowBlocks(draggedId, block.id, position);
    setFlowDropTarget(null);
    setDraggingFlowBlockId(null);
  }, [draggingFlowBlockId, reorderFlowBlocks]);

  const handleFlowBlockDragEnd = useCallback(() => {
    setFlowDropTarget(null);
    setDraggingFlowBlockId(null);
  }, []);

  const setVerticalMargins = useCallback((next: number, source: 'top' | 'bottom') => {
    const safe = Number.isFinite(next) ? next : 0;
    if (linkVertical) {
      const bounded = Math.max(0, Math.min(148, safe));
      setMarginTop(bounded);
      setMarginBottom(bounded);
      flashGuides();
      return;
    }
    if (source === 'top') {
      const bounded = Math.max(0, Math.min(296 - marginBottom, safe));
      setMarginTop(bounded);
    } else {
      const bounded = Math.max(0, Math.min(296 - marginTop, safe));
      setMarginBottom(bounded);
    }
    flashGuides();
  }, [flashGuides, linkVertical, marginBottom, marginTop]);

  const setHorizontalMargins = useCallback((next: number, source: 'left' | 'right') => {
    const safe = Number.isFinite(next) ? next : 0;
    if (linkHorizontal) {
      const bounded = Math.max(0, Math.min(104, safe));
      setMarginLeft(bounded);
      setMarginRight(bounded);
      flashGuides();
      return;
    }
    if (source === 'left') {
      const bounded = Math.max(0, Math.min(209 - marginRight, safe));
      setMarginLeft(bounded);
    } else {
      const bounded = Math.max(0, Math.min(209 - marginLeft, safe));
      setMarginRight(bounded);
    }
    flashGuides();
  }, [flashGuides, linkHorizontal, marginLeft, marginRight]);

  const handleBackgroundImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl) {
        setPageBackgroundImage(dataUrl);
      }
    } catch (_error) {
      toast.error('Impossible de charger l’image de fond');
    } finally {
      event.target.value = '';
    }
  }, []);

  const handleSelectedImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedBlock || selectedBlock.type !== 'image') return;
    try {
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) return;
      updateSelectedBlock({
        imageUrl: dataUrl,
        imageAlt: selectedBlock.imageAlt || file.name || 'Image',
      });
    } catch (_error) {
      toast.error('Impossible de charger l’image');
    } finally {
      event.target.value = '';
    }
  }, [selectedBlock, updateSelectedBlock]);

  const applyStudioSnapshot = useCallback((studioInput: Record<string, any> | null | undefined) => {
    const studio = studioInput && typeof studioInput === 'object'
      ? studioInput as Record<string, any>
      : createBlankStudioSnapshot();
    const margins = studio.margins && typeof studio.margins === 'object'
      ? studio.margins as Record<string, any>
      : {};
    const links = studio.links && typeof studio.links === 'object'
      ? studio.links as Record<string, any>
      : {};
    const background = studio.background && typeof studio.background === 'object'
      ? studio.background as Record<string, any>
      : {};
    const headerFooter = normalizePageBandSettings(studio.headerFooter);
    const persistedBlocks = Array.isArray(studio.blocks) ? studio.blocks : [];
    const persistedLayerGroups = Array.isArray(studio.layerGroups) ? studio.layerGroups : [];

    setCurrentPage(1);
    setZoom(typeof studio.zoom === 'number' ? clampZoom(studio.zoom) : 60);
    setMarginTop(typeof margins.top === 'number' ? Math.max(0, margins.top) : 20);
    setMarginBottom(typeof margins.bottom === 'number' ? Math.max(0, margins.bottom) : 20);
    setMarginLeft(typeof margins.left === 'number' ? Math.max(0, margins.left) : 14);
    setMarginRight(typeof margins.right === 'number' ? Math.max(0, margins.right) : 14);
    setLinkVertical(typeof links.vertical === 'boolean' ? links.vertical : false);
    setLinkHorizontal(typeof links.horizontal === 'boolean' ? links.horizontal : false);
    setPageBackgroundColor(typeof background.color === 'string' ? background.color : '#ffffff');
    setPageBackgroundImage(typeof background.image === 'string' ? background.image : '');
    setPageBackgroundOpacity(
      typeof background.opacity === 'number' ? Math.max(0, Math.min(100, background.opacity)) : 100
    );
    if (background.size === 'contain' || background.size === 'auto' || background.size === 'cover') {
      setPageBackgroundSize(background.size);
    } else {
      setPageBackgroundSize('cover');
    }
    setPageBandSettings(headerFooter);
    setPageBandFocusField(null);
    setPageBandVariableSearch('');
    setBlockContextMenu(null);
    setBlockRectsMm({});

    if (persistedBlocks.length > 0) {
      const safeBlocks: TemplateBlock[] = persistedBlocks
        .map((raw) => hydrateTemplateBlock(raw))
        .filter((entry): entry is TemplateBlock => entry !== null);
      setBlocks(safeBlocks);
      setSelectedBlockId(safeBlocks[0]?.id ?? null);
      setSelectedBlockIds(safeBlocks[0]?.id ? [safeBlocks[0].id] : []);
    } else {
      setBlocks([]);
      setSelectedBlockId(null);
      setSelectedBlockIds([]);
    }

    if (persistedLayerGroups.length > 0) {
      const safeLayerGroups: LayerGroup[] = persistedLayerGroups
        .filter((group): group is Record<string, any> => !!group && typeof group === 'object')
        .map((group) => ({
          id: typeof group.id === 'string' ? group.id : createBlockId(),
          name: typeof group.name === 'string' && group.name.trim() ? group.name : 'Groupe',
          blockIds: Array.isArray(group.blockIds)
            ? Array.from(new Set(group.blockIds.filter((id): id is string => typeof id === 'string')))
            : [],
        }));
      setLayerGroups(safeLayerGroups);
    } else {
      setLayerGroups([]);
    }
    draftLoadedBlockIdRef.current = null;
    draftSelectionRef.current = null;
    resetUndoBaselineRef.current = true;
  }, [clampZoom]);

  useEffect(() => {
    if (!settings) return;

    const templatesRoot = settings.templates && typeof settings.templates === 'object'
      ? settings.templates as Record<string, any>
      : {};
    const commonLibrary = parseCommonStudioLibrary(templatesRoot);
    const selectedId = commonLibrary.activeTemplateByDoc[activeTemplateType] ?? commonLibrary.templates[0]?.id ?? null;
    const activeTemplate = commonLibrary.templates.find((entry) => entry.id === selectedId)
      ?? commonLibrary.templates[0];

    setSavedTemplates(commonLibrary.templates);
    setLibraryActiveByDoc(commonLibrary.activeTemplateByDoc);
    setActiveSavedTemplateId(activeTemplate?.id ?? null);
    setSavedTemplateName(activeTemplate?.name ?? '');
    applyStudioSnapshot(activeTemplate ? getTemplateStudioForDoc(activeTemplate, activeTemplateType) : createBlankStudioSnapshot());
  }, [activeTemplateType, applyStudioSnapshot, settings]);

  useEffect(() => {
    const validIds = new Set(collectBlockIds(blocks));

    const followCleanupUpdates = new Map<string, Partial<TemplateBlock>>();
    collectBlockIds(blocks).forEach((blockId) => {
      const block = findBlockInTree(blocks, blockId);
      if (!block) return;
      if (!block.followEnabled) return;
      if (!block.followTargetId || block.followTargetId === block.id || !validIds.has(block.followTargetId)) {
        followCleanupUpdates.set(block.id, {
          followEnabled: false,
          followTargetId: null,
        });
      }
    });
    if (followCleanupUpdates.size > 0) {
      setBlocks((prev) => {
        const [nextBlocks, changed] = updateBlocksInTreeByIds(prev, followCleanupUpdates);
        return changed ? nextBlocks : prev;
      });
    }

    setLayerGroups((prev) => {
      let changed = false;
      const next = prev.map((group) => {
        const nextIds = group.blockIds.filter((id) => validIds.has(id));
        if (nextIds.length !== group.blockIds.length) {
          changed = true;
          return { ...group, blockIds: nextIds };
        }
        return group;
      });
      return changed ? next : prev;
    });

    setSelectedBlockIds((prev) => prev.filter((id) => validIds.has(id)));
    setSelectedBlockId((prev) => (prev && validIds.has(prev) ? prev : null));
    setBlockContextMenu((prev) => {
      if (!prev) return null;
      if (!validIds.has(prev.blockId)) return null;
      const nextSelected = prev.selectedIds.filter((id) => validIds.has(id));
      if (nextSelected.length === prev.selectedIds.length) return prev;
      return { ...prev, selectedIds: nextSelected };
    });
  }, [blocks]);

  const buildStudioSnapshot = useCallback(() => ({
    version: 1,
    mode: 'single-page-preview',
    zoom,
    margins: {
      top: marginTop,
      bottom: marginBottom,
      left: marginLeft,
      right: marginRight,
    },
    links: {
      vertical: linkVertical,
      horizontal: linkHorizontal,
    },
    background: {
      color: pageBackgroundColor,
      image: pageBackgroundImage,
      opacity: pageBackgroundOpacity,
      size: pageBackgroundSize,
    },
    headerFooter: {
      enabled: pageBandSettings.enabled,
      fontSizePt: pageBandSettings.fontSizePt,
      textColor: pageBandSettings.textColor,
      topOffsetMm: pageBandSettings.topOffsetMm,
      bottomOffsetMm: pageBandSettings.bottomOffsetMm,
      sidePaddingMm: pageBandSettings.sidePaddingMm,
      header: {
        left: pageBandSettings.header.left,
        center: pageBandSettings.header.center,
        right: pageBandSettings.header.right,
      },
      footer: {
        left: pageBandSettings.footer.left,
        center: pageBandSettings.footer.center,
        right: pageBandSettings.footer.right,
      },
    },
    blocks: blocks.map((block) => serializeTemplateBlock(block)),
    layerGroups: layerGroups.map((group) => ({
      id: group.id,
      name: group.name,
      blockIds: Array.from(new Set(group.blockIds)),
    })),
    updated_at: new Date().toISOString(),
  }), [
    blocks,
    layerGroups,
    linkHorizontal,
    linkVertical,
    marginBottom,
    marginLeft,
    marginRight,
    marginTop,
    pageBackgroundColor,
    pageBackgroundImage,
    pageBackgroundOpacity,
    pageBackgroundSize,
    pageBandSettings,
    zoom,
  ]);

  const buildUndoSnapshot = useCallback((): StudioUndoSnapshot => ({
    zoom,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    pageBackgroundColor,
    pageBackgroundImage,
    pageBackgroundOpacity,
    pageBackgroundSize,
    pageBandSettings: deepClone(pageBandSettings),
    linkVertical,
    linkHorizontal,
    blocks: deepClone(blocks),
    layerGroups: deepClone(layerGroups),
    selectedBlockId,
    selectedBlockIds: deepClone(selectedBlockIds),
    selectedTableText: deepClone(selectedTableText),
    tablePreviewSimulationByBlockId: deepClone(tablePreviewSimulationByBlockId),
    savedTemplates: deepClone(savedTemplates),
    activeSavedTemplateId,
    savedTemplateName,
    libraryActiveByDoc: deepClone(libraryActiveByDoc),
  }), [
    zoom,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    pageBackgroundColor,
    pageBackgroundImage,
    pageBackgroundOpacity,
    pageBackgroundSize,
    pageBandSettings,
    linkVertical,
    linkHorizontal,
    blocks,
    layerGroups,
    selectedBlockId,
    selectedBlockIds,
    selectedTableText,
    tablePreviewSimulationByBlockId,
    savedTemplates,
    activeSavedTemplateId,
    savedTemplateName,
    libraryActiveByDoc,
  ]);

  const restoreUndoSnapshot = useCallback((snapshot: StudioUndoSnapshot) => {
    applyingUndoSnapshotRef.current = true;
    setZoom(clampZoom(snapshot.zoom));
    setMarginTop(snapshot.marginTop);
    setMarginBottom(snapshot.marginBottom);
    setMarginLeft(snapshot.marginLeft);
    setMarginRight(snapshot.marginRight);
    setPageBackgroundColor(snapshot.pageBackgroundColor);
    setPageBackgroundImage(snapshot.pageBackgroundImage);
    setPageBackgroundOpacity(clampValue(snapshot.pageBackgroundOpacity, 0, 100));
    setPageBackgroundSize(snapshot.pageBackgroundSize);
    setPageBandSettings(normalizePageBandSettings(snapshot.pageBandSettings));
    setLinkVertical(!!snapshot.linkVertical);
    setLinkHorizontal(!!snapshot.linkHorizontal);
    setBlocks(deepClone(snapshot.blocks));
    setLayerGroups(deepClone(snapshot.layerGroups));
    setSelectedBlockId(snapshot.selectedBlockId);
    setSelectedBlockIds(deepClone(snapshot.selectedBlockIds));
    setSelectedTableText(deepClone(snapshot.selectedTableText));
    setTablePreviewSimulationByBlockId(deepClone(snapshot.tablePreviewSimulationByBlockId));
    setSavedTemplates(deepClone(snapshot.savedTemplates));
    setActiveSavedTemplateId(snapshot.activeSavedTemplateId);
    setSavedTemplateName(snapshot.savedTemplateName);
    setLibraryActiveByDoc(deepClone(snapshot.libraryActiveByDoc));
    setBlockContextMenu(null);
    setBlockRectsMm({});
    setPageBandFocusField(null);
    setPageBandVariableSearch('');
  }, [clampZoom]);

  const undoLastChange = useCallback(() => {
    if (undoPastRef.current.length === 0) return;
    const previous = undoPastRef.current[undoPastRef.current.length - 1];
    const current = buildUndoSnapshot();
    undoPastRef.current = undoPastRef.current.slice(0, -1);
    undoFutureRef.current.push(current);
    restoreUndoSnapshot(previous);
    setCanUndo(undoPastRef.current.length > 0);
  }, [buildUndoSnapshot, restoreUndoSnapshot]);

  useEffect(() => {
    const snapshot = buildUndoSnapshot();
    const serialized = JSON.stringify(snapshot);

    if (resetUndoBaselineRef.current) {
      undoPastRef.current = [];
      undoFutureRef.current = [];
      lastUndoSnapshotRef.current = snapshot;
      lastUndoSerializedRef.current = serialized;
      resetUndoBaselineRef.current = false;
      applyingUndoSnapshotRef.current = false;
      setCanUndo(false);
      return;
    }

    if (applyingUndoSnapshotRef.current) {
      lastUndoSnapshotRef.current = snapshot;
      lastUndoSerializedRef.current = serialized;
      applyingUndoSnapshotRef.current = false;
      setCanUndo(undoPastRef.current.length > 0);
      return;
    }

    const previousSerialized = lastUndoSerializedRef.current;
    if (!previousSerialized) {
      lastUndoSnapshotRef.current = snapshot;
      lastUndoSerializedRef.current = serialized;
      setCanUndo(undoPastRef.current.length > 0);
      return;
    }

    if (serialized === previousSerialized) {
      setCanUndo(undoPastRef.current.length > 0);
      return;
    }

    const previousSnapshot = lastUndoSnapshotRef.current;
    if (previousSnapshot) {
      undoPastRef.current.push(previousSnapshot);
      if (undoPastRef.current.length > UNDO_HISTORY_LIMIT) {
        undoPastRef.current.shift();
      }
    }
    undoFutureRef.current = [];
    lastUndoSnapshotRef.current = snapshot;
    lastUndoSerializedRef.current = serialized;
    setCanUndo(undoPastRef.current.length > 0);
  }, [buildUndoSnapshot]);

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isNativeEditable = !!target && (
        target.isContentEditable
        || tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
      );
      if (isNativeEditable) return;
      event.preventDefault();
      undoLastChange();
    };

    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [undoLastChange]);

  const commitCurrentSnapshotToTemplateList = useCallback((entries: StudioNamedTemplate[]): StudioNamedTemplate[] => {
    if (!activeSavedTemplateId) return entries;
    const snapshot = buildStudioSnapshot();
    const now = new Date().toISOString();
    return entries.map((entry) => (
      entry.id === activeSavedTemplateId
        ? {
          ...setTemplateStudioForDoc(entry, activeTemplateType, snapshot),
          updated_at: now,
        }
        : entry
    ));
  }, [activeSavedTemplateId, activeTemplateType, buildStudioSnapshot]);

  const selectSavedTemplate = useCallback((templateId: string) => {
    const withCurrentSnapshot = commitCurrentSnapshotToTemplateList(savedTemplates);
    const nextActive = withCurrentSnapshot.find((entry) => entry.id === templateId) ?? withCurrentSnapshot[0];
    if (!nextActive) return;
    setSavedTemplates(withCurrentSnapshot);
    setActiveSavedTemplateId(nextActive.id);
    setSavedTemplateName(nextActive.name);
    toast.success(`Template "${nextActive.name}" sélectionné. Cliquez sur Recall pour le charger.`);
  }, [commitCurrentSnapshotToTemplateList, savedTemplates]);

  const createNamedTemplate = useCallback((mode: 'blank' | 'duplicate') => {
    const baseName = savedTemplateName.trim();
    const now = new Date().toISOString();
    const withCurrentSnapshot = commitCurrentSnapshotToTemplateList(savedTemplates);
    const nextName = baseName.length > 0 ? baseName : `Template ${withCurrentSnapshot.length + 1}`;
    const source = mode === 'duplicate'
      ? (
        (() => {
          const found = withCurrentSnapshot.find((entry) => entry.id === activeSavedTemplateId);
          return found ? getTemplateStudioForDoc(found, activeTemplateType) : buildStudioSnapshot();
        })()
      )
      : createBlankStudioSnapshot();
    const studioByDoc: Record<string, Record<string, any>> = {};
    TEMPLATE_STUDIO_DOCUMENT_TYPES.forEach((doc) => {
      studioByDoc[doc.key] = doc.key === activeTemplateType ? source : createBlankStudioSnapshot();
    });
    const nextEntry: StudioNamedTemplate = {
      id: createBlockId(),
      name: nextName,
      studio_by_doc: studioByDoc,
      created_at: now,
      updated_at: now,
    };
    const nextTemplates = [...withCurrentSnapshot, nextEntry];
    setSavedTemplates(nextTemplates);
    setActiveSavedTemplateId(nextEntry.id);
    setLibraryActiveByDoc((prev) => ({ ...prev, [activeTemplateType]: nextEntry.id }));
    setSavedTemplateName(nextEntry.name);
    applyStudioSnapshot(getTemplateStudioForDoc(nextEntry, activeTemplateType));
    setActiveTool('templateLibrary');
  }, [
    activeSavedTemplateId,
    activeTemplateType,
    applyStudioSnapshot,
    buildStudioSnapshot,
    commitCurrentSnapshotToTemplateList,
    savedTemplateName,
    savedTemplates,
  ]);

  const renameActiveTemplate = useCallback(() => {
    if (!activeSavedTemplateId) return;
    const nextName = savedTemplateName.trim();
    if (!nextName) {
      toast.error('Saisissez un nom de template');
      return;
    }
    setSavedTemplates((prev) => prev.map((entry) => (
      entry.id === activeSavedTemplateId
        ? {
          ...entry,
          name: nextName,
          updated_at: new Date().toISOString(),
        }
        : entry
    )));
  }, [activeSavedTemplateId, savedTemplateName]);

  const deleteActiveTemplate = useCallback(() => {
    if (!activeSavedTemplateId) return;
    if (savedTemplates.length <= 1) {
      toast.error('Conservez au moins un template');
      return;
    }
    const nextTemplates = savedTemplates.filter((entry) => entry.id !== activeSavedTemplateId);
    const nextActive = nextTemplates[0];
    setSavedTemplates(nextTemplates);
    setActiveSavedTemplateId(nextActive.id);
    setLibraryActiveByDoc((prev) => ({ ...prev, [activeTemplateType]: nextActive.id }));
    setSavedTemplateName(nextActive.name);
    applyStudioSnapshot(getTemplateStudioForDoc(nextActive, activeTemplateType));
  }, [activeSavedTemplateId, activeTemplateType, applyStudioSnapshot, savedTemplates]);

  const recallPersistedTemplate = useCallback((templateId?: string | null) => {
    if (!settings) {
      toast.error("Paramètres d'entreprise non chargés");
      return;
    }
    const targetId = templateId ?? activeSavedTemplateId;
    if (!targetId) {
      toast.error('Aucun template sélectionné');
      return;
    }

    const confirmed = window.confirm('Rappeler le template sauvegardé et écraser les modifications non sauvegardées ?');
    if (!confirmed) return;

    const templatesRoot = settings.templates && typeof settings.templates === 'object'
      ? settings.templates as Record<string, any>
      : {};
    const persistedLibrary = parseCommonStudioLibrary(templatesRoot);
    const selectedId = targetId ?? persistedLibrary.activeTemplateByDoc[activeTemplateType];
    const target = persistedLibrary.templates.find((entry) => entry.id === selectedId)
      ?? persistedLibrary.templates.find((entry) => entry.id === targetId)
      ?? persistedLibrary.templates[0];
    if (!target) {
      toast.error('Template introuvable');
      return;
    }

    setSavedTemplates(persistedLibrary.templates);
    setLibraryActiveByDoc({
      ...persistedLibrary.activeTemplateByDoc,
      [activeTemplateType]: target.id,
    });
    setActiveSavedTemplateId(target.id);
    setSavedTemplateName(target.name);
    applyStudioSnapshot(getTemplateStudioForDoc(target, activeTemplateType));
    toast.success(`Template "${target.name}" rappelé`);
  }, [activeSavedTemplateId, activeTemplateType, applyStudioSnapshot, settings]);

  const persistStudio = useCallback(async () => {
    if (!settings) {
      toast.error("Paramètres d'entreprise non chargés");
      return;
    }
    try {
      const templates = settings.templates && typeof settings.templates === 'object'
        ? settings.templates as Record<string, any>
        : {};
      const snapshot = buildStudioSnapshot();
      const activeTemplateId = activeSavedTemplateId ?? (savedTemplates[0]?.id ?? 'default');
      const now = new Date().toISOString();
      const committedTemplates = commitCurrentSnapshotToTemplateList(savedTemplates.length > 0
        ? savedTemplates
        : [{
          id: activeTemplateId,
          name: 'Template principal',
          studio_by_doc: {
            devis: createBlankStudioSnapshot(),
            facture: createBlankStudioSnapshot(),
            bon_prepa: createBlankStudioSnapshot(),
            [activeTemplateType]: snapshot,
          },
        }]);
      const normalizedLibraryTemplates = committedTemplates.map((entry) => ({
        id: entry.id,
        name: entry.name.trim() || 'Template sans nom',
        studio_by_doc: {
          ...(entry.studio_by_doc && typeof entry.studio_by_doc === 'object' ? entry.studio_by_doc : {}),
          [activeTemplateType]: entry.id === activeTemplateId
            ? snapshot
            : getTemplateStudioForDoc(entry, activeTemplateType),
        },
        created_at: entry.created_at ?? now,
        updated_at: entry.id === activeTemplateId ? now : (entry.updated_at ?? now),
      }));

      const firstTemplateId = normalizedLibraryTemplates[0]?.id ?? activeTemplateId;
      const nextActiveByDoc: Record<string, string> = {};
      TEMPLATE_STUDIO_DOCUMENT_TYPES.forEach((doc) => {
        const candidate = doc.key === activeTemplateType
          ? activeTemplateId
          : libraryActiveByDoc[doc.key];
        nextActiveByDoc[doc.key] = normalizedLibraryTemplates.some((entry) => entry.id === candidate)
          ? (candidate as string)
          : firstTemplateId;
      });

      const nextTemplates = {
        ...templates,
        studio_common_library: {
          version: 1,
          templates: normalizedLibraryTemplates,
          active_template_by_doc: nextActiveByDoc,
          updated_at: now,
        },
      };

      TEMPLATE_STUDIO_DOCUMENT_TYPES.forEach((doc) => {
        const docEntry = templates[doc.key] && typeof templates[doc.key] === 'object'
          ? templates[doc.key] as Record<string, any>
          : {};
        const selectedId = nextActiveByDoc[doc.key];
        const selectedTemplateEntry = normalizedLibraryTemplates.find((entry) => entry.id === selectedId);
        const selectedTemplateSnapshot = selectedTemplateEntry
          ? getTemplateStudioForDoc(selectedTemplateEntry, doc.key)
          : snapshot;
        nextTemplates[doc.key] = {
          ...docEntry,
          studio: selectedTemplateSnapshot,
        };
      });

      await saveSettings({ templates: nextTemplates });
      setSavedTemplates(normalizedLibraryTemplates);
      setLibraryActiveByDoc(nextActiveByDoc);
    } catch (err) {
      console.error('save template studio', err);
      toast.error(`Impossible de sauvegarder le template "${activeTemplateLabel}"`);
    }
  }, [
    activeTemplateLabel,
    activeTemplateType,
    activeSavedTemplateId,
    buildStudioSnapshot,
    commitCurrentSnapshotToTemplateList,
    libraryActiveByDoc,
    savedTemplates,
    saveSettings,
    settings,
  ]);

  const downloadLocalTemplateFile = useCallback(() => {
    const nowIso = new Date().toISOString();
    const snapshot = buildStudioSnapshot();
    const activeTemplateId = activeSavedTemplateId ?? (savedTemplates[0]?.id ?? 'default');
    const currentTemplates = savedTemplates.length > 0
      ? savedTemplates
      : [{
        id: activeTemplateId,
        name: 'Template principal',
        studio_by_doc: {
          devis: createBlankStudioSnapshot(),
          facture: createBlankStudioSnapshot(),
          bon_prepa: createBlankStudioSnapshot(),
          [activeTemplateType]: snapshot,
        },
      }];
    const committedTemplates = commitCurrentSnapshotToTemplateList(currentTemplates);
    const firstTemplateId = committedTemplates[0]?.id ?? activeTemplateId;
    const activeTemplateByDoc: Record<string, string> = {};
    TEMPLATE_STUDIO_DOCUMENT_TYPES.forEach((doc) => {
      const candidate = doc.key === activeTemplateType
        ? activeTemplateId
        : libraryActiveByDoc[doc.key];
      activeTemplateByDoc[doc.key] = committedTemplates.some((entry) => entry.id === candidate)
        ? (candidate as string)
        : firstTemplateId;
    });

    const exportPayload = {
      format: 'openrig-template-studio',
      version: 1,
      exported_at: nowIso,
      active_document_type: activeTemplateType,
      studio_common_library: {
        version: 1,
        templates: committedTemplates,
        active_template_by_doc: activeTemplateByDoc,
        updated_at: nowIso,
      },
    };

    const fileName = `openrig-template-studio-${activeTemplateType}-${nowIso.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    setSavedTemplates(committedTemplates);
    toast.success('Template exporté en fichier local');
  }, [
    activeSavedTemplateId,
    activeTemplateType,
    buildStudioSnapshot,
    commitCurrentSnapshotToTemplateList,
    libraryActiveByDoc,
    savedTemplates,
  ]);

  const triggerLocalTemplateImport = useCallback(() => {
    localTemplateImportInputRef.current?.click();
  }, []);

  const handleLocalTemplateImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const payload = JSON.parse(content);
      const importedLibrary = extractStudioLibraryFromImport(payload);
      if (!importedLibrary || importedLibrary.templates.length === 0) {
        toast.error('Fichier template invalide');
        return;
      }

      const activeId = importedLibrary.activeTemplateByDoc[activeTemplateType]
        ?? importedLibrary.templates[0]?.id
        ?? null;
      const activeTemplate = importedLibrary.templates.find((entry) => entry.id === activeId)
        ?? importedLibrary.templates[0];
      if (!activeTemplate) {
        toast.error('Aucun template trouvé dans le fichier');
        return;
      }

      setSavedTemplates(importedLibrary.templates);
      setLibraryActiveByDoc(importedLibrary.activeTemplateByDoc);
      setActiveSavedTemplateId(activeTemplate.id);
      setSavedTemplateName(activeTemplate.name);
      applyStudioSnapshot(getTemplateStudioForDoc(activeTemplate, activeTemplateType));
      setActiveTool('templateLibrary');
      toast.success('Template local chargé. Cliquez sur Sauvegarder pour le persister.');
    } catch (error) {
      console.error('import local template', error);
      toast.error('Impossible de charger ce fichier template');
    } finally {
      event.target.value = '';
    }
  }, [activeTemplateType, applyStudioSnapshot]);

  useEffect(() => {
    const handleSaveRequest = () => {
      void persistStudio();
    };
    window.addEventListener(TEMPLATE_STUDIO_SAVE_EVENT, handleSaveRequest);
    return () => {
      window.removeEventListener(TEMPLATE_STUDIO_SAVE_EVENT, handleSaveRequest);
    };
  }, [persistStudio]);

  useEffect(() => {
    const handlePreviewRequest = () => {
      const snapshot = buildStudioSnapshot();
      window.dispatchEvent(new CustomEvent(TEMPLATE_STUDIO_PDF_PREVIEW_READY, { detail: { snapshot } }));
    };
    window.addEventListener(TEMPLATE_STUDIO_PDF_PREVIEW_REQUEST, handlePreviewRequest);
    return () => {
      window.removeEventListener(TEMPLATE_STUDIO_PDF_PREVIEW_REQUEST, handlePreviewRequest);
    };
  }, [buildStudioSnapshot]);

  useEffect(() => {
    const handleDomCaptureRequest = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Collect all page stylesheets
      const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((node) => node.outerHTML)
        .join('\n');

      // Clone the preview container (read-only — strip interactive attributes)
      const clone = container.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[contenteditable]').forEach((el) => {
        (el as HTMLElement).removeAttribute('contenteditable');
      });
      clone.querySelectorAll('[draggable]').forEach((el) => {
        (el as HTMLElement).removeAttribute('draggable');
      });

      // Remove CSS zoom transform so the captured page renders at true 100% scale,
      // matching the PDF output — otherwise the preview looks more compact at lower zoom levels.
      clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (el.style.transform && el.style.transform.includes('scale(')) {
          const parent = el.parentElement;
          if (parent && el.style.transformOrigin === 'top left') {
            // The outer wrapper is sized to the zoomed dimension; reset it to actual size.
            if (el.style.width) parent.style.width = el.style.width;
            if (el.style.height) parent.style.height = el.style.height;
          }
          el.style.transform = '';
          el.style.transformOrigin = '';
        }
      });

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${styleNodes}<style>body{margin:0;background:#f3f4f6;}</style></head><body>${clone.outerHTML}</body></html>`;
      window.dispatchEvent(new CustomEvent(TEMPLATE_STUDIO_DOM_CAPTURE_READY, { detail: { html } }));
    };
    window.addEventListener(TEMPLATE_STUDIO_DOM_CAPTURE_REQUEST, handleDomCaptureRequest);
    return () => {
      window.removeEventListener(TEMPLATE_STUDIO_DOM_CAPTURE_REQUEST, handleDomCaptureRequest);
    };
  }, []);

  useEffect(() => {
    if (!blockContextMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (blockContextMenuRef.current?.contains(target)) return;
      setBlockContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBlockContextMenu(null);
      }
    };

    const closeMenu = () => {
      setBlockContextMenu(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [blockContextMenu]);

  const setPreviewPageRef = useCallback((pageNumber: number, node: HTMLDivElement | null) => {
    if (node) {
      previewPageRefs.current[pageNumber] = node;
      return;
    }
    delete previewPageRefs.current[pageNumber];
  }, []);

  const scrollToPage = useCallback((page: number, behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    const target = previewPageRefs.current[page];
    if (!container || !target) return;
    container.scrollTo({ top: Math.max(0, target.offsetTop - 8), behavior });
    setCurrentPage(page);
  }, []);

  useEffect(() => {
    setCurrentPage((prev) => clampPage(prev));
  }, [clampPage, totalPages]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateCurrentPageFromScroll = () => {
      const anchor = container.scrollTop + 8;
      let nextPage = currentPage;
      let bestDistance = Number.POSITIVE_INFINITY;
      previewPageNumbers.forEach((pageNumber) => {
        const pageNode = previewPageRefs.current[pageNumber];
        if (!pageNode) return;
        const distance = Math.abs(pageNode.offsetTop - anchor);
        if (distance < bestDistance) {
          bestDistance = distance;
          nextPage = pageNumber;
        }
      });
      if (nextPage !== currentPage) {
        setCurrentPage(nextPage);
      }
    };

    updateCurrentPageFromScroll();
    container.addEventListener('scroll', updateCurrentPageFromScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', updateCurrentPageFromScroll);
    };
  }, [currentPage, previewPageNumbers]);

  const selectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
    setSelectedBlockIds([blockId]);
    setSelectedTableText(null);
    setActiveTool('blockStyle');
    setBlockContextMenu(null);
  }, []);

  const toggleBlockInSelection = useCallback((blockId: string) => {
    setSelectedBlockIds((prev) => {
      if (prev.includes(blockId)) {
        const next = prev.filter((id) => id !== blockId);
        if (next.length === 0) {
          setSelectedBlockId(null);
          return [];
        }
        setSelectedBlockId(next[next.length - 1]);
        return next;
      }
      const next = [...prev, blockId];
      setSelectedBlockId(blockId);
      return next;
    });
    setSelectedTableText(null);
    setActiveTool('blockStyle');
    setBlockContextMenu(null);
  }, []);

  const selectBlockFromPointer = useCallback((event: React.MouseEvent<HTMLElement>, blockId: string) => {
    const isMulti = event.metaKey || event.ctrlKey;
    if (isMulti) {
      toggleBlockInSelection(blockId);
      return;
    }
    selectBlock(blockId);
  }, [selectBlock, toggleBlockInSelection]);

  const selectTableTextTarget = useCallback((
    event: React.MouseEvent<HTMLElement>,
    blockId: string,
    kind: TableTextTargetKind,
    columnKey?: TableColumnKey,
  ) => {
    event.stopPropagation();
    selectBlock(blockId);
    setSelectedTableText({
      blockId,
      kind,
      columnKey,
    });
  }, [selectBlock]);

  const updateSelectedTableTextAlign = useCallback((nextAlign: TableTextAlign) => {
    if (!selectedTableText) return;

    setBlocks((prev) => {
      const [nextBlocks] = updateBlockInTree(prev, selectedTableText.blockId, (block) => {
        if (block.type !== 'table') return block;

        if (selectedTableText.kind === 'category') {
          if (nextAlign === 'auto') return block;
          return {
            ...block,
            tableCategoryTextAlign: nextAlign as TableTextAlignValue,
          };
        }

        const columnKey = selectedTableText.columnKey;
        if (!columnKey) return block;

        if (selectedTableText.kind === 'header') {
          const currentMap = { ...(block.tableHeaderColumnAlign ?? {}) };
          if (nextAlign === 'auto') {
            delete currentMap[columnKey];
          } else {
            currentMap[columnKey] = nextAlign as TableTextAlignValue;
          }
          return {
            ...block,
            tableHeaderColumnAlign: currentMap,
          };
        }

        const currentMap = { ...(block.tableBodyColumnAlign ?? {}) };
        if (nextAlign === 'auto') {
          delete currentMap[columnKey];
        } else {
          currentMap[columnKey] = nextAlign as TableTextAlignValue;
        }
        return {
          ...block,
          tableBodyColumnAlign: currentMap,
        };
      });
      return nextBlocks;
    });
  }, [selectedTableText]);

  const syncSelectedTextBlockFromDraft = useCallback((nextState: EditorState) => {
    if (!selectedBlockId) return;
    const content = nextState.getCurrentContent();
    const contentHtml = draftToHtml(convertToRaw(content));
    const plainText = content.getPlainText('\n').trim();

    setBlocks((prev) => {
      const [nextBlocks] = updateBlockInTree(prev, selectedBlockId, (block) => {
        if (block.type !== 'title' && block.type !== 'subtitle') return block;
        return {
          ...block,
          contentHtml,
          text: plainText,
        };
      });
      return nextBlocks;
    });
  }, [selectedBlockId]);

  const handleDraftEditorChange = useCallback((nextState: EditorState) => {
    draftSelectionRef.current = nextState.getSelection();
    setDraftEditorState(nextState);
    syncSelectedTextBlockFromDraft(nextState);
  }, [syncSelectedTextBlockFromDraft]);

  const getCurrentStyleByPrefix = useCallback((state: EditorState, prefix: string): string | null => {
    const styles = state.getCurrentInlineStyle().toArray();
    const found = styles.find((style) => typeof style === 'string' && style.startsWith(prefix));
    return typeof found === 'string' ? found : null;
  }, []);

  const getWholeContentSelection = useCallback((state: EditorState): SelectionState => {
    const content = state.getCurrentContent();
    const firstBlock = content.getFirstBlock();
    const lastBlock = content.getLastBlock();
    return SelectionState.createEmpty(firstBlock.getKey()).merge({
      anchorKey: firstBlock.getKey(),
      anchorOffset: 0,
      focusKey: lastBlock.getKey(),
      focusOffset: lastBlock.getLength(),
      hasFocus: true,
      isBackward: false,
    }) as SelectionState;
  }, []);

  const applyStyleWithPrefix = useCallback((prefix: string, nextValue: string, knownValues: Array<string | number>) => {
    if (!isRichTextBlockSelected) return;
    const baseSelection = draftSelectionRef.current ?? draftEditorState.getSelection();
    const targetSelection = baseSelection.isCollapsed() ? getWholeContentSelection(draftEditorState) : baseSelection;

    let content = draftEditorState.getCurrentContent();
    for (const value of knownValues) {
      content = Modifier.removeInlineStyle(content, targetSelection, `${prefix}${value}`);
    }
    content = Modifier.applyInlineStyle(content, targetSelection, `${prefix}${nextValue}`);

    let nextState = EditorState.push(draftEditorState, content, 'change-inline-style');
    nextState = EditorState.forceSelection(nextState, baseSelection);

    draftSelectionRef.current = baseSelection;
    setDraftEditorState(nextState);
    syncSelectedTextBlockFromDraft(nextState);

    if (prefix === 'fontsize-') {
      const parsed = Number(nextValue);
      if (Number.isFinite(parsed) && parsed > 0) {
        updateSelectedBlock({ fontSize: parsed });
      }
    }
    if (prefix === 'fontfamily-') {
      updateSelectedBlock({ fontFamily: nextValue });
    }
  }, [draftEditorState, getWholeContentSelection, isRichTextBlockSelected, syncSelectedTextBlockFromDraft, updateSelectedBlock]);

  const activeFontSizeValue = useMemo(() => {
    const style = getCurrentStyleByPrefix(draftEditorState, 'fontsize-');
    if (style) return style.replace('fontsize-', '');
    if (selectedBlock && (selectedBlock.type === 'title' || selectedBlock.type === 'subtitle')) {
      return String(selectedBlock.fontSize);
    }
    return '16';
  }, [draftEditorState, getCurrentStyleByPrefix, selectedBlock]);

  const activeFontFamilyValue = useMemo(() => {
    const style = getCurrentStyleByPrefix(draftEditorState, 'fontfamily-');
    if (style) return style.replace('fontfamily-', '');
    if (selectedBlock && (selectedBlock.type === 'title' || selectedBlock.type === 'subtitle')) {
      return selectedBlock.fontFamily;
    }
    return DEFAULT_FONT_FAMILIES[0];
  }, [draftEditorState, getCurrentStyleByPrefix, selectedBlock]);

  const fontFamilyOptions = useMemo(() => {
    const set = new Set(DEFAULT_FONT_FAMILIES);
    if (activeFontFamilyValue) {
      set.add(activeFontFamilyValue);
    }
    return Array.from(set);
  }, [activeFontFamilyValue]);

  const draftInlineStyleFn = useCallback((styles: { forEach: (cb: (style: string) => void) => void }) => {
    const inlineStyle: React.CSSProperties = {};
    styles.forEach((style) => {
      if (style.startsWith('fontsize-')) {
        const size = Number(style.replace('fontsize-', ''));
        if (Number.isFinite(size) && size > 0) {
          inlineStyle.fontSize = `${size}pt`;
        }
      }
      if (style.startsWith('fontfamily-')) {
        const family = style.replace('fontfamily-', '').trim();
        if (family) {
          inlineStyle.fontFamily = family;
        }
      }
    });
    return inlineStyle;
  }, []);

  const insertVariableTokenInDraft = useCallback((variableKey: string) => {
    if (!isRichTextBlockSelected) return;
    const token = `{{${variableKey}}}`;
    const content = draftEditorState.getCurrentContent();
    const selection = draftEditorState.getSelection();
    const nextContent = Modifier.insertText(content, selection, token);
    const nextState = EditorState.push(draftEditorState, nextContent, 'insert-characters');
    const withSelection = EditorState.forceSelection(nextState, nextContent.getSelectionAfter());
    setDraftEditorState(withSelection);
    syncSelectedTextBlockFromDraft(withSelection);
  }, [draftEditorState, isRichTextBlockSelected, syncSelectedTextBlockFromDraft]);

  const openBlockContextMenu = useCallback((event: React.MouseEvent<HTMLElement>, blockId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const isAlreadySelected = selectedBlockIds.includes(blockId);
    const nextSelection = isAlreadySelected ? selectedBlockIds : [blockId];
    setSelectedBlockIds(nextSelection);
    setSelectedBlockId(blockId);
    setActiveTool('blockStyle');
    setBlockContextMenu({
      blockId,
      x: event.clientX,
      y: event.clientY,
      selectedIds: nextSelection,
    });
  }, [selectedBlockIds]);

  const deleteSelectedBlocks = useCallback((ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    setBlocks((prev) => uniqueIds.reduce((acc, id) => {
      const [next] = deleteBlockInTree(acc, id);
      return next;
    }, prev));
    setSelectedBlockIds((prev) => prev.filter((id) => !uniqueIds.includes(id)));
    setSelectedBlockId((prev) => (prev && uniqueIds.includes(prev) ? null : prev));
    setBlockContextMenu(null);
  }, []);

  const duplicateSelectedBlocks = useCallback((ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => typeof id === 'string' && id.trim().length > 0);
    if (uniqueIds.length === 0) return;

    const orderedIds = layerEntries
      .filter((entry) => uniqueIds.includes(entry.id))
      .map((entry) => entry.id);
    const sourceIds = orderedIds.length > 0 ? orderedIds : uniqueIds;

    const independentIds = sourceIds.filter((id) => !sourceIds.some((otherId) => {
      if (otherId === id) return false;
      const otherBlock = findBlockInTree(blocks, otherId);
      return otherBlock ? blockTreeContainsId(otherBlock, id) : false;
    }));

    if (independentIds.length === 0) return;

    let workingBlocks = blocks;
    const duplicatedIds: string[] = [];

    independentIds.forEach((id) => {
      const [nextBlocks, clonedBlock, didDuplicate] = duplicateBlockInTree(workingBlocks, id);
      if (!didDuplicate || !clonedBlock) return;
      workingBlocks = nextBlocks;
      duplicatedIds.push(clonedBlock.id);
    });

    if (duplicatedIds.length === 0) return;

    setBlocks(workingBlocks);
    setSelectedBlockIds(duplicatedIds);
    setSelectedBlockId(duplicatedIds[0] ?? null);
    setActiveTool('blockStyle');
    setBlockContextMenu(null);
    toast.success(duplicatedIds.length > 1 ? `${duplicatedIds.length} blocs dupliqués` : 'Bloc dupliqué');
  }, [blocks, layerEntries]);

  const linkSelectedBlocks = useCallback((ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2) return;

    const ordered = layerEntries
      .filter((entry) => uniqueIds.includes(entry.id))
      .map((entry) => entry.id);
    if (ordered.length < 2) return;

    const updatesById = new Map<string, Partial<TemplateBlock>>();
    for (let idx = 1; idx < ordered.length; idx += 1) {
      updatesById.set(ordered[idx], {
        followEnabled: true,
        followTargetId: ordered[idx - 1],
        followPosition: 'below',
        followAlign: 'start',
        followGapMm: 4,
      });
    }
    setBlocks((prev) => {
      const [nextBlocks] = updateBlocksInTreeByIds(prev, updatesById);
      return nextBlocks;
    });
    setBlockContextMenu(null);
    toast.success('Blocs liés');
  }, [layerEntries]);

  const unlinkSelectedBlocks = useCallback((ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    const updatesById = new Map<string, Partial<TemplateBlock>>();
    uniqueIds.forEach((id) => {
      updatesById.set(id, {
        followEnabled: false,
        followTargetId: null,
        followPosition: 'below',
        followAlign: 'start',
        followGapMm: 4,
        followOffsetXMm: 0,
        followOffsetYMm: 0,
      });
    });
    setBlocks((prev) => {
      const [nextBlocks] = updateBlocksInTreeByIds(prev, updatesById);
      return nextBlocks;
    });
    setBlockContextMenu(null);
    toast.success('Liaison supprimée');
  }, []);

  const applyGridBrushToSide = useCallback((side: GridBorderSide) => {
    if (!selectedBlock || selectedBlock.type !== 'grid') return;
    const nextBorders = normalizeGridBorders(selectedBlock.gridBorders);
    nextBorders[side] = {
      color: gridBrushColor,
      width: Math.max(0, gridBrushWidth),
    };
    updateSelectedBlock({ gridBorders: nextBorders });
  }, [gridBrushColor, gridBrushWidth, selectedBlock, updateSelectedBlock]);

  const applyGridBrushToAllSides = useCallback(() => {
    if (!selectedBlock || selectedBlock.type !== 'grid') return;
    const nextBorders: GridBorderSet = {
      top: { color: gridBrushColor, width: Math.max(0, gridBrushWidth) },
      right: { color: gridBrushColor, width: Math.max(0, gridBrushWidth) },
      bottom: { color: gridBrushColor, width: Math.max(0, gridBrushWidth) },
      left: { color: gridBrushColor, width: Math.max(0, gridBrushWidth) },
    };
    updateSelectedBlock({ gridBorders: nextBorders });
  }, [gridBrushColor, gridBrushWidth, selectedBlock, updateSelectedBlock]);

  const renderPageBreakBadge = (block: TemplateBlock) => {
    if (!block.pageBreakReplicate) return null;
    const isFlow = block.pageBreakMode === 'flow';
    const label = isFlow ? 'Saut page: deplace' : 'Saut page: fixe';
    return (
      <div className="pointer-events-none absolute right-1 top-1 rounded bg-[#0f172acc] px-2 py-0.5 text-[10px] text-[#e2e8f0]">
        {label}
      </div>
    );
  };

  function renderTemplateBlock(
    block: TemplateBlock,
    scope: BlockRenderScope = 'root',
    options?: { collectMetrics?: boolean }
  ): React.ReactNode {
    const isSelected = selectedBlockIds.includes(block.id);
    const isPrimarySelected = block.id === selectedBlockId;
    const canFloat = scope === 'root';
    const collectMetrics = options?.collectMetrics !== false;
    const floatingHandleStyles: Record<FloatingResizeHandle, React.CSSProperties> = {
      n: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' },
      ne: { top: -4, right: -4, cursor: 'nesw-resize' },
      e: { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'ew-resize' },
      se: { right: -4, bottom: -4, cursor: 'nwse-resize' },
      s: { left: '50%', bottom: -4, transform: 'translateX(-50%)', cursor: 'ns-resize' },
      sw: { left: -4, bottom: -4, cursor: 'nesw-resize' },
      w: { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'ew-resize' },
      nw: { top: -4, left: -4, cursor: 'nwse-resize' },
    };

    if (block.type === 'grid') {
      const rows = Math.max(1, block.gridRows ?? 1);
      const columns = Math.max(1, block.gridColumns ?? 1);
      const cells = normalizeGridCellList(block.gridCells, rows, columns);
      const borderStyles = normalizeGridBorders(block.gridBorders);
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
      const dividerWidth = typeof block.gridDividerWidth === 'number' ? Math.max(0, block.gridDividerWidth) : 1;
      const dividerColorBase = typeof block.gridDividerColor === 'string' ? block.gridDividerColor : '#94a3b8';
      const dividerColor = gridBorderOpacity <= 0 ? 'transparent' : applyOpacityToColor(dividerColorBase, gridBorderOpacity);
      const borderTopColor = gridBorderOpacity <= 0 ? 'transparent' : applyOpacityToColor(borderStyles.top.color, gridBorderOpacity);
      const borderRightColor = gridBorderOpacity <= 0 ? 'transparent' : applyOpacityToColor(borderStyles.right.color, gridBorderOpacity);
      const borderBottomColor = gridBorderOpacity <= 0 ? 'transparent' : applyOpacityToColor(borderStyles.bottom.color, gridBorderOpacity);
      const borderLeftColor = gridBorderOpacity <= 0 ? 'transparent' : applyOpacityToColor(borderStyles.left.color, gridBorderOpacity);
      const useGapDividers = dividerWidth > 0;

      return (
        <div
          key={block.id}
          ref={collectMetrics ? (node) => setRenderedBlockRef(block.id, node) : undefined}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            selectBlockFromPointer(event, block.id);
          }}
          onContextMenu={(event) => openBlockContextMenu(event, block.id)}
          draggable={isFlowLayoutBlock(block)}
          onDragStart={(event) => handleFlowBlockDragStart(event, block, scope)}
          onDragEnd={handleFlowBlockDragEnd}
          onDragOver={(event) => handleFlowBlockDragOver(event, block, scope)}
          onDrop={(event) => handleFlowBlockDrop(event, block, scope)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              selectBlock(block.id);
            }
          }}
          className={`relative cursor-pointer transition focus:outline-none focus-visible:outline-none ${
            isSelected ? 'outline outline-1 outline-blue-400 outline-offset-2' : ''
          }`}
          style={{
            marginTop: `${block.marginTop}mm`,
            marginBottom: `${block.marginBottom}mm`,
            marginLeft: `${block.marginLeft}mm`,
            marginRight: `${block.marginRight}mm`,
          }}
        >
          {scope === 'root' && flowDropTarget?.targetId === block.id && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-20 h-[3px] bg-[#5f90ff]"
              style={flowDropTarget.position === 'before' ? { top: 0 } : { bottom: 0 }}
            />
          )}
          {renderPageBreakBadge(block)}
          <div
            className="relative w-full overflow-hidden"
            style={{
              background: applyOpacityToColor(gridBackgroundColor, gridBackgroundOpacity),
              borderRadius: `${gridBorderRadius}px`,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                columnGap: useGapDividers ? `${dividerWidth}px` : '0px',
                rowGap: useGapDividers ? `${dividerWidth}px` : '0px',
                background: useGapDividers ? dividerColor : 'transparent',
              borderTop: `0px solid transparent`,
              borderRight: `0px solid transparent`,
              borderBottom: `0px solid transparent`,
              borderLeft: `0px solid transparent`,
                borderRadius: `${gridBorderRadius}px`,
            }}
          >
            {cells.map((cellBlocks, index) => {
              const isLastColumn = (index + 1) % columns === 0;
              const isLastRow = Math.floor(index / columns) === rows - 1;
              const cellStyle: React.CSSProperties = {
                minHeight: `${gridCellMinHeightMm}mm`,
                padding: `${gridCellPaddingYMm}mm ${gridCellPaddingXMm}mm`,
                background: applyOpacityToColor(gridCellBackgroundColor, gridCellBackgroundOpacity),
                border: 'none',
              };
              if (!useGapDividers) {
                cellStyle.borderRightWidth = isLastColumn ? 0 : dividerWidth;
                cellStyle.borderBottomWidth = isLastRow ? 0 : dividerWidth;
                cellStyle.borderRightColor = isLastColumn ? 'transparent' : dividerColor;
                cellStyle.borderBottomColor = isLastRow ? 'transparent' : dividerColor;
                cellStyle.borderRightStyle = isLastColumn ? 'solid' : gridDividerStyle;
                cellStyle.borderBottomStyle = isLastRow ? 'solid' : gridDividerStyle;
              }
              return (
                <div
                  key={`${block.id}_cell_${index}`}
                  style={cellStyle}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const isExistingBlockDrag = !!(event.dataTransfer.getData('application/x-openrig-flow-block') || draggingFlowBlockId);
                    event.dataTransfer.dropEffect = isExistingBlockDrag ? 'move' : 'copy';
                  }}
                  onDrop={(event) => handleGridCellDrop(event, block.id, index)}
                >
                  {cellBlocks.length === 0 && (
                    <div className="flex h-full min-h-[52px] items-center justify-center border border-dashed border-[#cbd5e1] text-[11px] text-[#94a3b8]">
                      Déposez ici
                    </div>
                  )}
                  {cellBlocks.map((childBlock) => renderTemplateBlock(childBlock, 'nested', options))}
                </div>
              );
            })}
            </div>
          </div>
        </div>
      );
    }

    if (block.type === 'zone') {
      const isFloating = canFloat && block.layoutMode === 'floating';
      const isSemiFixed = canFloat && block.layoutMode === 'semi-fixed';
      const maxZoneWidthMm = Math.max(10, contentWidthMm - Math.max(0, block.marginLeft) - Math.max(0, block.marginRight));
      const floatWidth = clampValue(typeof block.floatWidth === 'number' ? block.floatWidth : 160, 10, maxZoneWidthMm);
      const floatHeight = Math.max(8, typeof block.floatHeight === 'number' ? block.floatHeight : 80);
      const floatX = clampValue(typeof block.floatX === 'number' ? block.floatX : 10, 0, Math.max(0, contentWidthMm - floatWidth));
      const floatY = clampValue(typeof block.floatY === 'number' ? block.floatY : 10, 0, Math.max(0, contentHeightMm - floatHeight));
      const zoneMinHeightMm = clampValue(typeof block.zoneMinHeightMm === 'number' ? block.zoneMinHeightMm : 45, 10, 260);
      const zoneBackgroundColor = typeof block.zoneBackgroundColor === 'string' ? block.zoneBackgroundColor : '#ffffff';
      const zoneBorderColor = typeof block.zoneBorderColor === 'string' ? block.zoneBorderColor : '#94a3b8';
      const rawZoneBorderWidth = clampValue(typeof block.zoneBorderWidth === 'number' ? block.zoneBorderWidth : 0, 0, 12);
      const zoneBorderRadius = clampValue(typeof block.zoneBorderRadius === 'number' ? block.zoneBorderRadius : 6, 0, 999);
      const zoneBorderTransparent = !!block.zoneBorderTransparent;
      const zoneBorderStyle: SimpleBorderStyle = block.zoneBorderStyle === 'dashed' || block.zoneBorderStyle === 'dotted'
        ? block.zoneBorderStyle
        : 'solid';
      const zoneOpacity = clampValue(typeof block.zoneOpacity === 'number' ? block.zoneOpacity : 100, 0, 100);
      const zoneBorderOpacity = clampValue(
        typeof block.zoneBorderOpacity === 'number'
          ? block.zoneBorderOpacity
          : (zoneBorderTransparent ? 0 : 100),
        0,
        100
      );
      const zoneChildren = block.zoneChildren ?? [];
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
      const zoneBackgroundOpacity = clampValue(
        typeof block.zoneBackgroundOpacity === 'number'
          ? block.zoneBackgroundOpacity
          : zoneOpacity,
        0,
        100
      );
      const zonePaddingXMm = clampValue(
        typeof block.zonePaddingXMm === 'number' ? block.zonePaddingXMm : (typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3),
        0,
        30,
      );
      const zonePaddingYMm = clampValue(
        typeof block.zonePaddingYMm === 'number' ? block.zonePaddingYMm : (typeof block.zonePaddingMm === 'number' ? block.zonePaddingMm : 3),
        0,
        30,
      );
      const wrapperStyle: React.CSSProperties = isFloating
        ? {
          position: 'absolute',
          left: `${floatX}mm`,
          top: `${floatY}mm`,
          width: `${floatWidth}mm`,
          height: `${floatHeight}mm`,
        }
        : isSemiFixed
          ? {
            display: 'inline-block',
            verticalAlign: 'top',
            marginTop: `${block.marginTop}mm`,
            marginBottom: `${block.marginBottom}mm`,
            marginLeft: `${block.marginLeft + floatX}mm`,
            marginRight: `${block.marginRight}mm`,
            width: `${floatWidth}mm`,
            height: `${floatHeight}mm`,
          }
        : {
          marginTop: `${block.marginTop}mm`,
          marginBottom: `${block.marginBottom}mm`,
          marginLeft: `${block.marginLeft}mm`,
          marginRight: `${block.marginRight}mm`,
          minHeight: `${zoneMinHeightMm}mm`,
        };

      const frameStyle: React.CSSProperties = {
        width: '100%',
        height: isFloating || isSemiFixed ? '100%' : undefined,
        minHeight: isFloating || isSemiFixed ? undefined : `${zoneMinHeightMm}mm`,
        border: `${zoneBorderWidth}px solid ${zoneBorderOpacity <= 0 ? 'transparent' : applyOpacityToColor(zoneBorderColor, zoneBorderOpacity)}`,
        borderStyle: zoneBorderStyle,
        borderRadius: `${zoneBorderRadius}px`,
        background: applyOpacityToColor(zoneBackgroundColor, zoneBackgroundOpacity),
        padding: `${zonePaddingYMm}mm ${zonePaddingXMm}mm`,
        boxShadow: block.zoneShadow ? '0 8px 22px rgba(15,23,42,0.24)' : 'none',
      };

      return (
        <div
          key={block.id}
          ref={collectMetrics ? (node) => setRenderedBlockRef(block.id, node) : undefined}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            selectBlockFromPointer(event, block.id);
          }}
          onMouseDown={(event) => {
            if (!isFloating && !isSemiFixed) return;
            startFloatingInteraction(event, block, 'drag');
          }}
          onContextMenu={(event) => openBlockContextMenu(event, block.id)}
          draggable={isFlowLayoutBlock(block)}
          onDragStart={(event) => handleFlowBlockDragStart(event, block, scope)}
          onDragEnd={handleFlowBlockDragEnd}
          onDragOver={(event) => handleFlowBlockDragOver(event, block, scope)}
          onDrop={(event) => handleFlowBlockDrop(event, block, scope)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              selectBlock(block.id);
            }
          }}
          className={`relative ${isFloating || isSemiFixed ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} transition focus:outline-none focus-visible:outline-none ${
            isSelected ? 'outline outline-1 outline-blue-400 outline-offset-2' : ''
          }`}
          style={wrapperStyle}
        >
          {scope === 'root' && flowDropTarget?.targetId === block.id && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-20 h-[3px] bg-[#5f90ff]"
              style={flowDropTarget.position === 'before' ? { top: 0 } : { bottom: 0 }}
            />
          )}
          {renderPageBreakBadge(block)}
          <div
            style={frameStyle}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const isExistingBlockDrag = !!(event.dataTransfer.getData('application/x-openrig-flow-block') || draggingFlowBlockId);
              event.dataTransfer.dropEffect = isExistingBlockDrag ? 'move' : 'copy';
            }}
            onDrop={(event) => handleZoneDrop(event, block.id)}
          >
            {zoneChildren.length === 0 && (
              <div className="flex h-full min-h-[52px] items-center justify-center border border-dashed border-[#cbd5e1] text-[11px] text-[#94a3b8]">
                Déposez vos blocs ici
              </div>
            )}
            {zoneChildren.map((childBlock) => renderTemplateBlock(childBlock, 'nested', options))}
          </div>
          {isPrimarySelected && (isFloating || isSemiFixed) && (
            <>
              <div className="pointer-events-none absolute inset-0 border border-dashed border-[#3b82f6]" />
              {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as FloatingResizeHandle[]).map((handle) => (
                <button
                  key={`${block.id}_${handle}`}
                  type="button"
                  onMouseDown={(event) => {
                    startFloatingInteraction(event, block, 'resize', handle);
                  }}
                  className="absolute h-2.5 w-2.5 rounded-sm border border-[#1e3a8a] bg-white"
                  style={floatingHandleStyles[handle]}
                  aria-label={`Redimensionner ${handle}`}
                />
              ))}
            </>
          )}
        </div>
      );
    }

    if (block.type === 'image' || block.type === 'qrcode') {
      const isFloating = canFloat && block.layoutMode === 'floating';
      const floatWidth = Math.max(10, typeof block.floatWidth === 'number' ? block.floatWidth : 120);
      const floatHeight = Math.max(8, typeof block.floatHeight === 'number' ? block.floatHeight : 60);
      const floatX = clampValue(typeof block.floatX === 'number' ? block.floatX : 10, 0, Math.max(0, contentWidthMm - floatWidth));
      const floatY = clampValue(typeof block.floatY === 'number' ? block.floatY : 10, 0, Math.max(0, contentHeightMm - floatHeight));
      const imageAlign = block.imageAlign === 'left' || block.imageAlign === 'right' ? block.imageAlign : 'center';
      const imageWidthPercent = clampValue(typeof block.imageWidthPercent === 'number' ? block.imageWidthPercent : 100, 10, 100);
      const imageHeightMm = clampValue(typeof block.imageHeightMm === 'number' ? block.imageHeightMm : (block.type === 'qrcode' ? 35 : 40), 8, 260);
      const imageOpacity = clampValue(typeof block.imageOpacity === 'number' ? block.imageOpacity : 100, 0, 100);
      const imageBorderRadius = clampValue(typeof block.imageBorderRadius === 'number' ? block.imageBorderRadius : 0, 0, 999);
      const imageBorderWidth = clampValue(typeof block.imageBorderWidth === 'number' ? block.imageBorderWidth : 0, 0, 24);
      const imageBorderColor = typeof block.imageBorderColor === 'string' ? block.imageBorderColor : '#94a3b8';
      const imageBackgroundColor = typeof block.imageBackgroundColor === 'string' ? block.imageBackgroundColor : (block.type === 'qrcode' ? '#ffffff' : 'transparent');
      const imageRotation = clampValue(typeof block.imageRotation === 'number' ? block.imageRotation : 0, -180, 180);
      const imageFit: ImageFit = block.imageFit === 'contain' || block.imageFit === 'fill' || block.imageFit === 'none'
        ? block.imageFit
        : (block.type === 'qrcode' ? 'contain' : 'cover');
      const qrPreviewId = STUDIO_VARIABLE_MAP.get('rental_id')
        || STUDIO_VARIABLE_MAP.get('rental_reference')
        || 'PRESTA-ID-001';
      const qrPreviewValue = `project:${qrPreviewId}`;
      const imageUrl = block.type === 'qrcode'
        ? buildQrCodeImageUrl(qrPreviewValue)
        : (typeof block.imageUrl === 'string' ? block.imageUrl : '');

      const wrapperStyle: React.CSSProperties = isFloating
        ? {
          position: 'absolute',
          left: `${floatX}mm`,
          top: `${floatY}mm`,
          width: `${floatWidth}mm`,
          height: `${floatHeight}mm`,
        }
        : {
          marginTop: `${block.marginTop}mm`,
          marginBottom: `${block.marginBottom}mm`,
          marginLeft: `${block.marginLeft}mm`,
          marginRight: `${block.marginRight}mm`,
        };

      const frameStyle: React.CSSProperties = {
        width: isFloating ? '100%' : `${imageWidthPercent}%`,
        height: isFloating ? '100%' : `${imageHeightMm}mm`,
        borderRadius: `${imageBorderRadius}px`,
        border: `${imageBorderWidth}px solid ${imageBorderColor}`,
        backgroundColor: imageBackgroundColor,
        overflow: 'hidden',
        transform: `rotate(${imageRotation}deg)`,
        transformOrigin: 'center',
        boxShadow: block.imageShadow ? '0 8px 22px rgba(15,23,42,0.28)' : 'none',
      };

      const wrapperAlignClass = imageAlign === 'left'
        ? 'justify-start'
        : imageAlign === 'right'
          ? 'justify-end'
          : 'justify-center';

      return (
        <div
          key={block.id}
          ref={collectMetrics ? (node) => setRenderedBlockRef(block.id, node) : undefined}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            selectBlockFromPointer(event, block.id);
          }}
          onMouseDown={(event) => {
            if (!isFloating) return;
            startFloatingInteraction(event, block, 'drag');
          }}
          onContextMenu={(event) => openBlockContextMenu(event, block.id)}
          draggable={isFlowLayoutBlock(block)}
          onDragStart={(event) => handleFlowBlockDragStart(event, block, scope)}
          onDragEnd={handleFlowBlockDragEnd}
          onDragOver={(event) => handleFlowBlockDragOver(event, block, scope)}
          onDrop={(event) => handleFlowBlockDrop(event, block, scope)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              selectBlock(block.id);
            }
          }}
          className={`relative cursor-pointer transition focus:outline-none focus-visible:outline-none ${
            isSelected ? 'outline outline-1 outline-blue-400 outline-offset-2' : ''
          }`}
          style={wrapperStyle}
        >
          {scope === 'root' && flowDropTarget?.targetId === block.id && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-20 h-[3px] bg-[#5f90ff]"
              style={flowDropTarget.position === 'before' ? { top: 0 } : { bottom: 0 }}
            />
          )}
          {renderPageBreakBadge(block)}
          <div className={`flex w-full ${wrapperAlignClass}`} style={{ height: isFloating ? '100%' : undefined }}>
            <div style={frameStyle}>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={block.type === 'qrcode' ? 'QR code' : (block.imageAlt || 'Image')}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: imageFit,
                    opacity: imageOpacity / 100,
                    display: 'block',
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center border border-dashed border-[#cbd5e1] text-[11px] text-[#94a3b8]">
                  {block.type === 'qrcode' ? 'QR code indisponible' : 'Image vide'}
                </div>
              )}
            </div>
          </div>
          {isPrimarySelected && isFloating && (
            <>
              <div className="pointer-events-none absolute inset-0 border border-dashed border-[#3b82f6]" />
              {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as FloatingResizeHandle[]).map((handle) => (
                <button
                  key={`${block.id}_${handle}`}
                  type="button"
                  onMouseDown={(event) => {
                    startFloatingInteraction(event, block, 'resize', handle);
                  }}
                  className="absolute h-2.5 w-2.5 rounded-sm border border-[#1e3a8a] bg-white"
                  style={floatingHandleStyles[handle]}
                  aria-label={`Redimensionner ${handle}`}
                />
              ))}
            </>
          )}
        </div>
      );
    }

    if (block.type === 'separator') {
      const isFloating = canFloat && block.layoutMode === 'floating';
      const floatWidth = Math.max(10, typeof block.floatWidth === 'number' ? block.floatWidth : 120);
      const floatHeight = Math.max(8, typeof block.floatHeight === 'number' ? block.floatHeight : 8);
      const floatX = clampValue(typeof block.floatX === 'number' ? block.floatX : 10, 0, Math.max(0, contentWidthMm - floatWidth));
      const floatY = clampValue(typeof block.floatY === 'number' ? block.floatY : 10, 0, Math.max(0, contentHeightMm - floatHeight));
      const separatorWidthPercent = clampValue(typeof block.separatorWidthPercent === 'number' ? block.separatorWidthPercent : 100, 10, 100);
      const separatorThickness = clampValue(typeof block.separatorThickness === 'number' ? block.separatorThickness : 2, 1, 20);
      const separatorRadius = clampValue(typeof block.separatorRadius === 'number' ? block.separatorRadius : 999, 0, 999);
      const separatorStyle = block.separatorStyle ?? 'solid';
      const separatorColor = block.separatorColor ?? '#64748b';
      const separatorSecondaryColor = block.separatorSecondaryColor ?? '#94a3b8';
      const separatorOpacity = clampValue(typeof block.separatorOpacity === 'number' ? block.separatorOpacity : 100, 0, 100);
      const separatorAlign = block.separatorAlign ?? 'center';

      const wrapperStyle: React.CSSProperties = isFloating
        ? {
          position: 'absolute',
          left: `${floatX}mm`,
          top: `${floatY}mm`,
          width: `${floatWidth}mm`,
          height: `${floatHeight}mm`,
        }
        : {
          marginTop: `${block.marginTop}mm`,
          marginBottom: `${block.marginBottom}mm`,
          marginLeft: `${block.marginLeft}mm`,
          marginRight: `${block.marginRight}mm`,
          minHeight: `${Math.max(2, separatorThickness + 2)}px`,
        };

      const lineStyle: React.CSSProperties = {
        width: `${separatorWidthPercent}%`,
        opacity: separatorOpacity / 100,
        borderRadius: `${separatorRadius}px`,
      };

      if (separatorStyle === 'gradient') {
        lineStyle.height = `${separatorThickness}px`;
        lineStyle.background = `linear-gradient(90deg, ${separatorColor}, ${separatorSecondaryColor})`;
      } else if (separatorStyle === 'glow') {
        lineStyle.height = `${separatorThickness}px`;
        lineStyle.background = separatorColor;
        lineStyle.boxShadow = `0 0 ${separatorThickness * 2}px ${separatorColor}`;
      } else if (separatorStyle === 'double') {
        lineStyle.height = `${Math.max(3, separatorThickness * 2)}px`;
        lineStyle.borderTop = `${Math.max(1, Math.floor(separatorThickness / 2))}px solid ${separatorColor}`;
        lineStyle.borderBottom = `${Math.max(1, Math.floor(separatorThickness / 2))}px solid ${separatorColor}`;
      } else {
        lineStyle.borderTop = `${separatorThickness}px ${separatorStyle} ${separatorColor}`;
      }

      return (
        <div
          key={block.id}
          ref={collectMetrics ? (node) => setRenderedBlockRef(block.id, node) : undefined}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            selectBlockFromPointer(event, block.id);
          }}
          onMouseDown={(event) => {
            if (!isFloating) return;
            startFloatingInteraction(event, block, 'drag');
          }}
          onContextMenu={(event) => openBlockContextMenu(event, block.id)}
          draggable={isFlowLayoutBlock(block)}
          onDragStart={(event) => handleFlowBlockDragStart(event, block, scope)}
          onDragEnd={handleFlowBlockDragEnd}
          onDragOver={(event) => handleFlowBlockDragOver(event, block, scope)}
          onDrop={(event) => handleFlowBlockDrop(event, block, scope)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              selectBlock(block.id);
            }
          }}
          className={`relative cursor-pointer transition focus:outline-none focus-visible:outline-none ${
            isSelected ? 'outline outline-1 outline-blue-400 outline-offset-2' : ''
          }`}
          style={wrapperStyle}
        >
          {scope === 'root' && flowDropTarget?.targetId === block.id && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-20 h-[3px] bg-[#5f90ff]"
              style={flowDropTarget.position === 'before' ? { top: 0 } : { bottom: 0 }}
            />
          )}
          {renderPageBreakBadge(block)}
          <div
            className={`flex w-full ${separatorAlign === 'left' ? 'justify-start' : separatorAlign === 'right' ? 'justify-end' : 'justify-center'}`}
            style={{ height: isFloating ? '100%' : undefined, alignItems: 'center' }}
          >
            <div style={lineStyle} />
          </div>
          {isPrimarySelected && isFloating && (
            <>
              <div className="pointer-events-none absolute inset-0 border border-dashed border-[#3b82f6]" />
              {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as FloatingResizeHandle[]).map((handle) => (
                <button
                  key={`${block.id}_${handle}`}
                  type="button"
                  onMouseDown={(event) => {
                    startFloatingInteraction(event, block, 'resize', handle);
                  }}
                  className="absolute h-2.5 w-2.5 rounded-sm border border-[#1e3a8a] bg-white"
                  style={floatingHandleStyles[handle]}
                  aria-label={`Redimensionner ${handle}`}
                />
              ))}
            </>
          )}
        </div>
      );
    }

    if (block.type === 'table') {
      const isFloating = canFloat && block.layoutMode === 'floating';
      const floatWidth = Math.max(20, typeof block.floatWidth === 'number' ? block.floatWidth : 180);
      const floatHeight = Math.max(20, typeof block.floatHeight === 'number' ? block.floatHeight : 85);
      const floatX = clampValue(typeof block.floatX === 'number' ? block.floatX : 10, 0, Math.max(0, contentWidthMm - floatWidth));
      const floatY = clampValue(typeof block.floatY === 'number' ? block.floatY : 10, 0, Math.max(0, contentHeightMm - floatHeight));
      const tableColumns = (Array.isArray(block.tableColumns) && block.tableColumns.length > 0
        ? block.tableColumns
        : DEFAULT_TABLE_COLUMNS)
        .filter((key): key is TableColumnKey => isTableColumnKey(key));
      const activeColumns = tableColumns.length > 0 ? tableColumns : [...DEFAULT_TABLE_COLUMNS];
      const activeDefinitions = activeColumns.map((key) => (
        TABLE_COLUMN_DEFINITIONS.find((entry) => entry.key === key)
      )).filter((entry): entry is { key: TableColumnKey; label: string; align: 'left' | 'right' | 'center'; weight: number } => !!entry);

      const tableHeaderBackground = block.tableHeaderBackground ?? '#0f172a';
      const tableHeaderTextColor = block.tableHeaderTextColor ?? '#f8fafc';
      const tableBodyBackground = block.tableBodyBackground ?? '#f8fafc';
      const tableCategoryBackground = block.tableCategoryBackground ?? '#e2e8f0';
      const tableCategoryTextColor = block.tableCategoryTextColor ?? '#0f172a';
      const tableBorderColor = block.tableBorderColor ?? '#cbd5e1';
      const tableBorderWidth = clampValue(typeof block.tableBorderWidth === 'number' ? block.tableBorderWidth : 1, 0, 12);
      const tableBorderRadius = clampValue(typeof block.tableBorderRadius === 'number' ? block.tableBorderRadius : 12, 0, 999);
      const tableCellPaddingX = clampValue(typeof block.tableCellPaddingX === 'number' ? block.tableCellPaddingX : 14, 0, 64);
      const tableCellPaddingY = clampValue(typeof block.tableCellPaddingY === 'number' ? block.tableCellPaddingY : 10, 0, 64);
      const tableRowGapPx = clampValue(typeof block.tableRowGapPx === 'number' ? block.tableRowGapPx : 0, 0, 48);
      const tableFontSizePt = clampValue(typeof block.tableFontSizePt === 'number' ? block.tableFontSizePt : 12, 7, 36);
      const tableHeaderFontSizePt = clampValue(typeof block.tableHeaderFontSizePt === 'number' ? block.tableHeaderFontSizePt : 13, 7, 42);
      const tableHeaderBold = block.tableHeaderBold ?? true;
      const tableHeaderTextAlign: TableTextAlign = block.tableHeaderTextAlign === 'left' || block.tableHeaderTextAlign === 'center' || block.tableHeaderTextAlign === 'right'
        ? block.tableHeaderTextAlign
        : 'auto';
      const tableCategoryTextAlign: Exclude<TableTextAlign, 'auto'> = block.tableCategoryTextAlign === 'center' || block.tableCategoryTextAlign === 'right'
        ? block.tableCategoryTextAlign
        : 'left';
      const tableBodyTextAlign: TableTextAlign = block.tableBodyTextAlign === 'left' || block.tableBodyTextAlign === 'center' || block.tableBodyTextAlign === 'right'
        ? block.tableBodyTextAlign
        : 'auto';
      const tableHeaderColumnAlign = sanitizeTableColumnAlignMap(block.tableHeaderColumnAlign);
      const tableBodyColumnAlign = sanitizeTableColumnAlignMap(block.tableBodyColumnAlign);
      const showCategories = block.tableShowCategories ?? true;
      const previewTableGroups = getPreviewGroupsForTableBlock(block);
      const textColor = typeof block.textColor === 'string' ? block.textColor : '#0f172a';
      const columnTemplate = activeDefinitions.map((definition) => `${definition.weight}fr`).join(' ');
      const pxToMm = 25.4 / 96;
      const ptToMm = 0.352778;
      const paddingYMm = tableCellPaddingY * pxToMm;
      const paddingXMm = tableCellPaddingX * pxToMm;
      const borderMm = Math.max(0, tableBorderWidth * pxToMm);
      const headerLineHeightMm = Math.max(2.8, tableHeaderFontSizePt * ptToMm * 1.2);
      const bodyLineHeightMm = Math.max(2.6, tableFontSizePt * ptToMm * 1.25);
      const headerRowHeightMm = headerLineHeightMm + (paddingYMm * 2) + borderMm;
      const categoryRowHeightMm = bodyLineHeightMm + (Math.max(6, tableCellPaddingY) * pxToMm * 2) + borderMm;
      const blockRect = blockRectsMm[block.id];
      const tableStartMm = Number.isFinite(blockRect?.y) ? Number(blockRect.y) : 0;

      const totalWeight = Math.max(1, activeDefinitions.reduce((sum, definition) => sum + Math.max(1, definition.weight), 0));
      const designationDefinition = activeDefinitions.find((definition) => definition.key === 'designation');
      const tableWidthMm = isFloating
        ? floatWidth
        : Math.max(30, contentWidthMm - Math.max(0, block.marginLeft) - Math.max(0, block.marginRight));
      const designationWidthMm = designationDefinition
        ? (tableWidthMm * Math.max(1, designationDefinition.weight) / totalWeight)
        : (tableWidthMm * 0.4);
      const usableDesignationWidthMm = Math.max(
        18,
        designationWidthMm - (paddingXMm * 2) - borderMm
      );
      const approximateCharWidthMm = Math.max(0.9, tableFontSizePt * ptToMm * 0.52);
      const resolveCellAlign = (
        defaultAlign: 'left' | 'right' | 'center',
        override: TableTextAlign
      ): 'left' | 'right' | 'center' => {
        if (override === 'left' || override === 'center' || override === 'right') return override;
        return defaultAlign;
      };
      const resolveHeaderAlign = (column: { key: TableColumnKey; align: 'left' | 'right' | 'center' }): 'left' | 'right' | 'center' => (
        tableHeaderColumnAlign[column.key] ?? resolveCellAlign(column.align, tableHeaderTextAlign)
      );
      const resolveBodyAlign = (column: { key: TableColumnKey; align: 'left' | 'right' | 'center' }): 'left' | 'right' | 'center' => (
        tableBodyColumnAlign[column.key] ?? resolveCellAlign(column.align, tableBodyTextAlign)
      );
      const isTableTextActive = (kind: TableTextTargetKind, columnKey?: TableColumnKey): boolean => (
        selectedTableText?.blockId === block.id
        && selectedTableText.kind === kind
        && selectedTableText.columnKey === columnKey
      );

      const wrapperStyle: React.CSSProperties = isFloating
        ? {
          position: 'absolute',
          left: `${floatX}mm`,
          top: `${floatY}mm`,
          width: `${floatWidth}mm`,
          height: `${floatHeight}mm`,
        }
        : {
          marginTop: `${block.marginTop}mm`,
          marginBottom: `${block.marginBottom}mm`,
          marginLeft: `${block.marginLeft}mm`,
          marginRight: `${block.marginRight}mm`,
        };

      const containerStyle: React.CSSProperties = {
        width: '100%',
        height: isFloating ? '100%' : undefined,
        background: tableBodyBackground,
        border: `${tableBorderWidth}px solid ${tableBorderColor}`,
        borderRadius: `${tableBorderRadius}px`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      };

      const getItemValue = (item: Record<string, string>, key: TableColumnKey): string => {
        if (key === 'quantity') return item.quantity ?? '';
        if (key === 'designation') return item.designation ?? '';
        if (key === 'discount') return item.discount ?? '';
        if (key === 'unit_price') return item.unit_price ?? '';
        if (key === 'total') return item.total ?? '';
        if (key === 'days') return item.days ?? '';
        if (key === 'coefficient') return item.coefficient ?? '';
        if (key === 'checkbox') return item.checkbox ?? '□';
        return '';
      };

      const estimateItemRowHeightMm = (item: Record<string, string>): number => {
        const designation = (getItemValue(item, 'designation') || '').replace(/<br\s*\/?>/gi, '\n');
        const explicitLineCount = designation.length > 0
          ? designation.split('\n').filter((line) => line.trim().length > 0).length
          : 1;
        const roughWrappedLines = Math.max(
          1,
          Math.ceil((designation.replace(/\n/g, '').length * approximateCharWidthMm) / usableDesignationWidthMm)
        );
        const lineCount = Math.max(explicitLineCount, roughWrappedLines);
        return (lineCount * bodyLineHeightMm) + (paddingYMm * 2) + borderMm;
      };

      type PreviewTableRenderRow =
        | {
          kind: 'category';
          key: string;
          groupIndex: number;
          category: string;
          heightMm: number;
        }
        | {
          kind: 'item';
          key: string;
          groupIndex: number;
          itemIndex: number;
          item: Record<TableColumnKey, string>;
          heightMm: number;
        }
        | {
          kind: 'spacer';
          key: string;
          heightMm: number;
        };

      const baseRows: PreviewTableRenderRow[] = [];
      previewTableGroups.forEach((group, groupIndex) => {
        if (showCategories) {
          baseRows.push({
            kind: 'category',
            key: `${block.id}_category_${groupIndex}`,
            groupIndex,
            category: group.category,
            heightMm: categoryRowHeightMm,
          });
        }
        group.items.forEach((item, itemIndex) => {
          baseRows.push({
            kind: 'item',
            key: `${block.id}_${groupIndex}_${itemIndex}`,
            groupIndex,
            itemIndex,
            item,
            heightMm: estimateItemRowHeightMm(item),
          });
        });
      });

      const paginatedRows: PreviewTableRenderRow[] = [];
      if (!isFloating && contentHeightMm > 0) {
        let cursorMm = tableStartMm + headerRowHeightMm;
        let breakIndex = 0;
        baseRows.forEach((row) => {
          const pageEndMm = (Math.floor(cursorMm / contentHeightMm) + 1) * contentHeightMm;
          if (cursorMm + row.heightMm > pageEndMm + 0.01) {
            const spacerHeightMm = Math.max(0, pageEndMm - cursorMm);
            if (spacerHeightMm > 0.6) {
              paginatedRows.push({
                kind: 'spacer',
                key: `${block.id}_spacer_${breakIndex}`,
                heightMm: spacerHeightMm,
              });
            }
            cursorMm = pageEndMm;
            breakIndex += 1;
          }
          paginatedRows.push(row);
          cursorMm += row.heightMm;
        });
      } else {
        paginatedRows.push(...baseRows);
      }

      return (
        <div
          key={block.id}
          ref={collectMetrics ? (node) => setRenderedBlockRef(block.id, node) : undefined}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            selectBlockFromPointer(event, block.id);
          }}
          onMouseDown={(event) => {
            if (!isFloating) return;
            startFloatingInteraction(event, block, 'drag');
          }}
          onContextMenu={(event) => openBlockContextMenu(event, block.id)}
          draggable={isFlowLayoutBlock(block)}
          onDragStart={(event) => handleFlowBlockDragStart(event, block, scope)}
          onDragEnd={handleFlowBlockDragEnd}
          onDragOver={(event) => handleFlowBlockDragOver(event, block, scope)}
          onDrop={(event) => handleFlowBlockDrop(event, block, scope)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              selectBlock(block.id);
            }
          }}
          className={`relative cursor-pointer transition focus:outline-none focus-visible:outline-none ${
            isSelected ? 'outline outline-1 outline-blue-400 outline-offset-2' : ''
          }`}
          style={wrapperStyle}
        >
          {scope === 'root' && flowDropTarget?.targetId === block.id && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-20 h-[3px] bg-[#5f90ff]"
              style={flowDropTarget.position === 'before' ? { top: 0 } : { bottom: 0 }}
            />
          )}
          {renderPageBreakBadge(block)}
          <div style={containerStyle}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: columnTemplate,
                background: tableHeaderBackground,
                color: tableHeaderTextColor,
                borderBottom: `${tableBorderWidth}px solid ${tableBorderColor}`,
              }}
            >
              {activeDefinitions.map((definition) => (
                <div
                  key={`${block.id}_header_${definition.key}`}
                  title="Sélectionner ce titre de colonne"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => selectTableTextTarget(event, block.id, 'header', definition.key)}
                  style={{
                    padding: `${tableCellPaddingY}px ${tableCellPaddingX}px`,
                    fontSize: `${tableHeaderFontSizePt}pt`,
                    fontWeight: tableHeaderBold ? 700 : 500,
                    textAlign: resolveHeaderAlign(definition),
                    borderRight: definition.key === activeDefinitions[activeDefinitions.length - 1]?.key ? 'none' : `${tableBorderWidth}px solid ${tableBorderColor}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    boxShadow: isTableTextActive('header', definition.key) ? 'inset 0 0 0 2px #5f90ff' : 'none',
                  }}
                >
                  {definition.key === 'checkbox' ? '' : definition.label}
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: `${tableRowGapPx}px`,
                background: tableBodyBackground,
                color: textColor,
                fontSize: `${tableFontSizePt}pt`,
                height: isFloating ? '100%' : undefined,
                overflow: isFloating ? 'auto' : undefined,
              }}
            >
              {paginatedRows.map((row, rowIndex) => {
                if (row.kind === 'spacer') {
                  return (
                    <div
                      key={row.key}
                      aria-hidden="true"
                      style={{
                        height: `${row.heightMm}mm`,
                        background: tableBodyBackground,
                      }}
                    />
                  );
                }

                if (row.kind === 'category') {
                  const showTopBorder = rowIndex > 0;
                  return (
                    <div
                      key={row.key}
                      title="Sélectionner le texte de catégorie"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => selectTableTextTarget(event, block.id, 'category')}
                      style={{
                        padding: `${Math.max(6, tableCellPaddingY)}px ${tableCellPaddingX}px`,
                        background: tableCategoryBackground,
                        color: tableCategoryTextColor,
                        fontWeight: 700,
                        textAlign: tableCategoryTextAlign,
                        borderBottom: `${tableBorderWidth}px solid ${tableBorderColor}`,
                        borderTop: showTopBorder ? `${tableBorderWidth}px solid ${tableBorderColor}` : 'none',
                        cursor: 'pointer',
                        userSelect: 'none',
                        boxShadow: isTableTextActive('category') ? 'inset 0 0 0 2px #5f90ff' : 'none',
                      }}
                    >
                      {row.category}
                    </div>
                  );
                }

                return (
                  <div
                    key={row.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: columnTemplate,
                      borderBottom: `${tableBorderWidth}px solid ${tableBorderColor}`,
                      background: tableBodyBackground,
                    }}
                  >
                    {activeDefinitions.map((definition) => (
                      <div
                        key={`${row.key}_${definition.key}`}
                        title="Sélectionner cette colonne matériel/service"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => selectTableTextTarget(event, block.id, 'body', definition.key)}
                        style={{
                          padding: `${tableCellPaddingY}px ${tableCellPaddingX}px`,
                          textAlign: resolveBodyAlign(definition),
                          borderRight: definition.key === activeDefinitions[activeDefinitions.length - 1]?.key ? 'none' : `${tableBorderWidth}px solid ${tableBorderColor}`,
                          whiteSpace: definition.key === 'designation' ? 'normal' : 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                          userSelect: 'none',
                          boxShadow: isTableTextActive('body', definition.key) ? 'inset 0 0 0 2px #5f90ff' : 'none',
                        }}
                      >
                        {definition.key === 'checkbox' ? (
                          <span
                            aria-hidden="true"
                            style={{
                              display: 'inline-block',
                              width: '11pt',
                              height: '11pt',
                              border: '1.4px solid #64748b',
                              borderRadius: '2px',
                              boxSizing: 'border-box',
                              verticalAlign: 'middle',
                            }}
                          />
                        ) : (
                          getItemValue(row.item, definition.key)
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          {isPrimarySelected && isFloating && (
            <>
              <div className="pointer-events-none absolute inset-0 border border-dashed border-[#3b82f6]" />
              {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as FloatingResizeHandle[]).map((handle) => (
                <button
                  key={`${block.id}_${handle}`}
                  type="button"
                  onMouseDown={(event) => {
                    startFloatingInteraction(event, block, 'resize', handle);
                  }}
                  className="absolute h-2.5 w-2.5 rounded-sm border border-[#1e3a8a] bg-white"
                  style={floatingHandleStyles[handle]}
                  aria-label={`Redimensionner ${handle}`}
                />
              ))}
            </>
          )}
        </div>
      );
    }

    const resolvedHtml = resolveVariablePlaceholders(ensureEditorHtml(block));
    const isFloating = canFloat && block.layoutMode === 'floating';
    const floatWidth = Math.max(10, typeof block.floatWidth === 'number' ? block.floatWidth : 120);
    const floatHeight = Math.max(8, typeof block.floatHeight === 'number' ? block.floatHeight : 20);
    const floatX = clampValue(typeof block.floatX === 'number' ? block.floatX : 10, 0, Math.max(0, contentWidthMm - floatWidth));
    const floatY = clampValue(typeof block.floatY === 'number' ? block.floatY : 10, 0, Math.max(0, contentHeightMm - floatHeight));

    const wrapperStyle: React.CSSProperties = isFloating
      ? {
        position: 'absolute',
        left: `${floatX}mm`,
        top: `${floatY}mm`,
        width: `${floatWidth}mm`,
        height: `${floatHeight}mm`,
      }
      : {
        marginTop: `${block.marginTop}mm`,
        marginBottom: `${block.marginBottom}mm`,
        marginLeft: `${block.marginLeft}mm`,
        marginRight: `${block.marginRight}mm`,
      };

    const textStyle: React.CSSProperties = {
      fontSize: `${block.fontSize}pt`,
      fontFamily: block.fontFamily,
      fontWeight: block.bold ? 700 : 400,
      fontStyle: block.italic ? 'italic' : 'normal',
      textDecoration: block.underline ? 'underline' : 'none',
      textAlign: block.textAlign,
      lineHeight: 1.2,
      color: typeof block.textColor === 'string' ? block.textColor : '#111827',
      height: isFloating ? '100%' : undefined,
      width: isFloating ? '100%' : undefined,
      overflow: isFloating ? 'hidden' : undefined,
    };

    return (
      <div
        key={block.id}
        ref={collectMetrics ? (node) => setRenderedBlockRef(block.id, node) : undefined}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          selectBlockFromPointer(event, block.id);
        }}
        onMouseDown={(event) => {
          if (!isFloating) return;
          startFloatingInteraction(event, block, 'drag');
        }}
        onContextMenu={(event) => openBlockContextMenu(event, block.id)}
        draggable={isFlowLayoutBlock(block)}
        onDragStart={(event) => handleFlowBlockDragStart(event, block, scope)}
        onDragEnd={handleFlowBlockDragEnd}
        onDragOver={(event) => handleFlowBlockDragOver(event, block, scope)}
        onDrop={(event) => handleFlowBlockDrop(event, block, scope)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            selectBlock(block.id);
          }
        }}
        className={`relative cursor-pointer transition focus:outline-none focus-visible:outline-none ${
          isSelected ? 'outline outline-1 outline-blue-400 outline-offset-2' : ''
        }`}
        style={wrapperStyle}
      >
        {scope === 'root' && flowDropTarget?.targetId === block.id && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 h-[3px] bg-[#5f90ff]"
            style={flowDropTarget.position === 'before' ? { top: 0 } : { bottom: 0 }}
          />
        )}
        {renderPageBreakBadge(block)}
        <div
          style={textStyle}
          dangerouslySetInnerHTML={{ __html: resolvedHtml }}
        />
        {isPrimarySelected && isFloating && (
          <>
            <div className="pointer-events-none absolute inset-0 border border-dashed border-[#3b82f6]" />
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as FloatingResizeHandle[]).map((handle) => (
                <button
                  key={`${block.id}_${handle}`}
                  type="button"
                  onMouseDown={(event) => {
                    startFloatingInteraction(event, block, 'resize', handle);
                  }}
                  className="absolute h-2.5 w-2.5 rounded-sm border border-[#1e3a8a] bg-white"
                  style={floatingHandleStyles[handle]}
                  aria-label={`Redimensionner ${handle}`}
                />
              ))}
          </>
        )}
      </div>
    );
  }

  const renderRootBlocks = (collectMetrics: boolean): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const semiFixedZones = blocks.filter((candidate) => candidate.type === 'zone' && candidate.layoutMode === 'semi-fixed');
    let semiFixedRendered = false;
    let index = 0;
    while (index < blocks.length) {
      const block = blocks[index];
      const isSemiFixedZone = block.type === 'zone' && block.layoutMode === 'semi-fixed';
      if (!isSemiFixedZone) {
        nodes.push(renderTemplateBlock(block, 'root', { collectMetrics }));
        index += 1;
        continue;
      }
      if (!semiFixedRendered && semiFixedZones.length > 0) {
        nodes.push(
          <div
            key={`studio_semifixed_row_${collectMetrics ? 'primary' : 'replica'}`}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', width: '100%' }}
          >
            {semiFixedZones.map((candidate) => renderTemplateBlock(candidate, 'root', { collectMetrics }))}
          </div>
        );
        semiFixedRendered = true;
      }
      index += 1;
    }
    return nodes;
  };

  const renderPreviewPage = (pageNumber: number) => {
    const pageOffsetMm = (pageNumber - 1) * contentHeightMm;
    const isPrimaryInteractivePage = pageNumber === 1;
    return (
      <div
        key={`preview_page_${pageNumber}`}
        ref={(node) => setPreviewPageRef(pageNumber, node)}
        className="mx-auto mb-6 last:mb-0"
        style={{
          width: `${pageWidthPx * pageScale}px`,
          height: `${pageHeightPx * pageScale}px`,
        }}
      >
        <div
          className="relative h-full w-full shadow-none"
          style={{
            width: `${pageWidthPx}px`,
            height: `${pageHeightPx}px`,
            transform: `scale(${pageScale})`,
            transformOrigin: 'top left',
            backgroundColor: pageBackgroundColor || '#ffffff',
          }}
          onClick={() => {
            if (!isPrimaryInteractivePage) return;
            setSelectedBlockId(null);
            setSelectedBlockIds([]);
            setBlockContextMenu(null);
          }}
          onDragOver={(event) => {
            if (!isPrimaryInteractivePage) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            if (!isPrimaryInteractivePage) return;
            handlePreviewDrop(event);
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: pageBackgroundColor || '#ffffff' }}
          />
          {pageBackgroundImage && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `url(${pageBackgroundImage})`,
                backgroundSize: pageBackgroundSize === 'auto' ? 'auto' : pageBackgroundSize,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                opacity: clampValue(pageBackgroundOpacity, 0, 100) / 100,
              }}
            />
          )}
          {showPageBandOverlay && (
            <>
              <div
                className="pointer-events-none absolute z-[4]"
                style={{
                  left: `${marginLeft}mm`,
                  right: `${marginRight}mm`,
                  top: `${pageBandSettings.topOffsetMm}mm`,
                  color: pageBandSettings.textColor,
                  fontSize: `${pageBandSettings.fontSizePt}pt`,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    columnGap: `${pageBandSettings.sidePaddingMm}mm`,
                    alignItems: 'start',
                  }}
                >
                  <div style={{ textAlign: 'left', lineHeight: 1.25 }} dangerouslySetInnerHTML={{ __html: getPreviewBandHtml(pageBandSettings.header.left, pageNumber, totalPages) }} />
                  <div style={{ textAlign: 'center', lineHeight: 1.25 }} dangerouslySetInnerHTML={{ __html: getPreviewBandHtml(pageBandSettings.header.center, pageNumber, totalPages) }} />
                  <div style={{ textAlign: 'right', lineHeight: 1.25 }} dangerouslySetInnerHTML={{ __html: getPreviewBandHtml(pageBandSettings.header.right, pageNumber, totalPages) }} />
                </div>
              </div>
              <div
                className="pointer-events-none absolute z-[4]"
                style={{
                  left: `${marginLeft}mm`,
                  right: `${marginRight}mm`,
                  bottom: `${pageBandSettings.bottomOffsetMm}mm`,
                  color: pageBandSettings.textColor,
                  fontSize: `${pageBandSettings.fontSizePt}pt`,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    columnGap: `${pageBandSettings.sidePaddingMm}mm`,
                    alignItems: 'end',
                  }}
                >
                  <div style={{ textAlign: 'left', lineHeight: 1.25 }} dangerouslySetInnerHTML={{ __html: getPreviewBandHtml(pageBandSettings.footer.left, pageNumber, totalPages) }} />
                  <div style={{ textAlign: 'center', lineHeight: 1.25 }} dangerouslySetInnerHTML={{ __html: getPreviewBandHtml(pageBandSettings.footer.center, pageNumber, totalPages) }} />
                  <div style={{ textAlign: 'right', lineHeight: 1.25 }} dangerouslySetInnerHTML={{ __html: getPreviewBandHtml(pageBandSettings.footer.right, pageNumber, totalPages) }} />
                </div>
              </div>
            </>
          )}
          {showGuides && (
            <div
              className="pointer-events-none absolute border border-dashed border-gray-400"
              style={marginGuidesStyle}
            />
          )}
          <div
            ref={isPrimaryInteractivePage ? contentCanvasRef : undefined}
            className="absolute overflow-hidden"
            style={marginGuidesStyle}
          >
            <div className="h-full w-full p-0">
              {blocks.length === 0 && pageNumber === 1 && (
                <div className="flex h-full items-center justify-center text-center text-xs text-gray-400">
                  Glissez un bloc ici
                </div>
              )}
              {blocks.length > 0 && (
                <div
                  style={{
                    transform: pageOffsetMm > 0 ? `translateY(-${pageOffsetMm}mm)` : 'none',
                    transformOrigin: 'top left',
                    pointerEvents: 'auto',
                  }}
                >
                  {renderRootBlocks(isPrimaryInteractivePage)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 bg-[#3b4148]">
      <div className="flex h-full min-h-0 w-full">
        <section className="flex h-full min-h-0 flex-1 overflow-hidden px-0 py-0">
          <div className="flex h-full min-h-0 w-full flex-col">
            <div className="flex w-full items-center justify-center gap-2 border-b border-[#525961] bg-[#2b3138] px-4 py-2 text-sm text-[#d7dde5]">
                <button
                  type="button"
                  onClick={() => scrollToPage(clampPage(currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#616870] text-[#e9edf2] hover:bg-[#3a4149] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  value={String(currentPage)}
                  readOnly
                  className="h-8 w-12 rounded border border-[#616870] bg-[#1f242b] px-2 text-center text-sm text-[#eef2f7] outline-none focus:border-[#7f8791]"
                />
                <span className="text-[#b3bac2]">/ {totalPages}</span>
                <button
                  type="button"
                  onClick={() => scrollToPage(clampPage(currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#616870] text-[#e9edf2] hover:bg-[#3a4149] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Page suivante"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="mx-2 h-6 w-px bg-[#5c646d]" />
                <button
                  type="button"
                  onClick={undoLastChange}
                  disabled={!canUndo}
                  className="inline-flex h-8 items-center gap-1 rounded border border-[#616870] px-2 text-[#e9edf2] hover:bg-[#3a4149] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Annuler (Ctrl+Z)"
                  title="Annuler (Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4" />
                  <span className="text-xs">Retour</span>
                </button>
                <div className="mx-2 h-6 w-px bg-[#5c646d]" />
                <button
                  type="button"
                  onClick={() => setZoom((prev) => clampZoom(prev - 10))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#616870] text-[#e9edf2] hover:bg-[#3a4149]"
                  aria-label="Dézoomer"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-14 text-center text-[#d7dde5]">{zoom}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((prev) => clampZoom(prev + 10))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#616870] text-[#e9edf2] hover:bg-[#3a4149]"
                  aria-label="Zoomer"
                >
                  <Plus className="h-4 w-4" />
                </button>
            </div>

            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-auto"
            >
              <div className="w-full pb-0 pt-6">
                {previewPageNumbers.map((pageNumber) => renderPreviewPage(pageNumber))}
              </div>
            </div>
          </div>
        </section>
        <aside className="w-full max-w-[460px] border-l border-[#4b5158] bg-[#1f2328] flex min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 lg:px-6 lg:py-7">
            {activeTool === 'margins' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Marges du document</h3>
                  <p className="mt-1 text-xs text-[#a4adb7]">
                    Réglez les marges en millimètres. Les repères apparaissent en pointillés dans la prévisualisation pendant l’édition.
                  </p>
                </div>

                <div className="rounded-md border border-[#343b43] bg-[#232931] p-3">
                  <div className="mb-2 text-xs text-[#d7dde5]">Marges haut / bas</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                    <label className="space-y-1">
                      <span className="text-xs text-[#aeb6c0]">Marge haute (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={148}
                        value={Math.round(marginTop)}
                        onFocus={showGuidesNow}
                        onBlur={hideGuidesSoon}
                        onChange={(e) => setVerticalMargins(Number(e.target.value), 'top')}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !linkVertical;
                        setLinkVertical(next);
                        if (next) {
                          setMarginBottom(marginTop);
                          flashGuides();
                        }
                      }}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                        linkVertical
                          ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                          : 'border-[#4a525b] bg-[#171c22] text-[#c7d0d9] hover:bg-[#222933]'
                      }`}
                      title={linkVertical ? 'Délier haut / bas' : 'Lier haut / bas'}
                    >
                      {linkVertical ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                    </button>
                    <label className="space-y-1">
                      <span className="text-xs text-[#aeb6c0]">Marge basse (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={148}
                        value={Math.round(marginBottom)}
                        onFocus={showGuidesNow}
                        onBlur={hideGuidesSoon}
                        onChange={(e) => setVerticalMargins(Number(e.target.value), 'bottom')}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-md border border-[#343b43] bg-[#232931] p-3">
                  <div className="mb-2 text-xs text-[#d7dde5]">Marges gauche / droite</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                    <label className="space-y-1">
                      <span className="text-xs text-[#aeb6c0]">Marge gauche (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={104}
                        value={Math.round(marginLeft)}
                        onFocus={showGuidesNow}
                        onBlur={hideGuidesSoon}
                        onChange={(e) => setHorizontalMargins(Number(e.target.value), 'left')}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !linkHorizontal;
                        setLinkHorizontal(next);
                        if (next) {
                          setMarginRight(marginLeft);
                          flashGuides();
                        }
                      }}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                        linkHorizontal
                          ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                          : 'border-[#4a525b] bg-[#171c22] text-[#c7d0d9] hover:bg-[#222933]'
                      }`}
                      title={linkHorizontal ? 'Délier gauche / droite' : 'Lier gauche / droite'}
                    >
                      {linkHorizontal ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                    </button>
                    <label className="space-y-1">
                      <span className="text-xs text-[#aeb6c0]">Marge droite (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={104}
                        value={Math.round(marginRight)}
                        onFocus={showGuidesNow}
                        onBlur={hideGuidesSoon}
                        onChange={(e) => setHorizontalMargins(Number(e.target.value), 'right')}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3">
                  <div className="text-xs text-[#d7dde5]">Fond du document</div>
                  <label className="space-y-1 block">
                    <span className="text-xs text-[#aeb6c0]">Couleur de fond</span>
                    <div className="flex items-center gap-2">
                      <ColorPickerButton
                        size="sm"
                        value={pageBackgroundColor}
                        onChange={setPageBackgroundColor}
                        ariaLabel="Couleur de fond du document"
                      />
                    </div>
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-xs text-[#aeb6c0]">Image de fond (URL)</span>
                    <input
                      value={pageBackgroundImage}
                      onChange={(event) => setPageBackgroundImage(event.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-xs text-[#aeb6c0]">Importer un fond</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBackgroundImageUpload}
                      className="block w-full text-xs text-[#cdd6df] file:mr-3 file:rounded-md file:border file:border-[#3c444d] file:bg-[#171c22] file:px-3 file:py-2 file:text-xs file:text-[#d7dde5]"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <SettingsFieldLabel icon={ImageIcon} label="Mode d’image" />
                      <select
                        value={pageBackgroundSize}
                        onChange={(event) => setPageBackgroundSize(event.target.value as BackgroundSizeMode)}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="auto">Taille native</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#aeb6c0]">Opacité image</span>
                        <span className="text-xs text-[#d7dde5]">{Math.round(pageBackgroundOpacity)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(pageBackgroundOpacity)}
                        onChange={(event) => setPageBackgroundOpacity(clampValue(Number(event.target.value) || 0, 0, 100))}
                        className="w-full accent-[#5f90ff]"
                      />
                    </label>
                  </div>
                </div>

              </div>
            )}

            {activeTool === 'pageBands' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">En-tête / Pied de page</h3>
                  <p className="mt-1 text-xs text-[#a4adb7]">
                    Saisissez du texte en haut et en bas de page aux positions gauche, centre et droite.
                    Utilisez les mêmes variables que les blocs de texte (ex: {'{{document_page}}'} / {'{{document_pages}}'}).
                  </p>
                </div>

                <div className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3">
                  <label className="inline-flex items-center gap-2 text-xs text-[#d7dde5]">
                    <input
                      type="checkbox"
                      checked={pageBandSettings.enabled}
                      onChange={(event) => setPageBandSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
                      className="rounded border-[#3c444d] bg-[#171c22]"
                    />
                    Activer l’en-tête / pied de page
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <SettingsFieldLabel icon={TypeIcon} label="Taille texte (pt)" />
                      <input
                        type="number"
                        min={6}
                        max={24}
                        value={Math.round(pageBandSettings.fontSizePt)}
                        onChange={(event) => setPageBandSettings((prev) => ({ ...prev, fontSizePt: clampValue(Number(event.target.value) || 6, 6, 24) }))}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-[#aeb6c0]">Couleur texte</span>
                      <div className="flex items-center gap-2">
                        <ColorPickerButton
                          size="sm"
                          value={pageBandSettings.textColor}
                          onChange={(value) => setPageBandSettings((prev) => ({ ...prev, textColor: value }))}
                          ariaLabel="Couleur du texte des bandes de page"
                        />
                      </div>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-[#aeb6c0]">Offset haut (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={40}
                        value={Math.round(pageBandSettings.topOffsetMm)}
                        onChange={(event) => setPageBandSettings((prev) => ({ ...prev, topOffsetMm: clampValue(Number(event.target.value) || 0, 0, 40) }))}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-[#aeb6c0]">Offset bas (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={40}
                        value={Math.round(pageBandSettings.bottomOffsetMm)}
                        onChange={(event) => setPageBandSettings((prev) => ({ ...prev, bottomOffsetMm: clampValue(Number(event.target.value) || 0, 0, 40) }))}
                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3">
                  <div className="text-xs font-semibold text-[#d7dde5]">En-tête</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['left', 'center', 'right'] as PageBandSide[]).map((side) => (
                      <label key={`header_${side}`} className="space-y-1">
                        <span className="text-xs text-[#aeb6c0]">
                          {side === 'left' ? 'Gauche' : side === 'center' ? 'Centre' : 'Droite'}
                        </span>
                        <textarea
                          value={pageBandSettings.header[side]}
                          onFocus={() => setPageBandFocusField(`header.${side}`)}
                          onChange={(event) => updatePageBandText('header', side, event.target.value)}
                          rows={3}
                          className="w-full resize-y rounded-md border border-[#3c444d] bg-[#171c22] px-2 py-2 text-xs text-white outline-none focus:border-[#5f90ff]"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3">
                  <div className="text-xs font-semibold text-[#d7dde5]">Pied de page</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['left', 'center', 'right'] as PageBandSide[]).map((side) => (
                      <label key={`footer_${side}`} className="space-y-1">
                        <span className="text-xs text-[#aeb6c0]">
                          {side === 'left' ? 'Gauche' : side === 'center' ? 'Centre' : 'Droite'}
                        </span>
                        <textarea
                          value={pageBandSettings.footer[side]}
                          onFocus={() => setPageBandFocusField(`footer.${side}`)}
                          onChange={(event) => updatePageBandText('footer', side, event.target.value)}
                          rows={3}
                          className="w-full resize-y rounded-md border border-[#3c444d] bg-[#171c22] px-2 py-2 text-xs text-white outline-none focus:border-[#5f90ff]"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3">
                  <div className="text-xs font-semibold text-[#d7dde5]">Variables</div>
                  <div className="text-[11px] text-[#90a0b2]">
                    Champ sélectionné: {pageBandFocusField ? pageBandFocusField : 'aucun'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => insertVariableTokenInPageBand('document_page')}
                      className="rounded-md border border-[#3c444d] bg-[#11161c] px-2 py-1 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                    >
                      Page courante
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariableTokenInPageBand('document_pages')}
                      className="rounded-md border border-[#3c444d] bg-[#11161c] px-2 py-1 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                    >
                      Nombre de pages
                    </button>
                  </div>
                  <input
                    value={pageBandVariableSearch}
                    onChange={(event) => setPageBandVariableSearch(event.target.value)}
                    placeholder="Rechercher une variable..."
                    className="w-full rounded-md border border-[#3c444d] bg-[#11161c] px-3 py-2 text-xs text-white outline-none focus:border-[#5f90ff]"
                  />
                  <div className="max-h-[220px] space-y-2 overflow-y-auto rounded-md border border-[#343b43] bg-[#1b2027] p-2">
                    {filteredPageBandVariableGroups.length === 0 && (
                      <div className="text-xs text-[#90a0b2]">Aucune variable trouvée.</div>
                    )}
                    {filteredPageBandVariableGroups.map((group) => (
                      <div key={`page_band_${group.id}`} className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8fa2b8]">{group.label}</div>
                        <div className="flex flex-wrap gap-2">
                          {group.variables.map((variable) => (
                            <button
                              key={`page_band_${variable.key}`}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => insertVariableTokenInPageBand(variable.key)}
                              className="rounded-md border border-[#3c444d] bg-[#11161c] px-2 py-1 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                              title={`${variable.key} · ${variable.placeholder}`}
                            >
                              {variable.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTool === 'blocks' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Blocs</h3>
                  <p className="mt-1 text-xs text-[#a4adb7]">Glissez un bloc vers la page de prévisualisation.</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'title')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    Titre
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'subtitle')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    Sous-titre
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'grid')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    Grille
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'separator')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    Séparateur
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'image')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-4 w-4" />
                      <span>Image</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'qrcode')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    <span className="inline-flex items-center gap-1">
                      <QrCode className="h-4 w-4" />
                      <span>QR code</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'zone')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    Zone
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleBlockDragStart(event, 'table')}
                    className="col-span-1 flex h-24 items-center justify-center rounded-lg border border-[#3b434d] bg-[#1b2027] text-sm font-medium text-[#e7edf4] hover:bg-[#232a33]"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Table2 className="h-4 w-4" />
                      <span>Tableau</span>
                    </span>
                  </button>
                </div>
              </div>
            )}

            {activeTool === 'layers' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Layers</h3>
                  <p className="mt-1 text-xs text-[#a4adb7]">
                    Gérez les calques du document et créez des groupes.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedBlockIds.length === 0}
                    onClick={createLayerGroupFromSelection}
                    className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Créer un groupe depuis la sélection
                  </button>
                </div>

                {layerGroups.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-[#d7dde5]">Groupes</div>
                    {layerGroups.map((group) => (
                      <div
                        key={group.id}
                        className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            value={group.name}
                            onChange={(event) => renameLayerGroup(group.id, event.target.value)}
                            className="flex-1 rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                          />
                          <button
                            type="button"
                            onClick={() => deleteLayerGroup(group.id)}
                            className="rounded-md border border-[#5a3940] bg-[#2a1d22] px-2 py-2 text-xs text-[#fca5a5] hover:bg-[#362329]"
                          >
                            Supprimer
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={selectedBlockIds.length === 0}
                            onClick={() => addSelectedBlockToGroup(group.id)}
                            className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Ajouter la sélection
                          </button>
                        </div>

                        <div className="space-y-1">
                          {group.blockIds.length === 0 && (
                            <div className="text-xs text-[#94a0ad]">Groupe vide</div>
                          )}
                          {group.blockIds.map((blockId) => {
                            const entry = layerEntryMap.get(blockId);
                            return (
                              <div
                                key={`${group.id}_${blockId}`}
                                className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${
                                  selectedBlockIds.includes(blockId)
                                    ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                    : 'border-[#3a424b] bg-[#171c22] text-[#c7d0d9]'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => selectBlock(blockId)}
                                  className="text-left hover:underline"
                                >
                                  {entry?.label ?? 'Bloc supprimé'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeBlockFromGroup(group.id, blockId)}
                                  className="rounded border border-[#4c5560] px-2 py-0.5 text-[10px] text-[#cbd5df] hover:bg-[#232a33]"
                                >
                                  Retirer
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#d7dde5]">Tous les layers</div>
                  <div className="space-y-1">
                    {layerEntries.length === 0 && (
                      <div className="text-xs text-[#94a0ad]">Aucun bloc pour le moment</div>
                    )}
                    {layerEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey) {
                            toggleBlockInSelection(entry.id);
                            return;
                          }
                          selectBlock(entry.id);
                        }}
                        className={`flex w-full items-center rounded border px-2 py-1.5 text-left text-xs transition ${
                          selectedBlockIds.includes(entry.id)
                            ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                            : 'border-[#3a424b] bg-[#171c22] text-[#d5dde5] hover:bg-[#232a33]'
                        }`}
                        style={{ paddingLeft: `${8 + (entry.depth * 14)}px` }}
                      >
                        <span className="truncate">{entry.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTool === 'templateLibrary' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Library commune</h3>
                  <p className="mt-1 text-xs text-[#a4adb7]">
                    Une seule bibliothèque partagée entre devis, facture et bon de préparation.
                  </p>
                </div>

                <label className="space-y-1 block">
                  <span className="text-xs text-[#aeb6c0]">Template sélectionné pour {activeTemplateLabel.toLowerCase()} (puis Recall)</span>
                  <select
                    value={activeSavedTemplateId ?? ''}
                    onChange={(event) => selectSavedTemplate(event.target.value)}
                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                  >
                    {savedTemplates.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs text-[#aeb6c0]">Nom du template</span>
                  <input
                    value={savedTemplateName}
                    onChange={(event) => setSavedTemplateName(event.target.value)}
                    placeholder="Nom personnalisé"
                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={renameActiveTemplate}
                    className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => createNamedTemplate('blank')}
                    className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                  >
                    Nouveau vide
                  </button>
                  <button
                    type="button"
                    onClick={() => createNamedTemplate('duplicate')}
                    className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                  >
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    onClick={deleteActiveTemplate}
                    disabled={savedTemplates.length <= 1}
                    className="rounded-md border border-[#5a3940] bg-[#2a1d22] px-3 py-2 text-xs text-[#fca5a5] hover:bg-[#362329] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => recallPersistedTemplate(activeSavedTemplateId)}
                    className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                  >
                    Recall du template sélectionné
                  </button>
                  <button
                    type="button"
                    onClick={() => void persistStudio()}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#5f90ff] bg-[#1f2f4a] px-3 py-2 text-xs text-[#8db4ff] hover:bg-[#273a5c]"
                  >
                    <Save className="h-4 w-4" />
                    Sauvegarder
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={downloadLocalTemplateFile}
                    className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                  >
                    Télécharger fichier local
                  </button>
                  <button
                    type="button"
                    onClick={triggerLocalTemplateImport}
                    className="rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                  >
                    Charger fichier local
                  </button>
                  <input
                    ref={localTemplateImportInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => {
                      void handleLocalTemplateImport(event);
                    }}
                    className="hidden"
                  />
                </div>

                <div className="text-[11px] text-[#9aa5b1]">
                  {savedTemplates.length} template{savedTemplates.length > 1 ? 's' : ''} disponibles pour tous les documents.
                </div>
              </div>
            )}

            {activeTool === 'blockStyle' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-white">Propriétés du bloc</h3>
                  <p className="mt-1 text-xs text-[#a4adb7]">
                    Modifiez le bloc sélectionné. Les changements sont appliqués en direct.
                  </p>
                </div>

                {!selectedBlock && (
                  <div className="text-xs text-[#a4adb7]">
                    Sélectionnez un bloc dans la page pour afficher ses propriétés.
                  </div>
                )}

                {selectedBlock && (
                  <>
                    <div className="rounded-md border border-[#343b43] bg-[#232931] px-3 py-2 text-xs text-[#c6ced8]">
                      Type de bloc: {selectedBlock.type === 'subtitle'
                        ? 'Sous-titre'
                        : selectedBlock.type === 'separator'
                          ? 'Séparateur'
                          : selectedBlock.type === 'grid'
                            ? 'Grille'
                            : selectedBlock.type === 'image'
                              ? 'Image'
                              : selectedBlock.type === 'qrcode'
                                ? 'QR code'
                              : selectedBlock.type === 'zone'
                                ? 'Zone'
                                : selectedBlock.type === 'table'
                                  ? 'Tableau'
                                  : 'Titre'}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => duplicateSelectedBlocks([selectedBlock.id])}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#3c4b5f] bg-[#1f2f4a] px-3 py-2 text-xs font-medium text-[#d6e3ff] hover:bg-[#253855]"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Dupliquer
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSelectedBlocks([selectedBlock.id])}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#6b2a2f] bg-[#3a1f24] px-3 py-2 text-xs font-medium text-[#fecaca] hover:bg-[#47262c]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </button>
                    </div>

                    <div className="space-y-3 rounded-md border border-[#343b43] bg-[#232931] p-3">
                      <div className="text-xs font-semibold text-[#d7dde5]">Saut de page</div>
                      <label className="inline-flex items-center gap-2 text-xs text-[#d5dde5]">
                        <input
                          type="checkbox"
                          checked={!!selectedBlock.pageBreakReplicate}
                          onChange={(event) => updateSelectedBlock({ pageBreakReplicate: event.target.checked })}
                          className="h-4 w-4 rounded border border-[#3c444d] bg-[#171c22]" />
                        Répliquer ce bloc à chaque saut de page
                      </label>
                      {!!selectedBlock.pageBreakReplicate && (
                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <span className="text-xs text-[#aeb6c0]">Mode de réplication</span>
                            <select
                              value={selectedBlock.pageBreakMode ?? 'fixed'}
                              onChange={(event) => updateSelectedBlock({ pageBreakMode: event.target.value as PageBreakReplicationMode })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                            >
                              <option value="fixed">Fixe (position identique)</option>
                              <option value="flow">Déplacé (suivre le contenu)</option>
                            </select>
                          </label>
                          {(selectedBlock.pageBreakMode ?? 'fixed') === 'fixed' ? (
                            <label className="space-y-1">
                              <span className="text-xs text-[#aeb6c0]">Ancrage</span>
                              <select
                                value={selectedBlock.pageBreakAnchor ?? 'top'}
                                onChange={(event) => updateSelectedBlock({ pageBreakAnchor: event.target.value as PageBreakAnchor })}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                              >
                                <option value="top">Haut de page</option>
                                <option value="bottom">Bas de page</option>
                              </select>
                            </label>
                          ) : (
                            <label className="space-y-1">
                              <span className="text-xs text-[#aeb6c0]">Écart après contenu (mm)</span>
                              <input
                                type="number"
                                min={0}
                                max={260}
                                value={Math.round(selectedBlock.pageBreakFlowGapMm ?? 0)}
                                onChange={(event) => updateSelectedBlock({ pageBreakFlowGapMm: clampValue(Number(event.target.value) || 0, 0, 260) })}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                            </label>
                          )}
                          {(selectedBlock.pageBreakMode ?? 'fixed') === 'fixed' && (
                            <label className="space-y-1 col-span-2">
                              <span className="text-xs text-[#aeb6c0]">Décalage depuis l’ancrage (mm)</span>
                              <input
                                type="number"
                                min={0}
                                max={260}
                                value={Math.round(selectedBlock.pageBreakOffsetMm ?? 0)}
                                onChange={(event) => updateSelectedBlock({ pageBreakOffsetMm: clampValue(Number(event.target.value) || 0, 0, 260) })}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                            </label>
                          )}
                        </div>
                      )}
                      {!!selectedBlock.pageBreakReplicate && (
                        <div className="text-[11px] text-[#9aa5b1]">
                          Exemple: utilisez `Déplacé` pour un texte qui suit le bas d’un tableau à chaque page; utilisez `Fixe` pour un bloc toujours au même endroit.
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-md border border-[#343b43] bg-[#232931] p-3">
                      <div className="text-xs font-semibold text-[#d7dde5]">Accroche à un autre bloc</div>
                      <label className="inline-flex items-center gap-2 text-xs text-[#d5dde5]">
                        <input
                          type="checkbox"
                          disabled={!selectedBlockIsRoot}
                          checked={!!selectedBlock.followEnabled}
                          onChange={(event) => updateSelectedBlock({ followEnabled: event.target.checked })}
                          className="h-4 w-4 rounded border border-[#3c444d] bg-[#171c22]" />
                        Suivre automatiquement un autre bloc
                      </label>
                      {!selectedBlockIsRoot && (
                        <div className="text-[11px] text-[#9aa5b1]">
                          L’accroche automatique est disponible uniquement pour les blocs racine de la page.
                        </div>
                      )}

                      {!!selectedBlock.followEnabled && selectedBlockIsRoot && (
                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-1 col-span-2">
                            <span className="text-xs text-[#aeb6c0]">Bloc cible</span>
                            <select
                              value={selectedBlock.followTargetId ?? ''}
                              onChange={(event) => updateSelectedBlock({ followTargetId: event.target.value || null })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                            >
                              <option value="">Sélectionner un bloc...</option>
                              {followTargetOptions.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-[#aeb6c0]">Position</span>
                            <select
                              value={selectedBlock.followPosition ?? 'below'}
                              onChange={(event) => updateSelectedBlock({ followPosition: event.target.value as FollowPosition })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                            >
                              <option value="below">Dessous</option>
                              <option value="above">Dessus</option>
                              <option value="left">À gauche</option>
                              <option value="right">À droite</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={AlignLeft} label="Alignement" />
                            <select
                              value={selectedBlock.followAlign ?? 'start'}
                              onChange={(event) => updateSelectedBlock({ followAlign: event.target.value as FollowAlign })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                            >
                              <option value="start">Début</option>
                              <option value="center">Centre</option>
                              <option value="end">Fin</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-[#aeb6c0]">Écart (mm)</span>
                            <input
                              type="number"
                              min={0}
                              max={260}
                              value={Math.round(selectedBlock.followGapMm ?? 4)}
                              onChange={(event) => updateSelectedBlock({ followGapMm: clampValue(Number(event.target.value) || 0, 0, 260) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-[#aeb6c0]">Décalage X (mm)</span>
                            <input
                              type="number"
                              min={-210}
                              max={210}
                              value={Math.round(selectedBlock.followOffsetXMm ?? 0)}
                              onChange={(event) => updateSelectedBlock({ followOffsetXMm: clampValue(Number(event.target.value) || 0, -210, 210) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-[#aeb6c0]">Décalage Y (mm)</span>
                            <input
                              type="number"
                              min={-297}
                              max={297}
                              value={Math.round(selectedBlock.followOffsetYMm ?? 0)}
                              onChange={(event) => updateSelectedBlock({ followOffsetYMm: clampValue(Number(event.target.value) || 0, -297, 297) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                        </div>
                      )}
                      {!!selectedBlock.followEnabled && selectedBlockIsRoot && (
                        <div className="text-[11px] text-[#9aa5b1]">
                          Le bloc passe en mode flottant et se repositionne automatiquement selon le bloc cible.
                        </div>
                      )}
                    </div>

                    {(selectedBlock.type === 'title' || selectedBlock.type === 'subtitle') && (
                      <>
                        <div className="space-y-2">
                          <SettingsFieldLabel icon={AlignLeft} label="Alignement" />
                          <div className={`grid gap-2 ${selectedBlock.type === 'subtitle' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                            {[
                              { value: 'left', label: 'Gauche', icon: AlignLeft },
                              { value: 'center', label: 'Centré', icon: AlignCenter },
                              { value: 'right', label: 'Droite', icon: AlignRight },
                              ...(selectedBlock.type === 'subtitle'
                                ? [{ value: 'justify' as const, label: 'Remplir', icon: AlignJustify }]
                                : []),
                            ].map((option) => {
                              const Icon = option.icon;
                              const isActive = selectedBlock.textAlign === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => updateSelectedBlock({ textAlign: option.value as TemplateBlock['textAlign'] })}
                                  className={`inline-flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-xs transition ${isActive
                                      ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                      : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                                  title={option.label}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span>{option.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3">
                          <div className="text-xs font-semibold text-[#d7dde5]">Position du bloc</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateSelectedBlock({ layoutMode: 'flow' })}
                              className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'flow'
                                  ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                  : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                            >
                              Fixe
                            </button>
                            <button
                              type="button"
                              disabled={!selectedBlockIsRoot}
                              onClick={() => updateSelectedBlock({ layoutMode: 'floating' })}
                              className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'floating'
                                  ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                  : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              Flottant
                            </button>
                          </div>
                          {!selectedBlockIsRoot && (
                            <div className="text-[11px] text-[#9aa5b1]">
                              Le mode flottant est disponible uniquement pour les blocs à la racine de la page.
                            </div>
                          )}
                          {(selectedBlock.layoutMode ?? 'flow') === 'floating' && selectedBlockIsRoot && (
                            <div className="grid grid-cols-2 gap-3">
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={MoveHorizontal} label="X (mm)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, contentWidthMm)}
                                  value={Math.round(typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 10)}
                                  onChange={(event) => {
                                    const width = Math.max(10, typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 120);
                                    const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, contentWidthMm - width));
                                    updateSelectedBlock({ floatX: next, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={MoveVertical} label="Y (mm)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, contentHeightMm)}
                                  value={Math.round(typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10)}
                                  onChange={(event) => {
                                    const height = Math.max(8, typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 20);
                                    const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, contentHeightMm - height));
                                    updateSelectedBlock({ floatY: next, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={Maximize2} label="Largeur (mm)" />
                                <input
                                  type="number"
                                  min={10}
                                  max={Math.max(10, contentWidthMm)}
                                  value={Math.round(typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 120)}
                                  onChange={(event) => {
                                    const nextWidth = clampValue(Number(event.target.value) || 10, 10, Math.max(10, contentWidthMm));
                                    const currentX = typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 10;
                                    const boundedX = clampValue(currentX, 0, Math.max(0, contentWidthMm - nextWidth));
                                    updateSelectedBlock({ floatWidth: nextWidth, floatX: boundedX, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={Maximize2} label="Hauteur (mm)" />
                                <input
                                  type="number"
                                  min={8}
                                  max={Math.max(8, contentHeightMm)}
                                  value={Math.round(typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 20)}
                                  onChange={(event) => {
                                    const nextHeight = clampValue(Number(event.target.value) || 8, 8, Math.max(8, contentHeightMm));
                                    const currentY = typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10;
                                    const boundedY = clampValue(currentY, 0, Math.max(0, contentHeightMm - nextHeight));
                                    updateSelectedBlock({ floatHeight: nextHeight, floatY: boundedY, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                            </div>
                          )}
                        </div>

                        <div className="rounded-md border border-[#343b43] bg-[#232931] p-3 space-y-3">
                          <div className="text-xs font-semibold text-[#d7dde5]">Texte du bloc</div>

                          <div className="grid grid-cols-2 gap-2">
                            <label className="space-y-1">
                              <SettingsFieldLabel icon={TypeIcon} label="Taille" className="text-[11px]" />
                              <select
                                value={activeFontSizeValue}
                                onChange={(event) => applyStyleWithPrefix('fontsize-', event.target.value, DEFAULT_FONT_SIZES)}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-white outline-none focus:border-[#5f90ff]"
                              >
                                {DEFAULT_FONT_SIZES.map((size) => (
                                  <option key={size} value={String(size)}>
                                    {size}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <SettingsFieldLabel icon={TypeIcon} label="Police" className="text-[11px]" />
                              <select
                                value={activeFontFamilyValue}
                                onChange={(event) => applyStyleWithPrefix('fontfamily-', event.target.value, fontFamilyOptions)}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-xs text-white outline-none focus:border-[#5f90ff]"
                              >
                                {fontFamilyOptions.map((font) => (
                                  <option key={font} value={font}>
                                    {font}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="rounded-md border border-[#3c444d] bg-[#171c22] p-2">
                            <Editor
                              editorState={draftEditorState}
                              onEditorStateChange={handleDraftEditorChange}
                              customStyleFn={draftInlineStyleFn}
                              toolbar={{
                                options: [
                                  'inline',
                                  'list',
                                  'textAlign',
                                  'colorPicker',
                                  'link',
                                  'history',
                                ],
                                inline: {
                                  options: ['bold', 'italic', 'underline', 'strikethrough', 'monospace'],
                                },
                                colorPicker: {
                                  colors: [
                                    '#111827',
                                    '#1f2937',
                                    '#2563eb',
                                    '#0f766e',
                                    '#b45309',
                                    '#9d174d',
                                    '#ffffff',
                                    '#fef3c7',
                                    '#dbeafe',
                                    '#dcfce7',
                                  ],
                                },
                              }}
                              toolbarClassName="!border !border-[#3c444d] !bg-[#1f242b] !mb-2"
                              wrapperClassName="template-studio-draft-wrapper"
                              editorClassName="min-h-[180px] px-3 py-2 bg-[#171c22] text-white border border-[#3c444d]"
                              editorStyle={{ minHeight: 180 }}
                              spellCheck />
                          </div>

                          <label className="space-y-1 block">
                            <SettingsFieldLabel icon={Palette} label="Couleur par défaut du bloc" />
                            <div className="flex items-center gap-2">
                              <ColorPickerButton
                                size="sm"
                                value={typeof selectedBlock.textColor === 'string' ? selectedBlock.textColor : '#111827'}
                                onChange={(value) => updateSelectedBlock({ textColor: value })}
                                ariaLabel="Couleur par défaut du bloc texte"
                              />
                            </div>
                          </label>

                          <div className="space-y-2">
                            <div className="text-xs text-[#aeb6c0]">Variables prédéfinies</div>
                            <input
                              value={variableSearch}
                              onChange={(event) => setVariableSearch(event.target.value)}
                              placeholder="Rechercher une variable..."
                              className="w-full rounded-md border border-[#3c444d] bg-[#11161c] px-3 py-2 text-xs text-white outline-none focus:border-[#5f90ff]" />
                            <div className="max-h-[260px] space-y-3 overflow-y-auto rounded-md border border-[#343b43] bg-[#1b2027] p-2">
                              {filteredVariableGroups.length === 0 && (
                                <div className="text-xs text-[#90a0b2]">Aucune variable trouvée.</div>
                              )}
                              {filteredVariableGroups.map((group) => (
                                <div key={group.id} className="space-y-1.5">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8fa2b8]">
                                    {group.label}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {group.variables.map((variable) => (
                                      <button
                                        key={variable.key}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => insertVariableTokenInDraft(variable.key)}
                                        className="rounded-md border border-[#3c444d] bg-[#11161c] px-2 py-1 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                                        title={`${variable.key} · ${variable.placeholder}`}
                                      >
                                        {variable.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {(selectedBlock.type === 'image' || selectedBlock.type === 'qrcode') && (
                      <div className="space-y-3 rounded-md border border-[#343b43] bg-[#232931] p-3">
                        <div className="text-xs font-semibold text-[#d7dde5]">
                          {selectedBlock.type === 'qrcode' ? 'Bloc QR code' : 'Bloc image'}
                        </div>

                        <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                          <div className="text-xs font-semibold text-[#d7dde5]">Position du bloc</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateSelectedBlock({ layoutMode: 'flow' })}
                              className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'flow'
                                  ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                  : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                            >
                              Fixe
                            </button>
                            <button
                              type="button"
                              disabled={!selectedBlockIsRoot}
                              onClick={() => updateSelectedBlock({ layoutMode: 'floating' })}
                              className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'floating'
                                  ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                  : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              Flottant
                            </button>
                          </div>
                          {!selectedBlockIsRoot && (
                            <div className="text-[11px] text-[#9aa5b1]">
                              Le mode flottant est disponible uniquement pour les blocs à la racine de la page.
                            </div>
                          )}
                          {(selectedBlock.layoutMode ?? 'flow') === 'floating' && selectedBlockIsRoot && (
                            <div className="grid grid-cols-2 gap-3">
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={MoveHorizontal} label="X (mm)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, contentWidthMm)}
                                  value={Math.round(typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 10)}
                                  onChange={(event) => {
                                    const width = Math.max(10, typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 120);
                                    const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, contentWidthMm - width));
                                    updateSelectedBlock({ floatX: next, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={MoveVertical} label="Y (mm)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, contentHeightMm)}
                                  value={Math.round(typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10)}
                                  onChange={(event) => {
                                    const height = Math.max(8, typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 60);
                                    const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, contentHeightMm - height));
                                    updateSelectedBlock({ floatY: next, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={Maximize2} label="Largeur (mm)" />
                                <input
                                  type="number"
                                  min={10}
                                  max={Math.max(10, contentWidthMm)}
                                  value={Math.round(typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 120)}
                                  onChange={(event) => {
                                    const nextWidth = clampValue(Number(event.target.value) || 10, 10, Math.max(10, contentWidthMm));
                                    const currentX = typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 10;
                                    const boundedX = clampValue(currentX, 0, Math.max(0, contentWidthMm - nextWidth));
                                    updateSelectedBlock({ floatWidth: nextWidth, floatX: boundedX, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={Maximize2} label="Hauteur (mm)" />
                                <input
                                  type="number"
                                  min={8}
                                  max={Math.max(8, contentHeightMm)}
                                  value={Math.round(typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 60)}
                                  onChange={(event) => {
                                    const nextHeight = clampValue(Number(event.target.value) || 8, 8, Math.max(8, contentHeightMm));
                                    const currentY = typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10;
                                    const boundedY = clampValue(currentY, 0, Math.max(0, contentHeightMm - nextHeight));
                                    updateSelectedBlock({ floatHeight: nextHeight, floatY: boundedY, layoutMode: 'floating' });
                                  } }
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                            </div>
                          )}
                        </div>

                        {selectedBlock.type === 'image' && (
                          <>
                            <label className="space-y-1 block">
                              <span className="text-xs text-[#aeb6c0]">URL de l’image</span>
                              <input
                                value={selectedBlock.imageUrl ?? ''}
                                onChange={(event) => updateSelectedBlock({ imageUrl: event.target.value })}
                                placeholder="https://..."
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                            </label>

                            <label className="space-y-1 block">
                              <span className="text-xs text-[#aeb6c0]">Importer une image</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleSelectedImageUpload}
                                className="block w-full text-xs text-[#cdd6df] file:mr-3 file:rounded-md file:border file:border-[#3c444d] file:bg-[#171c22] file:px-3 file:py-2 file:text-xs file:text-[#d7dde5]" />
                            </label>
                          </>
                        )}

                        {selectedBlock.type === 'qrcode' && (
                          <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 text-xs text-[#cbd5e1]">
                            Valeur générée automatiquement au PDF: <span className="font-semibold">project:ID projet</span> (<code>project:{'{{rental_id}}'}</code>).
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={ImageIcon} label="Mode d’image" />
                            <select
                              value={selectedBlock.imageFit ?? 'cover'}
                              onChange={(event) => updateSelectedBlock({ imageFit: event.target.value as ImageFit })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                              <option value="fill">Fill</option>
                              <option value="none">None</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={AlignLeft} label="Alignement" />
                            <select
                              value={selectedBlock.imageAlign ?? 'center'}
                              onChange={(event) => updateSelectedBlock({ imageAlign: event.target.value as ImageAlign })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                            >
                              <option value="left">Gauche</option>
                              <option value="center">Centré</option>
                              <option value="right">Droite</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={Maximize2} label="Largeur (%)" />
                            <input
                              type="number"
                              min={10}
                              max={100}
                              value={Math.round(selectedBlock.imageWidthPercent ?? 100)}
                              onChange={(event) => updateSelectedBlock({ imageWidthPercent: clampValue(Number(event.target.value) || 10, 10, 100) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={Maximize2} label="Hauteur (mm)" />
                            <input
                              type="number"
                              min={8}
                              max={260}
                              value={Math.round(selectedBlock.imageHeightMm ?? 40)}
                              onChange={(event) => updateSelectedBlock({ imageHeightMm: clampValue(Number(event.target.value) || 8, 8, 260) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                          <label className="space-y-1 block">
                            <div className="flex items-center justify-between">
                              <SettingsFieldLabel icon={Blend} label="Opacité" />
                              <span className="text-xs text-[#d7dde5]">{Math.round(selectedBlock.imageOpacity ?? 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round(selectedBlock.imageOpacity ?? 100)}
                              onChange={(event) => updateSelectedBlock({ imageOpacity: clampValue(Number(event.target.value) || 0, 0, 100) })}
                              className="w-full accent-[#5f90ff]" />
                          </label>
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={SlidersHorizontal} label="Rotation (deg)" />
                            <input
                              type="number"
                              min={-180}
                              max={180}
                              value={Math.round(selectedBlock.imageRotation ?? 0)}
                              onChange={(event) => updateSelectedBlock({ imageRotation: clampValue(Number(event.target.value) || 0, -180, 180) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={CornerDownRight} label="Arrondi (px)" />
                            <input
                              type="number"
                              min={0}
                              max={999}
                              value={Math.round(selectedBlock.imageBorderRadius ?? 0)}
                              onChange={(event) => updateSelectedBlock({ imageBorderRadius: clampValue(Number(event.target.value) || 0, 0, 999) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                          <label className="space-y-1">
                            <SettingsFieldLabel icon={PenLine} label="Épaisseur bordure (px)" />
                            <input
                              type="number"
                              min={0}
                              max={24}
                              value={Math.round(selectedBlock.imageBorderWidth ?? 0)}
                              onChange={(event) => updateSelectedBlock({ imageBorderWidth: clampValue(Number(event.target.value) || 0, 0, 24) })}
                              className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-1 block">
                            <SettingsFieldLabel icon={Palette} label="Couleur bordure" />
                            <div className="flex items-center gap-2">
                              <ColorPickerButton
                                size="sm"
                                value={selectedBlock.imageBorderColor ?? '#94a3b8'}
                                onChange={(value) => updateSelectedBlock({ imageBorderColor: value })}
                                ariaLabel="Couleur bordure image"
                              />
                            </div>
                          </label>
                          <label className="space-y-1 block">
                            <SettingsFieldLabel icon={Palette} label="Fond conteneur" />
                            <div className="flex items-center gap-2">
                              <ColorPickerButton
                                size="sm"
                                value={selectedBlock.imageBackgroundColor && selectedBlock.imageBackgroundColor !== 'transparent'
                                  ? selectedBlock.imageBackgroundColor
                                  : '#ffffff'}
                                onChange={(value) => updateSelectedBlock({ imageBackgroundColor: value })}
                                ariaLabel="Couleur fond conteneur image"
                              />
                            </div>
                          </label>
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs text-[#d5dde5]">
                          <input
                            type="checkbox"
                            checked={!!selectedBlock.imageShadow}
                            onChange={(event) => updateSelectedBlock({ imageShadow: event.target.checked })}
                            className="h-4 w-4 rounded border border-[#3c444d] bg-[#171c22]" />
                          Ombre portée
                        </label>
                      </div>
                    )}

                    {selectedBlock.type === 'table' && (
                      <div className="space-y-3 rounded-xl border border-[#3a4250] bg-[#232931] p-3">
                        <div className="rounded-lg border border-[#343b43] bg-[#1f252d] p-2">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-semibold text-[#d7dde5]">Paramètres du tableau</div>
                            <div className="text-[11px] text-[#93a2b5]">Réorganisés par onglets</div>
                          </div>
                          <div className="grid grid-cols-5 gap-1">
                            {[
                              { id: 'text' as const, label: 'Texte', icon: TypeIcon },
                              { id: 'layout' as const, label: 'Position', icon: MoveHorizontal },
                              { id: 'data' as const, label: 'Données', icon: Rows2 },
                              { id: 'style' as const, label: 'Style', icon: SlidersHorizontal },
                              { id: 'colors' as const, label: 'Couleurs', icon: Palette },
                            ].map((tab) => {
                              const Icon = tab.icon;
                              const isActive = tableSettingsTab === tab.id;
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setTableSettingsTab(tab.id)}
                                  className={`inline-flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-[11px] transition ${
                                    isActive
                                      ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                      : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span>{tab.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {tableSettingsTab === 'text' && (
                          <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                            <div className="text-xs font-semibold text-[#d7dde5]">Texte sélectionné dans l’aperçu</div>
                            <div className="text-[11px] text-[#9aa5b1]">
                              Cliquez un texte du tableau (titre de colonne, catégorie, cellule matériel/service), puis ajustez son alignement ici.
                            </div>
                            <div className="rounded-md border border-[#364353] bg-[#171c22] px-3 py-2 text-xs text-[#d5dde5]">
                              {selectedTableTextLabel ?? 'Aucune sélection active'}
                            </div>
                            <label className="space-y-1">
                              <SettingsFieldLabel icon={AlignLeft} label="Alignement du texte sélectionné" />
                              <select
                                value={selectedTableTextAlignValue ?? 'auto'}
                                disabled={!selectedTableText || selectedTableText.blockId !== selectedBlock.id || selectedTableTextAlignValue === null}
                                onChange={(event) => updateSelectedTableTextAlign(event.target.value as TableTextAlign)}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff] disabled:opacity-50"
                              >
                                {selectedTableText?.kind !== 'category' && (
                                  <option value="auto">Auto (hérite de la colonne)</option>
                                )}
                                <option value="left">Gauche</option>
                                <option value="center">Centre</option>
                                <option value="right">Droite</option>
                              </select>
                            </label>
                          </div>
                        )}

                        {tableSettingsTab === 'layout' && (
                          <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                            <div className="text-xs font-semibold text-[#d7dde5]">Position du bloc</div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => updateSelectedBlock({ layoutMode: 'flow' })}
                                className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'flow'
                                    ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                    : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                              >
                                Fixe
                              </button>
                              <button
                                type="button"
                                disabled={!selectedBlockIsRoot}
                                onClick={() => updateSelectedBlock({ layoutMode: 'floating' })}
                                className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'floating'
                                    ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                    : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'} disabled:cursor-not-allowed disabled:opacity-50`}
                              >
                                Flottant
                              </button>
                            </div>
                            {!selectedBlockIsRoot && (
                              <div className="text-[11px] text-[#9aa5b1]">
                                Le mode flottant est disponible uniquement pour les blocs à la racine de la page.
                              </div>
                            )}
                            {(selectedBlock.layoutMode ?? 'flow') === 'floating' && selectedBlockIsRoot && (
                              <div className="grid grid-cols-2 gap-3">
                                <label className="space-y-1">
                                  <SettingsFieldLabel icon={MoveHorizontal} label="X (mm)" />
                                  <input
                                    type="number"
                                    min={0}
                                    max={Math.max(0, contentWidthMm)}
                                    value={Math.round(typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 10)}
                                    onChange={(event) => {
                                      const width = Math.max(20, typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 180);
                                      const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, contentWidthMm - width));
                                      updateSelectedBlock({ floatX: next, layoutMode: 'floating' });
                                    }}
                                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                </label>
                                <label className="space-y-1">
                                  <SettingsFieldLabel icon={MoveVertical} label="Y (mm)" />
                                  <input
                                    type="number"
                                    min={0}
                                    max={Math.max(0, contentHeightMm)}
                                    value={Math.round(typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10)}
                                    onChange={(event) => {
                                      const height = Math.max(20, typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 85);
                                      const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, contentHeightMm - height));
                                      updateSelectedBlock({ floatY: next, layoutMode: 'floating' });
                                    }}
                                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                </label>
                                <label className="space-y-1">
                                  <SettingsFieldLabel icon={Maximize2} label="Largeur (mm)" />
                                  <input
                                    type="number"
                                    min={20}
                                    max={Math.max(20, contentWidthMm)}
                                    value={Math.round(typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 180)}
                                    onChange={(event) => {
                                      const nextWidth = clampValue(Number(event.target.value) || 20, 20, Math.max(20, contentWidthMm));
                                      const currentX = typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 10;
                                      const boundedX = clampValue(currentX, 0, Math.max(0, contentWidthMm - nextWidth));
                                      updateSelectedBlock({ floatWidth: nextWidth, floatX: boundedX, layoutMode: 'floating' });
                                    }}
                                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                </label>
                                <label className="space-y-1">
                                  <SettingsFieldLabel icon={Maximize2} label="Hauteur (mm)" />
                                  <input
                                    type="number"
                                    min={20}
                                    max={Math.max(20, contentHeightMm)}
                                    value={Math.round(typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 85)}
                                    onChange={(event) => {
                                      const nextHeight = clampValue(Number(event.target.value) || 20, 20, Math.max(20, contentHeightMm));
                                      const currentY = typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10;
                                      const boundedY = clampValue(currentY, 0, Math.max(0, contentHeightMm - nextHeight));
                                      updateSelectedBlock({ floatHeight: nextHeight, floatY: boundedY, layoutMode: 'floating' });
                                    }}
                                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                </label>
                              </div>
                            )}
                          </div>
                        )}

                        {tableSettingsTab === 'data' && (
                          <>
                            <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                              <div className="text-xs font-semibold text-[#d7dde5]">Source et contenu</div>
                              <label className="space-y-1 block">
                                <SettingsFieldLabel icon={Table2} label="Source des lignes" />
                                <select
                                  value={selectedBlock.tableDataSource ?? 'equipment_by_category'}
                                  onChange={(event) => updateSelectedBlock({ tableDataSource: event.target.value as TableDataSource })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                                >
                                  <option value="equipment_by_category">Équipements par catégorie</option>
                                </select>
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs text-[#d5dde5]">
                                <input
                                  type="checkbox"
                                  checked={selectedBlock.tableShowCategories ?? true}
                                  onChange={(event) => updateSelectedBlock({ tableShowCategories: event.target.checked })}
                                  className="h-4 w-4 rounded border border-[#3c444d] bg-[#11161c]" />
                                Afficher les catégories
                              </label>
                            </div>

                            <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                              <div className="text-xs font-semibold text-[#d7dde5]">Simulation multi-page (aperçu)</div>
                              <div className="text-[11px] text-[#9aa5b1]">
                                Ajoute des lignes matériel/service fictives pour vérifier les sauts de page dans le studio.
                                Cette simulation n'est jamais utilisée dans l'export PDF.
                              </div>
                              <label className="inline-flex items-center gap-2 text-xs text-[#d5dde5]">
                                <input
                                  type="checkbox"
                                  checked={selectedTableSimulationSettings?.enabled ?? false}
                                  onChange={(event) => updateSelectedTableSimulationSettings({ enabled: event.target.checked })}
                                  className="h-4 w-4 rounded border border-[#3c444d] bg-[#11161c]" />
                                Activer la simulation multi-page
                              </label>
                              <label className="space-y-1 block">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-[#aeb6c0]">Nombre total de lignes simulées</span>
                                  <span className="text-xs text-[#d7dde5]">
                                    {Math.round(selectedTableSimulationSettings?.targetRows ?? TABLE_SIMULATION_DEFAULT_ROWS)}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={TABLE_SIMULATION_MIN_ROWS}
                                  max={TABLE_SIMULATION_MAX_ROWS}
                                  step={1}
                                  disabled={!(selectedTableSimulationSettings?.enabled ?? false)}
                                  value={Math.round(selectedTableSimulationSettings?.targetRows ?? TABLE_SIMULATION_DEFAULT_ROWS)}
                                  onChange={(event) => updateSelectedTableSimulationSettings({ targetRows: Number(event.target.value) })}
                                  className="w-full accent-[#5f90ff] disabled:opacity-40" />
                              </label>
                            </div>

                            <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                              <div className="text-xs font-semibold text-[#d7dde5]">Colonnes (drag & drop)</div>
                              <div className="space-y-2">
                                {selectedTableColumnsForPanel.map((columnKey) => {
                                  const columnLabel = getTableColumnLabel(columnKey);
                                  const isDragging = draggingTableColumnKey === columnKey;
                                  const isDropTarget = tableColumnDropTarget?.key === columnKey;
                                  return (
                                    <div
                                      key={columnKey}
                                      draggable
                                      onDragStart={(event) => handleTableColumnDragStart(event, columnKey)}
                                      onDragOver={(event) => handleTableColumnDragOver(event, columnKey)}
                                      onDrop={(event) => handleTableColumnDrop(event, columnKey)}
                                      onDragEnd={handleTableColumnDragEnd}
                                      className={`relative flex items-center justify-between rounded border px-2 py-2 text-xs ${isDragging
                                          ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#cfe0ff]'
                                          : 'border-[#3c444d] bg-[#171c22] text-[#d5dde5]'}`}
                                    >
                                      {isDropTarget && (
                                        <div
                                          className="pointer-events-none absolute left-1 right-1 h-[3px] rounded bg-[#5f90ff]"
                                          style={tableColumnDropTarget?.position === 'before' ? { top: -2 } : { bottom: -2 }} />
                                      )}
                                      <div className="flex items-center gap-2">
                                        <GripVertical className="h-4 w-4 text-[#7c8794]" />
                                        <span>{columnLabel}</span>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={selectedTableColumnsForPanel.length <= 1}
                                        onClick={() => removeTableColumnFromSelectedBlock(columnKey)}
                                        className="rounded border border-transparent px-2 py-1 text-[11px] text-[#9aa5b1] hover:border-[#3c444d] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Retirer
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                              {hiddenTableColumnsForPanel.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={tableColumnToAdd}
                                    onChange={(event) => setTableColumnToAdd(event.target.value as TableColumnKey)}
                                    className="flex-1 rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                                  >
                                    {hiddenTableColumnsForPanel.map((columnKey) => (
                                      <option key={columnKey} value={columnKey}>
                                        {getTableColumnLabel(columnKey)}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={!tableColumnToAdd}
                                    onClick={() => {
                                      if (tableColumnToAdd && isTableColumnKey(tableColumnToAdd)) {
                                        addTableColumnToSelectedBlock(tableColumnToAdd);
                                      }
                                    }}
                                    className="h-9 rounded-md border border-[#3c444d] bg-[#171c22] px-3 text-xs text-[#d5dde5] hover:bg-[#232a33] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Ajouter
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {tableSettingsTab === 'style' && (
                          <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                            <div className="text-xs font-semibold text-[#d7dde5]">Style du tableau</div>
                            <div className="grid grid-cols-2 gap-3">
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={SlidersHorizontal} label="Padding horizontal (px)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={64}
                                  value={Math.round(selectedBlock.tableCellPaddingX ?? 14)}
                                  onChange={(event) => updateSelectedBlock({ tableCellPaddingX: clampValue(Number(event.target.value) || 0, 0, 64) })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={SlidersHorizontal} label="Padding vertical (px)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={64}
                                  value={Math.round(selectedBlock.tableCellPaddingY ?? 10)}
                                  onChange={(event) => updateSelectedBlock({ tableCellPaddingY: clampValue(Number(event.target.value) || 0, 0, 64) })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={Rows2} label="Espacement lignes (px)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={48}
                                  value={Math.round(selectedBlock.tableRowGapPx ?? 0)}
                                  onChange={(event) => updateSelectedBlock({ tableRowGapPx: clampValue(Number(event.target.value) || 0, 0, 48) })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={CornerDownRight} label="Arrondi (px)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  value={Math.round(selectedBlock.tableBorderRadius ?? 12)}
                                  onChange={(event) => updateSelectedBlock({ tableBorderRadius: clampValue(Number(event.target.value) || 0, 0, 999) })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={PenLine} label="Bordure (px)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={12}
                                  value={Math.round(selectedBlock.tableBorderWidth ?? 1)}
                                  onChange={(event) => updateSelectedBlock({ tableBorderWidth: clampValue(Number(event.target.value) || 0, 0, 12) })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={TypeIcon} label="Taille texte (pt)" />
                                <input
                                  type="number"
                                  min={7}
                                  max={36}
                                  value={Math.round(selectedBlock.tableFontSizePt ?? 12)}
                                  onChange={(event) => updateSelectedBlock({ tableFontSizePt: clampValue(Number(event.target.value) || 7, 7, 36) })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={TypeIcon} label="Taille entête (pt)" />
                                <input
                                  type="number"
                                  min={7}
                                  max={42}
                                  value={Math.round(selectedBlock.tableHeaderFontSizePt ?? 13)}
                                  onChange={(event) => updateSelectedBlock({ tableHeaderFontSizePt: clampValue(Number(event.target.value) || 7, 7, 42) })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs text-[#d5dde5]">
                                <input
                                  type="checkbox"
                                  checked={selectedBlock.tableHeaderBold ?? true}
                                  onChange={(event) => updateSelectedBlock({ tableHeaderBold: event.target.checked })}
                                  className="h-4 w-4 rounded border border-[#3c444d] bg-[#11161c]" />
                                Entête en gras
                              </label>
                            </div>
                          </div>
                        )}

                        {tableSettingsTab === 'colors' && (
                          <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                            <div className="text-xs font-semibold text-[#d7dde5]">Couleurs du tableau</div>
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { key: 'tableHeaderBackground', label: 'Fond entête', fallback: '#0f172a' },
                                { key: 'tableHeaderTextColor', label: 'Texte entête', fallback: '#f8fafc' },
                                { key: 'tableBodyBackground', label: 'Fond lignes', fallback: '#f8fafc' },
                                { key: 'tableCategoryBackground', label: 'Fond catégorie', fallback: '#e2e8f0' },
                                { key: 'tableCategoryTextColor', label: 'Texte catégorie', fallback: '#0f172a' },
                                { key: 'tableBorderColor', label: 'Couleur bordures', fallback: '#cbd5e1' },
                              ].map((entry) => (
                                <label key={entry.key} className="space-y-1 block">
                                  <SettingsFieldLabel icon={Palette} label={entry.label} />
                                  <div className="flex items-center gap-2">
                                    <ColorPickerButton
                                      size="sm"
                                      value={typeof selectedBlock[entry.key as keyof TemplateBlock] === 'string'
                                        ? String(selectedBlock[entry.key as keyof TemplateBlock])
                                        : entry.fallback}
                                      onChange={(value) => updateSelectedBlock({ [entry.key]: value } as Partial<TemplateBlock>)}
                                      ariaLabel={entry.label}
                                    />
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                        {selectedBlock.type === 'zone' && (
                          <div className="space-y-3 rounded-md border border-[#343b43] bg-[#232931] p-3">
                            <div className="text-xs font-semibold text-[#d7dde5]">Zone 1x1</div>
                            <div className="grid grid-cols-3 gap-2 rounded-md border border-[#343b43] bg-[#1b2128] p-1">
                              {[
                                { id: 'layout' as const, label: 'Position' },
                                { id: 'dimensions' as const, label: 'Dimensions' },
                                { id: 'style' as const, label: 'Style' },
                              ].map((tab) => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setZoneSettingsTab(tab.id)}
                                  className={`h-8 rounded-md text-xs transition ${
                                    zoneSettingsTab === tab.id
                                      ? 'bg-[#2b3a52] text-[#8db4ff]'
                                      : 'text-[#c7d0d9] hover:bg-[#2a313a]'
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>

                            {zoneSettingsTab === 'layout' && (
                              <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                                <div className="text-xs font-semibold text-[#d7dde5]">Position de la zone</div>
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateSelectedBlock({ layoutMode: 'flow' })}
                                    className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'flow'
                                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                        : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                                  >
                                    Fixe
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!selectedBlockIsRoot}
                                    onClick={() => updateSelectedBlock({ layoutMode: 'floating' })}
                                    className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'floating'
                                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                        : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'} disabled:cursor-not-allowed disabled:opacity-50`}
                                  >
                                    Flottant
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!selectedBlockIsRoot}
                                    onClick={() => updateSelectedBlock({ layoutMode: 'semi-fixed' })}
                                    className={`h-9 rounded-md border text-xs ${(selectedBlock.layoutMode ?? 'flow') === 'semi-fixed'
                                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                        : 'border-[#3c444d] bg-[#171c22] text-[#c7d0d9] hover:bg-[#232a33]'} disabled:cursor-not-allowed disabled:opacity-50`}
                                  >
                                    Semi-fixe
                                  </button>
                                </div>
                                {!selectedBlockIsRoot && (
                                  <div className="text-[11px] text-[#9aa5b1]">
                                    Les modes flottant et semi-fixe sont disponibles uniquement pour les blocs à la racine de la page.
                                  </div>
                                )}
                                {((selectedBlock.layoutMode ?? 'flow') === 'floating' || (selectedBlock.layoutMode ?? 'flow') === 'semi-fixed') && selectedBlockIsRoot && (
                                  <div className="grid grid-cols-2 gap-3">
                                    <label className="space-y-1">
                                      <SettingsFieldLabel icon={MoveHorizontal} label="X (mm)" />
                                      <input
                                        type="number"
                                        min={0}
                                        max={Math.max(0, contentWidthMm)}
                                        value={Math.round(typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 0)}
                                        onChange={(event) => {
                                          const mode = (selectedBlock.layoutMode ?? 'flow') === 'semi-fixed' ? 'semi-fixed' : 'floating';
                                          const maxWidth = mode === 'semi-fixed'
                                            ? Math.max(10, contentWidthMm - Math.max(0, selectedBlock.marginLeft) - Math.max(0, selectedBlock.marginRight))
                                            : contentWidthMm;
                                          const width = clampValue(
                                            typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 160,
                                            10,
                                            maxWidth
                                          );
                                          const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, maxWidth - width));
                                          updateSelectedBlock({ floatX: next, layoutMode: mode });
                                        } }
                                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                    </label>
                                    {(selectedBlock.layoutMode ?? 'flow') === 'floating' && (
                                      <label className="space-y-1">
                                        <SettingsFieldLabel icon={MoveVertical} label="Y (mm)" />
                                        <input
                                          type="number"
                                          min={0}
                                          max={Math.max(0, contentHeightMm)}
                                          value={Math.round(typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10)}
                                          onChange={(event) => {
                                            const height = Math.max(8, typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 80);
                                            const next = clampValue(Number(event.target.value) || 0, 0, Math.max(0, contentHeightMm - height));
                                            updateSelectedBlock({ floatY: next, layoutMode: 'floating' });
                                          } }
                                          className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                      </label>
                                    )}
                                    <label className="space-y-1">
                                      <SettingsFieldLabel icon={Maximize2} label="Largeur (mm)" />
                                      <input
                                        type="number"
                                        min={10}
                                        max={Math.max(10, contentWidthMm - Math.max(0, selectedBlock.marginLeft) - Math.max(0, selectedBlock.marginRight))}
                                        value={Math.round(clampValue(
                                          typeof selectedBlock.floatWidth === 'number' ? selectedBlock.floatWidth : 160,
                                          10,
                                          Math.max(10, contentWidthMm - Math.max(0, selectedBlock.marginLeft) - Math.max(0, selectedBlock.marginRight))
                                        ))}
                                        onChange={(event) => {
                                          const maxWidth = Math.max(10, contentWidthMm - Math.max(0, selectedBlock.marginLeft) - Math.max(0, selectedBlock.marginRight));
                                          const nextWidth = clampValue(Number(event.target.value) || 10, 10, maxWidth);
                                          const mode = (selectedBlock.layoutMode ?? 'flow') === 'semi-fixed' ? 'semi-fixed' : 'floating';
                                          if (mode === 'semi-fixed') {
                                            const currentX = typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 0;
                                            const boundedX = clampValue(currentX, 0, Math.max(0, maxWidth - nextWidth));
                                            updateSelectedBlock({ floatWidth: nextWidth, floatX: boundedX, layoutMode: 'semi-fixed' });
                                            return;
                                          }
                                          const currentX = typeof selectedBlock.floatX === 'number' ? selectedBlock.floatX : 10;
                                          const boundedX = clampValue(currentX, 0, Math.max(0, contentWidthMm - nextWidth));
                                          updateSelectedBlock({ floatWidth: nextWidth, floatX: boundedX, layoutMode: 'floating' });
                                        } }
                                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                    </label>
                                    <label className="space-y-1">
                                      <SettingsFieldLabel icon={Maximize2} label="Hauteur (mm)" />
                                      <input
                                        type="number"
                                        min={8}
                                        max={Math.max(8, contentHeightMm)}
                                        value={Math.round(typeof selectedBlock.floatHeight === 'number' ? selectedBlock.floatHeight : 80)}
                                        onChange={(event) => {
                                          const nextHeight = clampValue(Number(event.target.value) || 8, 8, Math.max(8, contentHeightMm));
                                          const mode = (selectedBlock.layoutMode ?? 'flow') === 'semi-fixed' ? 'semi-fixed' : 'floating';
                                          if (mode === 'semi-fixed') {
                                            updateSelectedBlock({ floatHeight: nextHeight, layoutMode: 'semi-fixed' });
                                            return;
                                          }
                                          const currentY = typeof selectedBlock.floatY === 'number' ? selectedBlock.floatY : 10;
                                          const boundedY = clampValue(currentY, 0, Math.max(0, contentHeightMm - nextHeight));
                                          updateSelectedBlock({ floatHeight: nextHeight, floatY: boundedY, layoutMode: 'floating' });
                                        } }
                                        className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                    </label>
                                  </div>
                                )}
                              </div>
                            )}

                            {zoneSettingsTab === 'dimensions' && (
                              <div className="grid grid-cols-2 gap-3">
                                <label className="space-y-1">
                                  <SettingsFieldLabel icon={Maximize2} label="Hauteur min (mm)" />
                                  <input
                                    type="number"
                                    min={10}
                                    max={260}
                                    value={Math.round(selectedBlock.zoneMinHeightMm ?? 45)}
                                    onChange={(event) => updateSelectedBlock({ zoneMinHeightMm: clampValue(Number(event.target.value) || 10, 10, 260) })}
                                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                </label>
                                <label className="space-y-1">
                                  <SettingsFieldLabel icon={SlidersHorizontal} label="Padding X (mm)" />
                                  <input
                                    type="number"
                                    min={0}
                                    max={30}
                                    value={Math.round(selectedBlock.zonePaddingXMm ?? selectedBlock.zonePaddingMm ?? 3)}
                                    onChange={(event) => updateSelectedBlock({
                                      zonePaddingXMm: clampValue(Number(event.target.value) || 0, 0, 30),
                                    })}
                                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                </label>
                                <label className="space-y-1">
                                  <SettingsFieldLabel icon={SlidersHorizontal} label="Padding Y (mm)" />
                                  <input
                                    type="number"
                                    min={0}
                                    max={30}
                                    value={Math.round(selectedBlock.zonePaddingYMm ?? selectedBlock.zonePaddingMm ?? 3)}
                                    onChange={(event) => updateSelectedBlock({
                                      zonePaddingYMm: clampValue(Number(event.target.value) || 0, 0, 30),
                                    })}
                                    className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                </label>
                              </div>
                            )}

                            {zoneSettingsTab === 'style' && (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={PenLine} label="Bordure (px)" />
                                    <input
                                      type="number"
                                      min={0}
                                      max={12}
                                      value={Math.round(selectedBlock.zoneBorderWidth ?? 0)}
                                      onChange={(event) => updateSelectedBlock({ zoneBorderWidth: clampValue(Number(event.target.value) || 0, 0, 12) })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={CornerDownRight} label="Arrondi (px)" />
                                    <input
                                      type="number"
                                      min={0}
                                      max={999}
                                      value={Math.round(selectedBlock.zoneBorderRadius ?? 6)}
                                      onChange={(event) => updateSelectedBlock({ zoneBorderRadius: clampValue(Number(event.target.value) || 0, 0, 999) })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={PenLine} label="Style bordure" />
                                    <select
                                      value={selectedBlock.zoneBorderStyle ?? 'solid'}
                                      onChange={(event) => updateSelectedBlock({ zoneBorderStyle: event.target.value as SimpleBorderStyle })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                                    >
                                      <option value="solid">Pleine</option>
                                      <option value="dashed">Tirets</option>
                                      <option value="dotted">Pointillée</option>
                                    </select>
                                  </label>
                                  <label className="inline-flex items-center gap-2 self-end text-xs text-[#d5dde5]">
                                    <input
                                      type="checkbox"
                                      checked={!!selectedBlock.zoneShadow}
                                      onChange={(event) => updateSelectedBlock({ zoneShadow: event.target.checked })}
                                      className="h-4 w-4 rounded border border-[#3c444d] bg-[#171c22]" />
                                    Ombre portée
                                  </label>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <label className="space-y-1 block">
                                    <SettingsFieldLabel icon={Palette} label="Fond de la zone" />
                                    <div className="flex items-center gap-2">
                                      <ColorPickerButton
                                        size="sm"
                                        value={selectedBlock.zoneBackgroundColor ?? '#ffffff'}
                                        onChange={(value) => updateSelectedBlock({ zoneBackgroundColor: value })}
                                        ariaLabel="Couleur fond de zone"
                                      />
                                    </div>
                                  </label>
                                  <label className="space-y-1 block">
                                    <SettingsFieldLabel icon={Palette} label="Couleur bordure" />
                                    <div className="flex items-center gap-2">
                                      <ColorPickerButton
                                        size="sm"
                                        value={selectedBlock.zoneBorderColor ?? '#94a3b8'}
                                        onChange={(value) => updateSelectedBlock({ zoneBorderColor: value })}
                                        ariaLabel="Couleur bordure de zone"
                                      />
                                    </div>
                                  </label>
                                </div>

                                <div className="space-y-3 rounded-md border border-[#343b43] bg-[#1f252d] p-3">
                                  <label className="space-y-1 block">
                                    <div className="flex items-center justify-between">
                                      <SettingsFieldLabel icon={Blend} label="Opacité fond" />
                                      <span className="text-xs text-[#d7dde5]">{Math.round(selectedBlock.zoneBackgroundOpacity ?? selectedBlock.zoneOpacity ?? 100)}%</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={Math.round(selectedBlock.zoneBackgroundOpacity ?? selectedBlock.zoneOpacity ?? 100)}
                                      onChange={(event) => updateSelectedBlock({ zoneBackgroundOpacity: clampValue(Number(event.target.value) || 0, 0, 100) })}
                                      className="w-full accent-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1 block">
                                    <div className="flex items-center justify-between">
                                      <SettingsFieldLabel icon={Blend} label="Opacité bordure" />
                                      <span className="text-xs text-[#d7dde5]">{Math.round(selectedBlock.zoneBorderOpacity ?? (selectedBlock.zoneBorderTransparent ? 0 : 100))}%</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={Math.round(selectedBlock.zoneBorderOpacity ?? (selectedBlock.zoneBorderTransparent ? 0 : 100))}
                                      onChange={(event) => updateSelectedBlock({ zoneBorderOpacity: clampValue(Number(event.target.value) || 0, 0, 100) })}
                                      className="w-full accent-[#5f90ff]" />
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {selectedBlock.type === 'separator' && (
                          <div className="space-y-3 rounded-md border border-[#343b43] bg-[#232931] p-3">
                            <div className="text-xs font-semibold text-[#d7dde5]">Style du séparateur</div>
                            <div className="grid grid-cols-2 gap-3">
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={PenLine} label="Type" />
                                <select
                                  value={selectedBlock.separatorStyle ?? 'solid'}
                                  onChange={(event) => updateSelectedBlock({ separatorStyle: event.target.value as SeparatorStyle })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                                >
                                  <option value="solid">Ligne pleine</option>
                                  <option value="dashed">Pointillés longs</option>
                                  <option value="dotted">Pointillés ronds</option>
                                  <option value="double">Double ligne</option>
                                  <option value="gradient">Dégradé</option>
                                  <option value="glow">Brillance</option>
                                </select>
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={AlignLeft} label="Alignement" />
                                <select
                                  value={selectedBlock.separatorAlign ?? 'center'}
                                  onChange={(event) => updateSelectedBlock({ separatorAlign: event.target.value as SeparatorAlign })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                                >
                                  <option value="left">Gauche</option>
                                  <option value="center">Centré</option>
                                  <option value="right">Droite</option>
                                </select>
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={Maximize2} label="Largeur (%)" />
                                <input
                                  type="number"
                                  min={10}
                                  max={100}
                                  value={Math.round(selectedBlock.separatorWidthPercent ?? 100)}
                                  onChange={(event) => updateSelectedBlock({
                                    separatorWidthPercent: clampValue(Number(event.target.value) || 10, 10, 100),
                                  })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={PenLine} label="Épaisseur (px)" />
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={Math.round(selectedBlock.separatorThickness ?? 2)}
                                  onChange={(event) => updateSelectedBlock({
                                    separatorThickness: clampValue(Number(event.target.value) || 1, 1, 20),
                                  })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1">
                                <SettingsFieldLabel icon={CornerDownRight} label="Arrondi (px)" />
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  value={Math.round(selectedBlock.separatorRadius ?? 999)}
                                  onChange={(event) => updateSelectedBlock({
                                    separatorRadius: clampValue(Number(event.target.value) || 0, 0, 999),
                                  })}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                              </label>
                              <label className="space-y-1 block">
                                <div className="flex items-center justify-between">
                                  <SettingsFieldLabel icon={Blend} label="Opacité" />
                                  <span className="text-xs text-[#d7dde5]">{Math.round(selectedBlock.separatorOpacity ?? 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={Math.round(selectedBlock.separatorOpacity ?? 100)}
                                  onChange={(event) => updateSelectedBlock({
                                    separatorOpacity: clampValue(Number(event.target.value) || 0, 0, 100),
                                  })}
                                  className="w-full accent-[#5f90ff]" />
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <label className="space-y-1 block">
                                <SettingsFieldLabel icon={Palette} label="Couleur principale" />
                                <div className="flex items-center gap-2">
                                  <ColorPickerButton
                                    size="sm"
                                    value={selectedBlock.separatorColor ?? '#64748b'}
                                    onChange={(value) => updateSelectedBlock({ separatorColor: value })}
                                    ariaLabel="Couleur principale du séparateur"
                                  />
                                </div>
                              </label>
                              <label className="space-y-1 block">
                                <SettingsFieldLabel icon={Palette} label="Couleur secondaire" />
                                <div className="flex items-center gap-2">
                                  <ColorPickerButton
                                    size="sm"
                                    value={selectedBlock.separatorSecondaryColor ?? '#94a3b8'}
                                    onChange={(value) => updateSelectedBlock({ separatorSecondaryColor: value })}
                                    ariaLabel="Couleur secondaire du séparateur"
                                  />
                                </div>
                              </label>
                            </div>
                            <div className="text-[11px] text-[#9aa5b1]">
                              Astuce: activez le type `Dégradé` pour utiliser la couleur secondaire.
                            </div>
                          </div>
                        )}

                        {selectedBlock.type === 'grid' && (
                          <div className="space-y-3 rounded-md border border-[#343b43] bg-[#232931] p-3">
                            <div className="text-xs font-semibold text-[#d7dde5]">Grille</div>
                            <div className="grid grid-cols-3 gap-2 rounded-md border border-[#343b43] bg-[#1b2128] p-1">
                              {[
                                { id: 'structure' as const, label: 'Structure' },
                                { id: 'style' as const, label: 'Style' },
                                { id: 'brush' as const, label: 'Pinceau' },
                              ].map((tab) => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setGridSettingsTab(tab.id)}
                                  className={`h-8 rounded-md text-xs transition ${
                                    gridSettingsTab === tab.id
                                      ? 'bg-[#2b3a52] text-[#8db4ff]'
                                      : 'text-[#c7d0d9] hover:bg-[#2a313a]'
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>

                            {gridSettingsTab === 'structure' && (
                              <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                                <div className="text-xs font-semibold text-[#d7dde5]">Structure de la grille</div>
                                <div className="grid grid-cols-2 gap-3">
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={Rows2} label="Lignes" />
                                    <input
                                      type="number"
                                      min={1}
                                      max={12}
                                      value={Math.max(1, selectedBlock.gridRows ?? 1)}
                                      onChange={(event) => {
                                        const nextRows = clampInteger(Number(event.target.value), 1, 12, 1);
                                        const currentRows = Math.max(1, selectedBlock.gridRows ?? 1);
                                        const currentColumns = Math.max(1, selectedBlock.gridColumns ?? 1);
                                        const nextCells = resizeGridCells(selectedBlock.gridCells, currentRows, currentColumns, nextRows, currentColumns);
                                        updateSelectedBlock({
                                          gridRows: nextRows,
                                          gridColumns: currentColumns,
                                          gridCells: nextCells,
                                        });
                                      }}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={Columns2} label="Colonnes" />
                                    <input
                                      type="number"
                                      min={1}
                                      max={12}
                                      value={Math.max(1, selectedBlock.gridColumns ?? 1)}
                                      onChange={(event) => {
                                        const nextColumns = clampInteger(Number(event.target.value), 1, 12, 1);
                                        const currentRows = Math.max(1, selectedBlock.gridRows ?? 1);
                                        const currentColumns = Math.max(1, selectedBlock.gridColumns ?? 1);
                                        const nextCells = resizeGridCells(selectedBlock.gridCells, currentRows, currentColumns, currentRows, nextColumns);
                                        updateSelectedBlock({
                                          gridRows: currentRows,
                                          gridColumns: nextColumns,
                                          gridCells: nextCells,
                                        });
                                      }}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={SlidersHorizontal} label="Padding cellule X (mm)" />
                                    <input
                                      type="number"
                                      min={0}
                                      max={40}
                                      value={typeof selectedBlock.gridCellPaddingXMm === 'number' ? selectedBlock.gridCellPaddingXMm : 2}
                                      onChange={(event) => updateSelectedBlock({ gridCellPaddingXMm: clampValue(Number(event.target.value) || 0, 0, 40) })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={SlidersHorizontal} label="Padding cellule Y (mm)" />
                                    <input
                                      type="number"
                                      min={0}
                                      max={40}
                                      value={typeof selectedBlock.gridCellPaddingYMm === 'number' ? selectedBlock.gridCellPaddingYMm : 2}
                                      onChange={(event) => updateSelectedBlock({ gridCellPaddingYMm: clampValue(Number(event.target.value) || 0, 0, 40) })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={Maximize2} label="Hauteur min cellule (mm)" />
                                    <input
                                      type="number"
                                      min={2}
                                      max={120}
                                      value={typeof selectedBlock.gridCellMinHeightMm === 'number' ? selectedBlock.gridCellMinHeightMm : 12}
                                      onChange={(event) => updateSelectedBlock({ gridCellMinHeightMm: clampValue(Number(event.target.value) || 2, 2, 120) })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                </div>
                              </div>
                            )}

                            {gridSettingsTab === 'style' && (
                              <div className="rounded-md border border-[#343b43] bg-[#1f252d] p-3 space-y-3">
                                <div className="text-xs font-semibold text-[#d7dde5]">Style de la grille</div>
                                <div className="grid grid-cols-2 gap-3">
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={PenLine} label="Épaisseur séparateurs (px)" />
                                    <input
                                      type="number"
                                      min={0}
                                      max={8}
                                      value={typeof selectedBlock.gridDividerWidth === 'number' ? selectedBlock.gridDividerWidth : 1}
                                      onChange={(event) => updateSelectedBlock({ gridDividerWidth: Math.max(0, Number(event.target.value) || 0) })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={PenLine} label="Style séparateurs" />
                                    <select
                                      value={selectedBlock.gridDividerStyle ?? 'solid'}
                                      onChange={(event) => updateSelectedBlock({ gridDividerStyle: event.target.value as SimpleBorderStyle })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]"
                                    >
                                      <option value="solid">Plein</option>
                                      <option value="dashed">Tirets</option>
                                      <option value="dotted">Pointillé</option>
                                    </select>
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={CornerDownRight} label="Arrondi cadre (px)" />
                                    <input
                                      type="number"
                                      min={0}
                                      max={999}
                                      value={typeof selectedBlock.gridBorderRadius === 'number' ? selectedBlock.gridBorderRadius : 0}
                                      onChange={(event) => updateSelectedBlock({ gridBorderRadius: clampValue(Number(event.target.value) || 0, 0, 999) })}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <label className="space-y-1 block">
                                    <SettingsFieldLabel icon={Palette} label="Couleur des séparateurs" />
                                    <div className="flex items-center gap-2">
                                      <ColorPickerButton
                                        size="sm"
                                        value={typeof selectedBlock.gridDividerColor === 'string' ? selectedBlock.gridDividerColor : '#94a3b8'}
                                        onChange={(value) => updateSelectedBlock({ gridDividerColor: value })}
                                        ariaLabel="Couleur des séparateurs de grille"
                                      />
                                    </div>
                                  </label>
                                  <label className="space-y-1 block">
                                    <SettingsFieldLabel icon={Palette} label="Fond grille" />
                                    <div className="flex items-center gap-2">
                                      <ColorPickerButton
                                        size="sm"
                                        value={typeof selectedBlock.gridBackgroundColor === 'string' ? selectedBlock.gridBackgroundColor : '#ffffff'}
                                        onChange={(value) => updateSelectedBlock({ gridBackgroundColor: value })}
                                        ariaLabel="Couleur fond grille"
                                      />
                                    </div>
                                  </label>
                                  <label className="space-y-1 block">
                                    <SettingsFieldLabel icon={Palette} label="Fond cellules" />
                                    <div className="flex items-center gap-2">
                                      <ColorPickerButton
                                        size="sm"
                                        value={typeof selectedBlock.gridCellBackgroundColor === 'string' ? selectedBlock.gridCellBackgroundColor : '#ffffff'}
                                        onChange={(value) => updateSelectedBlock({ gridCellBackgroundColor: value })}
                                        ariaLabel="Couleur fond cellules"
                                      />
                                    </div>
                                  </label>
                                </div>

                                <div className="space-y-3 rounded-md border border-[#343b43] bg-[#181e25] p-3">
                                  <label className="space-y-1 block">
                                    <div className="flex items-center justify-between">
                                      <SettingsFieldLabel icon={Blend} label="Opacité bordures" />
                                      <span className="text-xs text-[#d7dde5]">
                                        {Math.round(typeof selectedBlock.gridBorderOpacity === 'number' ? selectedBlock.gridBorderOpacity : (selectedBlock.gridBorderTransparent ? 0 : 100))}%
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={Math.round(typeof selectedBlock.gridBorderOpacity === 'number' ? selectedBlock.gridBorderOpacity : (selectedBlock.gridBorderTransparent ? 0 : 100))}
                                      onChange={(event) => updateSelectedBlock({ gridBorderOpacity: clampValue(Number(event.target.value) || 0, 0, 100) })}
                                      className="w-full accent-[#5f90ff]"
                                    />
                                  </label>
                                  <label className="space-y-1 block">
                                    <div className="flex items-center justify-between">
                                      <SettingsFieldLabel icon={Blend} label="Opacité fond grille" />
                                      <span className="text-xs text-[#d7dde5]">
                                        {Math.round(typeof selectedBlock.gridBackgroundOpacity === 'number' ? selectedBlock.gridBackgroundOpacity : (typeof selectedBlock.gridOpacity === 'number' ? selectedBlock.gridOpacity : 100))}%
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={Math.round(typeof selectedBlock.gridBackgroundOpacity === 'number' ? selectedBlock.gridBackgroundOpacity : (typeof selectedBlock.gridOpacity === 'number' ? selectedBlock.gridOpacity : 100))}
                                      onChange={(event) => updateSelectedBlock({ gridBackgroundOpacity: clampValue(Number(event.target.value) || 0, 0, 100) })}
                                      className="w-full accent-[#5f90ff]"
                                    />
                                  </label>
                                  <label className="space-y-1 block">
                                    <div className="flex items-center justify-between">
                                      <SettingsFieldLabel icon={Blend} label="Opacité fond cellules" />
                                      <span className="text-xs text-[#d7dde5]">
                                        {Math.round(typeof selectedBlock.gridCellBackgroundOpacity === 'number' ? selectedBlock.gridCellBackgroundOpacity : (typeof selectedBlock.gridOpacity === 'number' ? selectedBlock.gridOpacity : 100))}%
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={Math.round(typeof selectedBlock.gridCellBackgroundOpacity === 'number' ? selectedBlock.gridCellBackgroundOpacity : (typeof selectedBlock.gridOpacity === 'number' ? selectedBlock.gridOpacity : 100))}
                                      onChange={(event) => updateSelectedBlock({ gridCellBackgroundOpacity: clampValue(Number(event.target.value) || 0, 0, 100) })}
                                      className="w-full accent-[#5f90ff]"
                                    />
                                  </label>
                                </div>
                              </div>
                            )}

                            {gridSettingsTab === 'brush' && (
                              <div className="rounded-md border border-[#3c444d] bg-[#171c22] p-3 space-y-3">
                                <div className="text-xs font-semibold text-[#d7dde5]">Pinceau contours</div>
                                <div className="grid grid-cols-2 gap-3">
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={Palette} label="Couleur" />
                                    <div className="flex items-center gap-2">
                                      <ColorPickerButton
                                        size="sm"
                                        value={gridBrushColor}
                                        onChange={setGridBrushColor}
                                        ariaLabel="Couleur pinceau de grille"
                                      />
                                    </div>
                                  </label>
                                  <label className="space-y-1">
                                    <SettingsFieldLabel icon={PenLine} label="Épaisseur (px)" />
                                    <input
                                      type="number"
                                      min={0}
                                      max={12}
                                      value={gridBrushWidth}
                                      onChange={(event) => setGridBrushWidth(Math.max(0, Number(event.target.value) || 0))}
                                      className="w-full rounded-md border border-[#3c444d] bg-[#11161c] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                                  </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {[
                                    { side: 'top' as const, label: 'Haut' },
                                    { side: 'right' as const, label: 'Droite' },
                                    { side: 'bottom' as const, label: 'Bas' },
                                    { side: 'left' as const, label: 'Gauche' },
                                  ].map((entry) => (
                                    <button
                                      key={entry.side}
                                      type="button"
                                      onClick={() => applyGridBrushToSide(entry.side)}
                                      className="rounded-md border border-[#3c444d] bg-[#151a20] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                                    >
                                      {entry.label}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={applyGridBrushToAllSides}
                                  className="w-full rounded-md border border-[#3c444d] bg-[#151a20] px-3 py-2 text-xs text-[#d5dde5] hover:bg-[#232a33]"
                                >
                                  Appliquer sur les 4 côtés
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="rounded-md border border-[#343b43] bg-[#232931] p-3">
                          <div className="mb-2 text-xs text-[#d7dde5]">Marges haut / bas</div>
                          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                            <label className="space-y-1">
                              <SettingsFieldLabel icon={Ruler} label="Haut (mm)" />
                              <input
                                type="number"
                                min={0}
                                max={148}
                                value={Math.round(selectedBlock.marginTop)}
                                onChange={(e) => setSelectedBlockVerticalMargins(Number(e.target.value), 'top')}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const next = !selectedBlock.linkVertical;
                                updateSelectedBlock({
                                  linkVertical: next,
                                  marginBottom: next ? selectedBlock.marginTop : selectedBlock.marginBottom,
                                });
                              } }
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${selectedBlock.linkVertical
                                  ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                  : 'border-[#4a525b] bg-[#171c22] text-[#c7d0d9] hover:bg-[#222933]'}`}
                            >
                              {selectedBlock.linkVertical ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                            </button>
                            <label className="space-y-1">
                              <SettingsFieldLabel icon={Ruler} label="Bas (mm)" />
                              <input
                                type="number"
                                min={0}
                                max={148}
                                value={Math.round(selectedBlock.marginBottom)}
                                onChange={(e) => setSelectedBlockVerticalMargins(Number(e.target.value), 'bottom')}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                            </label>
                          </div>
                        </div>

                        <div className="rounded-md border border-[#343b43] bg-[#232931] p-3">
                          <div className="mb-2 text-xs text-[#d7dde5]">Marges gauche / droite</div>
                          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                            <label className="space-y-1">
                              <SettingsFieldLabel icon={Ruler} label="Gauche (mm)" />
                              <input
                                type="number"
                                min={0}
                                max={104}
                                value={Math.round(selectedBlock.marginLeft)}
                                onChange={(e) => setSelectedBlockHorizontalMargins(Number(e.target.value), 'left')}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const next = !selectedBlock.linkHorizontal;
                                updateSelectedBlock({
                                  linkHorizontal: next,
                                  marginRight: next ? selectedBlock.marginLeft : selectedBlock.marginRight,
                                });
                              } }
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${selectedBlock.linkHorizontal
                                  ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                                  : 'border-[#4a525b] bg-[#171c22] text-[#c7d0d9] hover:bg-[#222933]'}`}
                            >
                              {selectedBlock.linkHorizontal ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                            </button>
                            <label className="space-y-1">
                              <SettingsFieldLabel icon={Ruler} label="Droite (mm)" />
                              <input
                                type="number"
                                min={0}
                                max={104}
                                value={Math.round(selectedBlock.marginRight)}
                                onChange={(e) => setSelectedBlockHorizontalMargins(Number(e.target.value), 'right')}
                                className="w-full rounded-md border border-[#3c444d] bg-[#171c22] px-3 py-2 text-sm text-white outline-none focus:border-[#5f90ff]" />
                            </label>
                          </div>
                        </div>

                      </>
                    )}
	              </div>
	            )}

	          </div>
	              <div className="w-20 border-l border-[#3b424a] bg-[#171c22] flex flex-col items-center py-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTool('margins')}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${activeTool === 'margins'
                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                        : 'border-[#3c444d] bg-[#1c2229] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                    title="Marges"
                  >
                    <Ruler className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTool('pageBands')}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${activeTool === 'pageBands'
                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                        : 'border-[#3c444d] bg-[#1c2229] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                    title="En-tête / Pied de page"
                  >
                    <AlignJustify className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTool('blocks')}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${activeTool === 'blocks'
                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                        : 'border-[#3c444d] bg-[#1c2229] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                    title="Blocs"
                  >
                    <SquareStack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTool('layers')}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${activeTool === 'layers'
                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                        : 'border-[#3c444d] bg-[#1c2229] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                    title="Layers"
                  >
                    <Layers className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTool('templateLibrary')}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${activeTool === 'templateLibrary'
                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                        : 'border-[#3c444d] bg-[#1c2229] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                    title="Templates sauvegardés"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTool('blockStyle')}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${activeTool === 'blockStyle'
                        ? 'border-[#5f90ff] bg-[#1f2f4a] text-[#8db4ff]'
                        : 'border-[#3c444d] bg-[#1c2229] text-[#c7d0d9] hover:bg-[#232a33]'}`}
                    title="Propriétés bloc"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                </div>
        </aside>
      </div>
      {blockContextMenu && (
        <div
          ref={blockContextMenuRef}
          className="fixed z-50 min-w-[190px] rounded-md border border-[#3e4650] bg-[#151a20] p-1 shadow-[0_16px_36px_rgba(0,0,0,0.45)]"
          style={{
            left: `min(${blockContextMenu.x}px, calc(100vw - 206px))`,
            top: `min(${blockContextMenu.y}px, calc(100vh - 56px))`,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {blockContextMenu.selectedIds.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => linkSelectedBlocks(blockContextMenu.selectedIds)}
                className="inline-flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[#d6e3ff] hover:bg-[#1f2f4a]"
              >
                <Link2 className="h-4 w-4" />
                <span>Lier la sélection ({blockContextMenu.selectedIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => unlinkSelectedBlocks(blockContextMenu.selectedIds)}
                className="inline-flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[#cdd7e3] hover:bg-[#212b36]"
              >
                <Link2Off className="h-4 w-4" />
                <span>Délier la sélection</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => duplicateSelectedBlocks(blockContextMenu.selectedIds.length > 0 ? blockContextMenu.selectedIds : [blockContextMenu.blockId])}
            className="inline-flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[#d6e3ff] hover:bg-[#1f2f4a]"
          >
            <Copy className="h-4 w-4" />
            <span>
              {blockContextMenu.selectedIds.length > 1
                ? `Dupliquer ${blockContextMenu.selectedIds.length} blocs`
                : 'Dupliquer le bloc'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => deleteSelectedBlocks(blockContextMenu.selectedIds.length > 0 ? blockContextMenu.selectedIds : [blockContextMenu.blockId])}
            className="inline-flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[#fca5a5] hover:bg-[#2b1c1c]"
          >
            <Trash2 className="h-4 w-4" />
            <span>
              {blockContextMenu.selectedIds.length > 1
                ? `Supprimer ${blockContextMenu.selectedIds.length} blocs`
                : 'Supprimer le bloc'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TemplateStudio;
