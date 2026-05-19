import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Eye,
  FileText,
  GripVertical,
  LayoutPanelTop,
  Maximize2,
  Minus,
  Palette,
  Settings2,
  Sparkles,
  Table2,
  TextCursorInput,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { CompanySettings } from '../../hooks/useCompanySettings';
import { useCompanySnippets } from '../../hooks/useCompanySnippets';

type DocType = 'devis' | 'facture' | 'bon_prepa';
type TextAlign = 'left' | 'center' | 'right';

type TemplatePayload = {
  editor_html: string;
  studio?: StudioTemplate;
  [key: string]: unknown;
};

type TemplateMap = Record<DocType, TemplatePayload>;

type BlockStyle = {
  marginTop: number;
  marginBottom: number;
  padding: number;
  radius: number;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
};

type BlockType =
  | 'heading'
  | 'text'
  | 'client_info'
  | 'project_info'
  | 'equipment_table'
  | 'totals'
  | 'signature'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'variables'
  | 'snippet'
  | 'custom_html';

type BaseBlock = {
  id: string;
  type: BlockType;
  label: string;
  style: BlockStyle;
};

type HeadingBlock = BaseBlock & {
  type: 'heading';
  text: string;
  level: 1 | 2 | 3;
  align: TextAlign;
};

type TextBlock = BaseBlock & {
  type: 'text';
  html: string;
};

type ClientInfoBlock = BaseBlock & {
  type: 'client_info';
  showProfile: boolean;
  showAddress: boolean;
  showContact: boolean;
};

type ProjectInfoBlock = BaseBlock & {
  type: 'project_info';
  showType: boolean;
  showPeriod: boolean;
  showLocation: boolean;
  showDelivery: boolean;
  showCoefficientHint: boolean;
};

type EquipmentTableBlock = BaseBlock & {
  type: 'equipment_table';
  columns: string[];
};

type TotalsBlock = BaseBlock & {
  type: 'totals';
  title: string;
  showBreakdown: boolean;
};

type SignatureBlock = BaseBlock & {
  type: 'signature';
  title: string;
  helper: string;
  buttonLabel: string;
};

type ImageBlock = BaseBlock & {
  type: 'image';
  url: string;
  alt: string;
  widthPercent: number;
  align: TextAlign;
};

type DividerBlock = BaseBlock & {
  type: 'divider';
  lineStyle: 'solid' | 'dashed';
  thickness: number;
  color: string;
};

type SpacerBlock = BaseBlock & {
  type: 'spacer';
  height: number;
};

type VariablesBlock = BaseBlock & {
  type: 'variables';
  tokens: string[];
  inline: boolean;
};

type SnippetBlock = BaseBlock & {
  type: 'snippet';
  content: string;
};

type CustomHtmlBlock = BaseBlock & {
  type: 'custom_html';
  html: string;
};

type StudioBlock =
  | HeadingBlock
  | TextBlock
  | ClientInfoBlock
  | ProjectInfoBlock
  | EquipmentTableBlock
  | TotalsBlock
  | SignatureBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | VariablesBlock
  | SnippetBlock
  | CustomHtmlBlock;

type StudioTemplate = {
  version: 1;
  accentColor: string;
  customCss: string;
  page: {
    backgroundColor: string;
    contentPadding: number;
    blockGap: number;
    maxWidth: number;
  };
  blocks: StudioBlock[];
};

interface Props {
  settings: CompanySettings | null;
  onSave: (templates: TemplateMap) => Promise<void> | void;
  canEdit?: boolean;
}

const defaultBlockStyle: BlockStyle = {
  marginTop: 0,
  marginBottom: 10,
  padding: 0,
  radius: 0,
  borderWidth: 0,
  borderColor: '#d1d5db',
  backgroundColor: 'transparent',
  textColor: '#111827',
};

const TABLE_COLUMNS = ['equipment', 'type', 'qty', 'pricePerDay', 'days', 'total', 'checkbox'];

const VARIABLE_GROUPS: Array<{ label: string; tokens: Array<{ label: string; token: string }> }> = [
  {
    label: 'Client',
    tokens: [
      { label: 'Nom', token: '{{client_name}}' },
      { label: 'Entreprise', token: '{{client_company}}' },
      { label: 'Profil', token: '{{client_profile}}' },
      { label: 'Email', token: '{{client_email}}' },
      { label: 'Téléphone', token: '{{client_phone}}' },
      { label: 'Adresse', token: '{{client_address}}' },
      { label: 'Contact', token: '{{client_contact}}' },
    ],
  },
  {
    label: 'Prestation',
    tokens: [
      { label: 'Référence', token: '{{reference}}' },
      { label: 'Titre', token: '{{title}}' },
      { label: 'Type', token: '{{type}}' },
      { label: 'Période', token: '{{period}}' },
      { label: 'Date début', token: '{{start_date}}' },
      { label: 'Date fin', token: '{{end_date}}' },
      { label: 'Jours', token: '{{days}}' },
      { label: 'Lieu', token: '{{location}}' },
      { label: 'Livraison', token: '{{delivery_date}}' },
    ],
  },
  {
    label: 'Entreprise',
    tokens: [
      { label: 'Nom', token: '{{company_name}}' },
      { label: 'Raison sociale', token: '{{company_legal}}' },
      { label: 'Email', token: '{{company_email}}' },
      { label: 'Téléphone', token: '{{company_phone}}' },
      { label: 'Adresse', token: '{{company_address}}' },
      { label: 'SIREN', token: '{{company_siren}}' },
      { label: 'SIRET', token: '{{company_siret}}' },
      { label: 'TVA', token: '{{company_vat}}' },
    ],
  },
  {
    label: 'Financier',
    tokens: [
      { label: 'Total', token: '{{total}}' },
    ],
  },
];

const MODULE_LIBRARY: Array<{
  type: BlockType;
  label: string;
  description: string;
  group: 'layout' | 'content' | 'business' | 'advanced';
  icon: React.FC<{ className?: string }>;
}> = [
  { type: 'heading', label: 'Titre', description: 'Titre principal, H1/H2/H3', group: 'layout', icon: Type },
  { type: 'text', label: 'Texte', description: 'Paragraphe libre', group: 'content', icon: TextCursorInput },
  { type: 'divider', label: 'Séparateur', description: 'Ligne horizontale', group: 'layout', icon: Minus },
  { type: 'spacer', label: 'Espacement', description: 'Espace vertical', group: 'layout', icon: GripVertical },
  { type: 'image', label: 'Image', description: 'Logo ou visuel', group: 'content', icon: Eye },
  { type: 'client_info', label: 'Infos client', description: 'Bloc client standard', group: 'business', icon: FileText },
  { type: 'project_info', label: 'Infos prestation', description: 'Référence, période, lieu', group: 'business', icon: Sparkles },
  { type: 'equipment_table', label: 'Tableau matériel', description: 'Table dynamique des lignes', group: 'business', icon: Table2 },
  { type: 'totals', label: 'Totaux', description: 'Récapitulatif financier', group: 'business', icon: LayoutPanelTop },
  { type: 'signature', label: 'Signature', description: 'Zone signature + bouton', group: 'business', icon: Check },
  { type: 'variables', label: 'Variables', description: 'Liste de variables', group: 'advanced', icon: Sparkles },
  { type: 'snippet', label: 'Phrase type', description: 'Snippet enregistré', group: 'advanced', icon: Copy },
  { type: 'custom_html', label: 'HTML libre', description: 'Bloc HTML avancé', group: 'advanced', icon: Code2 },
];

const MODULE_GROUP_LABELS: Record<'layout' | 'content' | 'business' | 'advanced', string> = {
  layout: 'Mise en page',
  content: 'Contenu',
  business: 'Modules métier',
  advanced: 'Avancé',
};

const documentLabels: Record<DocType, string> = {
  devis: 'Devis',
  facture: 'Facture',
  bon_prepa: 'Bon de préparation',
};

const id = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `block_${Math.random().toString(36).slice(2, 10)}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return clamp(num, min, max);
};

const normalizeColor = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const normalizeBlockStyle = (style: unknown): BlockStyle => {
  const raw = style && typeof style === 'object' ? (style as Partial<BlockStyle>) : {};
  return {
    marginTop: normalizeNumber(raw.marginTop, defaultBlockStyle.marginTop, 0, 200),
    marginBottom: normalizeNumber(raw.marginBottom, defaultBlockStyle.marginBottom, 0, 200),
    padding: normalizeNumber(raw.padding, defaultBlockStyle.padding, 0, 120),
    radius: normalizeNumber(raw.radius, defaultBlockStyle.radius, 0, 60),
    borderWidth: normalizeNumber(raw.borderWidth, defaultBlockStyle.borderWidth, 0, 12),
    borderColor: normalizeColor(raw.borderColor, defaultBlockStyle.borderColor),
    backgroundColor: normalizeColor(raw.backgroundColor, defaultBlockStyle.backgroundColor),
    textColor: normalizeColor(raw.textColor, defaultBlockStyle.textColor),
  };
};

const createDefaultBlock = (type: BlockType, snippetContent = ''): StudioBlock => {
  const style = { ...defaultBlockStyle };
  switch (type) {
    case 'heading':
      return { id: id(), type, label: 'Titre', style, text: 'Titre du document', level: 1, align: 'left' };
    case 'text':
      return { id: id(), type, label: 'Texte', style, html: '<p>Ajoutez votre contenu ici.</p>' };
    case 'client_info':
      return { id: id(), type, label: 'Infos client', style, showProfile: true, showAddress: true, showContact: true };
    case 'project_info':
      return {
        id: id(),
        type,
        label: 'Infos prestation',
        style,
        showType: true,
        showPeriod: true,
        showLocation: true,
        showDelivery: true,
        showCoefficientHint: true,
      };
    case 'equipment_table':
      return {
        id: id(),
        type,
        label: 'Tableau matériel',
        style,
        columns: ['equipment', 'type', 'qty', 'pricePerDay', 'days', 'total'],
      };
    case 'totals':
      return { id: id(), type, label: 'Totaux', style, title: 'Récapitulatif', showBreakdown: true };
    case 'signature':
      return {
        id: id(),
        type,
        label: 'Signature',
        style,
        title: 'Validation',
        helper: 'Merci de signer et accepter le document.',
        buttonLabel: 'Cliquer ici pour signer et accepter',
      };
    case 'image':
      return { id: id(), type, label: 'Image', style, url: '', alt: 'Image', widthPercent: 40, align: 'left' };
    case 'divider':
      return { id: id(), type, label: 'Séparateur', style, lineStyle: 'solid', thickness: 1, color: '#d1d5db' };
    case 'spacer':
      return { id: id(), type, label: 'Espacement', style, height: 24 };
    case 'variables':
      return { id: id(), type, label: 'Variables', style, tokens: ['{{reference}}', '{{period}}'], inline: false };
    case 'snippet':
      return { id: id(), type, label: 'Phrase type', style, content: snippetContent || '<p>Votre phrase type.</p>' };
    case 'custom_html':
      return { id: id(), type, label: 'HTML libre', style, html: '<div>Bloc personnalisé</div>' };
    default:
      return { id: id(), type: 'text', label: 'Texte', style, html: '<p>Contenu</p>' };
  }
};

const defaultStudioByDocType = (docType: DocType, accentColor: string): StudioTemplate => {
  const commonBlocks: StudioBlock[] = [
    { ...createDefaultBlock('heading'), text: docType === 'facture' ? 'Facture' : docType === 'devis' ? 'Devis' : 'Bon de préparation' } as HeadingBlock,
    createDefaultBlock('client_info'),
    createDefaultBlock('project_info'),
    {
      ...createDefaultBlock('equipment_table'),
      columns: docType === 'bon_prepa'
        ? ['equipment', 'type', 'qty', 'checkbox']
        : docType === 'facture'
          ? ['equipment', 'qty', 'pricePerDay', 'days', 'total']
          : ['equipment', 'type', 'qty', 'pricePerDay', 'days', 'total'],
    } as EquipmentTableBlock,
  ];

  if (docType !== 'bon_prepa') {
    commonBlocks.push(createDefaultBlock('totals'));
  }
  commonBlocks.push(createDefaultBlock('signature'));

  return {
    version: 1,
    accentColor,
    customCss: '',
    page: {
      backgroundColor: '#ffffff',
      contentPadding: 24,
      blockGap: 8,
      maxWidth: 860,
    },
    blocks: commonBlocks,
  };
};

const safeStripTags = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const parseAccentFromHtml = (html: string) => {
  const match = html.match(/\[\[ACCENT:([^\]]+)]]/i);
  return match ? match[1].trim() : '';
};

const parseTableColumns = (segment: string) => {
  const match = segment.match(/\[\[TABLE:([^\]]+)]]/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const fromHtmlToStudioFallback = (html: string, docType: DocType, accentColor: string): StudioTemplate => {
  const base = defaultStudioByDocType(docType, accentColor);
  const normalizedHtml = typeof html === 'string' ? html : '';
  if (!normalizedHtml.trim()) return base;

  const resolvedAccent = parseAccentFromHtml(normalizedHtml) || accentColor;
  const withoutAccent = normalizedHtml.replace(/\[\[ACCENT:[^\]]+]]/gi, '').trim();
  const tokenRegex = /(\[\[TABLE:[^\]]+]])/gi;
  const segments = withoutAccent.split(tokenRegex).filter((segment) => segment.trim().length > 0);
  const blocks: StudioBlock[] = [];

  segments.forEach((segment) => {
    if (/\[\[TABLE:[^\]]+]]/i.test(segment)) {
      const cols = parseTableColumns(segment);
      const tableBlock = createDefaultBlock('equipment_table') as EquipmentTableBlock;
      tableBlock.columns = cols.length ? cols : tableBlock.columns;
      blocks.push(tableBlock);
      return;
    }

    const trimmed = segment.trim();
    if (!trimmed) return;

    const headingMatch = trimmed.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (headingMatch) {
      const heading = createDefaultBlock('heading') as HeadingBlock;
      heading.text = safeStripTags(headingMatch[1]) || heading.text;
      blocks.push(heading);
      const rest = trimmed.replace(headingMatch[0], '').trim();
      if (rest) {
        const textBlock = createDefaultBlock('text') as TextBlock;
        textBlock.html = rest;
        blocks.push(textBlock);
      }
      return;
    }

    const textBlock = createDefaultBlock('text') as TextBlock;
    textBlock.html = trimmed;
    blocks.push(textBlock);
  });

  if (!blocks.length) {
    return base;
  }

  return {
    ...base,
    accentColor: resolvedAccent,
    blocks,
  };
};

const blockStyleToCss = (style: BlockStyle) => {
  const rules: string[] = [];
  rules.push(`margin-top:${style.marginTop}px`);
  rules.push(`margin-bottom:${style.marginBottom}px`);
  if (style.padding > 0) rules.push(`padding:${style.padding}px`);
  if (style.radius > 0) rules.push(`border-radius:${style.radius}px`);
  if (style.borderWidth > 0) rules.push(`border:${style.borderWidth}px solid ${style.borderColor}`);
  if (style.backgroundColor !== 'transparent') rules.push(`background:${style.backgroundColor}`);
  if (style.textColor) rules.push(`color:${style.textColor}`);
  return rules.join(';');
};

const wrapWithStyle = (inner: string, style: BlockStyle) => {
  const css = blockStyleToCss(style);
  if (!css) return inner;
  return `<div style="${css}">${inner}</div>`;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const blockToHtml = (block: StudioBlock): string => {
  switch (block.type) {
    case 'heading': {
      const headingTag = `h${block.level}`;
      const html = `<${headingTag} style="text-align:${block.align};margin:0;">${escapeHtml(block.text)}</${headingTag}>`;
      return wrapWithStyle(html, block.style);
    }
    case 'text':
      return wrapWithStyle(block.html, block.style);
    case 'client_info': {
      const lines = [
        '<p><strong>Client:</strong> {{client_name}}</p>',
        '<p><strong>Entreprise:</strong> {{client_company}}</p>',
        block.showProfile ? '<p><strong>Profil:</strong> {{client_profile}}</p>' : '',
        block.showAddress ? '<p><strong>Adresse:</strong> {{client_address}}</p>' : '',
        block.showContact ? '<p><strong>Contact:</strong> {{client_contact}}</p>' : '',
      ].filter(Boolean);
      return wrapWithStyle(lines.join(''), block.style);
    }
    case 'project_info': {
      const lines = [
        '<p><strong>Référence:</strong> {{reference}}</p>',
        '<p><strong>Titre:</strong> {{title}}</p>',
        block.showType ? '<p><strong>Type:</strong> {{type}}</p>' : '',
        block.showPeriod ? '<p><strong>Période:</strong> {{period}} ({{days}} jours)</p>' : '',
        block.showLocation ? '<p><strong>Lieu:</strong> {{location}}</p>' : '',
        block.showDelivery ? '<p><strong>Livraison:</strong> {{delivery_date}}</p>' : '',
        block.showCoefficientHint ? '<p><strong>Coefficient:</strong> {{days}}</p>' : '',
      ].filter(Boolean);
      return wrapWithStyle(lines.join(''), block.style);
    }
    case 'equipment_table': {
      const cols = block.columns.length ? block.columns.join(',') : 'equipment,qty,pricePerDay,days,total';
      return wrapWithStyle(`[[TABLE:${cols}]]`, block.style);
    }
    case 'totals': {
      const title = block.title.trim() || 'Récapitulatif';
      const lines = [
        `<h3>${escapeHtml(title)}</h3>`,
        block.showBreakdown ? '<p>Total équipements: {{total}}</p>' : '',
        '<p><strong>Total:</strong> {{total}}</p>',
      ].filter(Boolean);
      return wrapWithStyle(lines.join(''), block.style);
    }
    case 'signature': {
      const lines = [
        `<h3>${escapeHtml(block.title || 'Validation')}</h3>`,
        block.helper ? `<p>${escapeHtml(block.helper)}</p>` : '',
        block.buttonLabel ? `<p>${escapeHtml(block.buttonLabel)}</p>` : '',
      ].filter(Boolean);
      return wrapWithStyle(lines.join(''), block.style);
    }
    case 'image': {
      if (!block.url.trim()) {
        return wrapWithStyle('<p><em>Image non renseignée</em></p>', block.style);
      }
      const align = block.align === 'center' ? 'center' : block.align === 'right' ? 'right' : 'left';
      const html = `<div style="text-align:${align};"><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || 'Image')}" style="max-width:${block.widthPercent}%;height:auto;" /></div>`;
      return wrapWithStyle(html, block.style);
    }
    case 'divider':
      return wrapWithStyle(`<hr style="border:0;border-top:${block.thickness}px ${block.lineStyle} ${block.color};" />`, block.style);
    case 'spacer':
      return wrapWithStyle(`<div style="height:${block.height}px;"></div>`, block.style);
    case 'variables': {
      const content = block.tokens.join(block.inline ? ' ' : '<br/>');
      const html = block.inline ? `<p>${content}</p>` : `<div>${content}</div>`;
      return wrapWithStyle(html, block.style);
    }
    case 'snippet':
      return wrapWithStyle(block.content, block.style);
    case 'custom_html':
      return wrapWithStyle(block.html, block.style);
    default:
      return '';
  }
};

const buildHtmlFromStudio = (studio: StudioTemplate) => {
  const accent = studio.accentColor?.trim() || '#2563eb';
  const sections = studio.blocks.map((block) => blockToHtml(block)).filter(Boolean);
  return [`[[ACCENT:${accent}]]`, ...sections].join('\n');
};

const normalizeStudio = (studio: unknown, fallbackHtml: string, docType: DocType, accentColor: string): StudioTemplate => {
  if (!studio || typeof studio !== 'object') {
    return fromHtmlToStudioFallback(fallbackHtml, docType, accentColor);
  }
  const raw = studio as Partial<StudioTemplate>;
  const fallback = fromHtmlToStudioFallback(fallbackHtml, docType, accentColor);
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  type RawStudioBlock = Record<string, unknown> & {
    type?: unknown;
    id?: unknown;
    label?: unknown;
    style?: unknown;
  };
  const blocks = rawBlocks
    .map((block) => {
      if (!block || typeof block !== 'object') return null;
      const rawBlock = block as RawStudioBlock;
      if (typeof rawBlock.type !== 'string') return null;
      const type = rawBlock.type as BlockType;
      const initial = createDefaultBlock(type);
      const merged = {
        ...initial,
        ...rawBlock,
        id: typeof rawBlock.id === 'string' && rawBlock.id.trim() ? rawBlock.id : id(),
        type,
        label: typeof rawBlock.label === 'string' ? rawBlock.label : initial.label,
        style: normalizeBlockStyle(rawBlock.style),
      } as StudioBlock;
      if (type === 'equipment_table') {
        const cols = Array.isArray(rawBlock.columns) ? rawBlock.columns.filter((c): c is string => typeof c === 'string') : [];
        (merged as EquipmentTableBlock).columns = cols.length ? cols : (initial as EquipmentTableBlock).columns;
      }
      if (type === 'variables') {
        const tokens = Array.isArray(rawBlock.tokens) ? rawBlock.tokens.filter((t): t is string => typeof t === 'string') : [];
        (merged as VariablesBlock).tokens = tokens.length ? tokens : (initial as VariablesBlock).tokens;
      }
      return merged;
    })
    .filter(Boolean) as StudioBlock[];

  return {
    version: 1,
    accentColor: normalizeColor(raw.accentColor, fallback.accentColor),
    customCss: typeof raw.customCss === 'string' ? raw.customCss : fallback.customCss,
    page: {
      backgroundColor: normalizeColor(raw.page?.backgroundColor, fallback.page.backgroundColor),
      contentPadding: normalizeNumber(raw.page?.contentPadding, fallback.page.contentPadding, 0, 120),
      blockGap: normalizeNumber(raw.page?.blockGap, fallback.page.blockGap, 0, 80),
      maxWidth: normalizeNumber(raw.page?.maxWidth, fallback.page.maxWidth, 540, 1200),
    },
    blocks: blocks.length ? blocks : fallback.blocks,
  };
};

const mergeWithDefaults = (templates: Record<string, unknown> | null | undefined, accentColor: string): TemplateMap => {
  const build = (docType: DocType): TemplatePayload => {
    const incoming = (templates?.[docType] ?? null) as Partial<TemplatePayload> | null;
    const incomingHtml = typeof incoming?.editor_html === 'string' ? incoming.editor_html : '';
    const defaultStudio = defaultStudioByDocType(docType, accentColor);
    const normalizedStudio = normalizeStudio(incoming?.studio, incomingHtml, docType, accentColor);
    const editorHtml = incomingHtml || buildHtmlFromStudio(normalizedStudio) || buildHtmlFromStudio(defaultStudio);
    return {
      ...incoming,
      editor_html: editorHtml,
      studio: normalizedStudio,
    };
  };
  return {
    devis: build('devis'),
    facture: build('facture'),
    bon_prepa: build('bon_prepa'),
  };
};

const buildPreviewHtml = (html: string, customCss: string) => {
  if (!html) return '<div class="template-preview-empty">Aucun contenu</div>';

  const previewVariables: Record<string, string> = {
    client_name: 'ACME Productions',
    client_company: 'ACME Studios',
    client_profile: 'Entreprise',
    client_email: 'contact@acme.com',
    client_phone: '+33 1 84 00 00 00',
    client_contact: 'contact@acme.com • +33 1 84 00 00 00',
    client_address: '10 Rue de la Paix, Paris',
    reference: 'DEV-2026-008',
    title: 'Tournage corporate',
    type: 'Location',
    period: '01/03/2026 → 03/03/2026',
    start_date: '01/03/2026 08:30',
    end_date: '03/03/2026 18:00',
    days: '2',
    location: 'Paris',
    delivery_date: '01/03/2026 07:45',
    total: '1 230,00€',
    company_name: 'Open RIG',
    company_legal: 'Open RIG SAS',
    company_email: 'hello@openrig.fr',
    company_phone: '+33 1 84 88 00 00',
    company_contact: 'hello@openrig.fr • +33 1 84 88 00 00',
    company_address: '5 Avenue des Champs-Élysées, Paris',
    company_siren: '123 456 789',
    company_siret: '123 456 789 00010',
    company_vat: 'FR123456789',
  };

  let rendered = html.replace(/\{\{\s*([a-z0-9_]+)\s*}}/gi, (match, key) => {
    const normalized = String(key).toLowerCase();
    return previewVariables[normalized] ?? match;
  });

  const accentMatch = rendered.match(/\[\[ACCENT:([^\]]+)]]/i);
  const accent = accentMatch ? accentMatch[1] : '#2563eb';
  rendered = rendered.replace(/\[\[ACCENT:[^\]]+]]/gi, '');

  const tableMatch = rendered.match(/\[\[TABLE:([^\]]+)]]/i);
  if (tableMatch) {
    const cols = tableMatch[1]
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    const labels: Record<string, string> = {
      equipment: 'Équipement',
      type: 'Type',
      qty: 'Qté',
      priceperday: 'PU',
      days: 'Jours',
      total: 'Total',
      checkbox: '✓',
    };
    const rows: Array<Record<string, string>> = [
      { equipment: 'Caméra 4K', type: 'Caméra', qty: '2', priceperday: '120,00€', days: '2', total: '480,00€', checkbox: '[ ]' },
      { equipment: 'Kit lumière', type: 'Lumière', qty: '1', priceperday: '60,00€', days: '2', total: '120,00€', checkbox: '[ ]' },
    ];
    const head = cols.map((col) => `<th>${labels[col] || col}</th>`).join('');
    const body = rows.map((row) => `<tr>${cols.map((col) => `<td>${row[col] || ''}</td>`).join('')}</tr>`).join('');
    rendered = rendered.replace(/\[\[TABLE:[^\]]+]]/i, `<div class="template-table-wrap"><table class="template-table"><thead style="background:${accent}"><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
  }

  const baseCss = `
    .template-preview-root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111827;line-height:1.45;font-size:13px}
    .template-preview-root p{margin:0 0 8px}
    .template-preview-root h1{font-size:24px;margin:0 0 10px}
    .template-preview-root h2{font-size:20px;margin:0 0 10px}
    .template-preview-root h3{font-size:16px;margin:0 0 8px}
    .template-table-wrap{overflow-x:auto}
    .template-table{width:100%;border-collapse:collapse;border:1px solid #d1d5db}
    .template-table th,.template-table td{padding:6px;border-top:1px solid #e5e7eb;text-align:left}
    .template-table thead th{color:#fff;border-top:none}
    .template-preview-empty{color:#6b7280}
  `;

  return `<style>${baseCss}${customCss || ''}</style><div class="template-preview-root">${rendered}</div>`;
};

const TemplateEditor: React.FC<Props> = ({ settings, onSave, canEdit = false }) => {
  const { snippets } = useCompanySnippets();

  const brandAccent = settings?.accent_color?.trim() || '#2563eb';
  const [templates, setTemplates] = useState<TemplateMap>(() => mergeWithDefaults(settings?.templates, brandAccent));
  const [docType, setDocType] = useState<DocType>('devis');
  const [studio, setStudio] = useState<StudioTemplate>(() => normalizeStudio(templates.devis.studio, templates.devis.editor_html, 'devis', brandAccent));
  const [editorHtml, setEditorHtml] = useState<string>(templates.devis.editor_html || '');
  const [studioOpen, setStudioOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<'block' | 'document' | 'css' | 'variables'>('block');
  const [editorMode, setEditorMode] = useState<'studio' | 'code'>('studio');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(studio.blocks[0]?.id ?? null);
  const [tokenQuery, setTokenQuery] = useState('');
  const [moduleQuery, setModuleQuery] = useState('');
  const [showStylePopup, setShowStylePopup] = useState(false);

  useEffect(() => {
    setTemplates(mergeWithDefaults(settings?.templates, brandAccent));
  }, [settings?.templates, brandAccent]);

  useEffect(() => {
    const current = templates[docType] || mergeWithDefaults(null, brandAccent)[docType];
    const nextStudio = normalizeStudio(current.studio, current.editor_html, docType, brandAccent);
    const nextHtml = typeof current.editor_html === 'string' && current.editor_html.trim()
      ? current.editor_html
      : buildHtmlFromStudio(nextStudio);
    setStudio(nextStudio);
    setEditorHtml(nextHtml);
    setSelectedBlockId((prev) => {
      if (prev && nextStudio.blocks.some((block) => block.id === prev)) return prev;
      return nextStudio.blocks[0]?.id ?? null;
    });
  }, [docType, templates, brandAccent]);

  const currentTemplate = templates[docType];
  const selectedBlock = studio.blocks.find((block) => block.id === selectedBlockId) || null;

  const filteredTokenGroups = useMemo(() => {
    const query = tokenQuery.trim().toLowerCase();
    if (!query) return VARIABLE_GROUPS;
    return VARIABLE_GROUPS.map((group) => ({
      ...group,
      tokens: group.tokens.filter((token) => token.label.toLowerCase().includes(query) || token.token.toLowerCase().includes(query)),
    })).filter((group) => group.tokens.length > 0);
  }, [tokenQuery]);

  const previewHtml = useMemo(() => buildPreviewHtml(editorHtml, studio.customCss), [editorHtml, studio.customCss]);
  const filteredModulesByGroup = useMemo(() => {
    const query = moduleQuery.trim().toLowerCase();
    const filtered = query
      ? MODULE_LIBRARY.filter((module) => module.label.toLowerCase().includes(query) || module.description.toLowerCase().includes(query))
      : MODULE_LIBRARY;
    const grouped = filtered.reduce<Record<string, typeof MODULE_LIBRARY>>((acc, module) => {
      if (!acc[module.group]) acc[module.group] = [];
      acc[module.group].push(module);
      return acc;
    }, {});
    return grouped;
  }, [moduleQuery]);

  const syncTemplateState = (nextStudio: StudioTemplate, nextEditorHtml: string) => {
    setStudio(nextStudio);
    setEditorHtml(nextEditorHtml);
    setTemplates((prev) => {
      const current = prev[docType] || mergeWithDefaults(null, brandAccent)[docType];
      return {
        ...prev,
        [docType]: {
          ...current,
          editor_html: nextEditorHtml,
          studio: nextStudio,
        },
      };
    });
  };

  const refreshHtmlFromStudio = (nextStudio: StudioTemplate) => {
    const html = buildHtmlFromStudio(nextStudio);
    syncTemplateState(nextStudio, html);
  };

  const updateBlock = (blockId: string, mutate: (block: StudioBlock) => StudioBlock) => {
    setStudio((prev) => {
      const index = prev.blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return prev;
      const nextBlocks = [...prev.blocks];
      nextBlocks[index] = mutate(nextBlocks[index]);
      const nextStudio: StudioTemplate = { ...prev, blocks: nextBlocks };
      const nextHtml = buildHtmlFromStudio(nextStudio);
      setEditorHtml(nextHtml);
      setTemplates((templatesPrev) => {
        const existing = templatesPrev[docType] || mergeWithDefaults(null, brandAccent)[docType];
        return {
          ...templatesPrev,
          [docType]: {
            ...existing,
            editor_html: nextHtml,
            studio: nextStudio,
          },
        };
      });
      return nextStudio;
    });
  };

  const addBlock = (type: BlockType, initialContent = '') => {
    if (!canEdit) return;
    const block = createDefaultBlock(type, initialContent);
    setStudio((prev) => {
      const nextBlocks = [...prev.blocks, block];
      const nextStudio = { ...prev, blocks: nextBlocks };
      const nextHtml = buildHtmlFromStudio(nextStudio);
      setEditorHtml(nextHtml);
      setSelectedBlockId(block.id);
      setTemplates((templatesPrev) => {
        const existing = templatesPrev[docType] || mergeWithDefaults(null, brandAccent)[docType];
        return {
          ...templatesPrev,
          [docType]: {
            ...existing,
            editor_html: nextHtml,
            studio: nextStudio,
          },
        };
      });
      return nextStudio;
    });
    setEditorMode('studio');
  };

  const removeBlock = (blockId: string) => {
    if (!canEdit) return;
    setStudio((prev) => {
      const nextBlocks = prev.blocks.filter((block) => block.id !== blockId);
      const safeBlocks = nextBlocks.length ? nextBlocks : [createDefaultBlock('text')];
      const nextStudio = { ...prev, blocks: safeBlocks };
      const nextHtml = buildHtmlFromStudio(nextStudio);
      setEditorHtml(nextHtml);
      setSelectedBlockId((currentId) => {
        if (currentId && safeBlocks.some((block) => block.id === currentId)) return currentId;
        return safeBlocks[0]?.id ?? null;
      });
      setTemplates((templatesPrev) => {
        const existing = templatesPrev[docType] || mergeWithDefaults(null, brandAccent)[docType];
        return {
          ...templatesPrev,
          [docType]: {
            ...existing,
            editor_html: nextHtml,
            studio: nextStudio,
          },
        };
      });
      return nextStudio;
    });
  };

  const duplicateBlock = (blockId: string) => {
    if (!canEdit) return;
    setStudio((prev) => {
      const index = prev.blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return prev;
      const source = prev.blocks[index];
      const clone = { ...source, id: id(), label: `${source.label} (copie)` } as StudioBlock;
      const nextBlocks = [...prev.blocks];
      nextBlocks.splice(index + 1, 0, clone);
      const nextStudio = { ...prev, blocks: nextBlocks };
      const nextHtml = buildHtmlFromStudio(nextStudio);
      setEditorHtml(nextHtml);
      setSelectedBlockId(clone.id);
      setTemplates((templatesPrev) => {
        const existing = templatesPrev[docType] || mergeWithDefaults(null, brandAccent)[docType];
        return {
          ...templatesPrev,
          [docType]: {
            ...existing,
            editor_html: nextHtml,
            studio: nextStudio,
          },
        };
      });
      return nextStudio;
    });
  };

  const moveBlock = (blockId: string, direction: 'up' | 'down') => {
    if (!canEdit) return;
    setStudio((prev) => {
      const index = prev.blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.blocks.length) return prev;
      const nextBlocks = [...prev.blocks];
      [nextBlocks[index], nextBlocks[target]] = [nextBlocks[target], nextBlocks[index]];
      const nextStudio = { ...prev, blocks: nextBlocks };
      const nextHtml = buildHtmlFromStudio(nextStudio);
      setEditorHtml(nextHtml);
      setTemplates((templatesPrev) => {
        const existing = templatesPrev[docType] || mergeWithDefaults(null, brandAccent)[docType];
        return {
          ...templatesPrev,
          [docType]: {
            ...existing,
            editor_html: nextHtml,
            studio: nextStudio,
          },
        };
      });
      return nextStudio;
    });
  };

  const applyVariableToken = (token: string) => {
    if (!canEdit) return;
    if (!selectedBlock) {
      addBlock('variables');
      return;
    }
    updateBlock(selectedBlock.id, (block) => {
      if (block.type === 'heading') return { ...block, text: `${block.text} ${token}`.trim() };
      if (block.type === 'text') return { ...block, html: `${block.html}${block.html.endsWith('>') ? '' : ' '}${token}` };
      if (block.type === 'snippet') return { ...block, content: `${block.content}${block.content.endsWith('>') ? '' : ' '}${token}` };
      if (block.type === 'custom_html') return { ...block, html: `${block.html}${token}` };
      if (block.type === 'variables') return { ...block, tokens: [...block.tokens, token] };
      return block;
    });
  };

  const rebuildStudioFromCode = () => {
    const nextStudio = fromHtmlToStudioFallback(editorHtml, docType, studio.accentColor || brandAccent);
    refreshHtmlFromStudio(nextStudio);
    setSelectedBlockId(nextStudio.blocks[0]?.id ?? null);
    setEditorMode('studio');
  };

  const handleResetTemplate = () => {
    if (!canEdit) return;
    const nextStudio = defaultStudioByDocType(docType, brandAccent);
    const nextHtml = buildHtmlFromStudio(nextStudio);
    syncTemplateState(nextStudio, nextHtml);
    setSelectedBlockId(nextStudio.blocks[0]?.id ?? null);
  };

  const handleSave = async () => {
    const normalized: TemplateMap = {
      ...templates,
      [docType]: {
        ...currentTemplate,
        editor_html: editorHtml,
        studio,
      },
    };
    setTemplates(normalized);
    await onSave(normalized);
  };

  const styleField = (label: string, value: number, onChange: (value: number) => void, min = 0, max = 120) => (
    <label className="space-y-1">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:ring-blue-500"
      />
    </label>
  );

  const renderBlockProperties = () => {
    if (!selectedBlock) {
      return <div className="text-sm text-slate-400">Sélectionnez un bloc au centre pour éditer ses propriétés.</div>;
    }

    return (
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-400">Nom du bloc</label>
          <input
            value={selectedBlock.label}
            onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block, label: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {selectedBlock.type === 'heading' && (
          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-slate-400">Texte</span>
              <input
                value={selectedBlock.text}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as HeadingBlock, text: event.target.value }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">Niveau</span>
                <select
                  value={selectedBlock.level}
                  onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as HeadingBlock, level: Number(event.target.value) as 1 | 2 | 3 }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value={1}>H1</option>
                  <option value={2}>H2</option>
                  <option value={3}>H3</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">Alignement</span>
                <select
                  value={selectedBlock.align}
                  onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as HeadingBlock, align: event.target.value as TextAlign }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="left">Gauche</option>
                  <option value="center">Centre</option>
                  <option value="right">Droite</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {selectedBlock.type === 'text' && (
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-slate-400">Contenu HTML</span>
            <textarea
              value={selectedBlock.html}
              onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as TextBlock, html: event.target.value }))}
              rows={8}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:ring-blue-500"
            />
          </label>
        )}

        {selectedBlock.type === 'client_info' && (
          <div className="space-y-2">
            {([
              { key: 'showProfile', label: 'Afficher profil client' },
              { key: 'showAddress', label: 'Afficher adresse' },
              { key: 'showContact', label: 'Afficher contact' },
            ] as Array<{ key: keyof ClientInfoBlock; label: string }>).map((option) => (
              <label key={option.key} className="flex items-center justify-between rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100">
                <span>{option.label}</span>
                <input
                  type="checkbox"
                  checked={selectedBlock[option.key]}
                  onChange={(event) => {
                    const key = option.key;
                    updateBlock(selectedBlock.id, (block) => ({ ...(block as ClientInfoBlock), [key]: event.target.checked } as ClientInfoBlock));
                  }}
                />
              </label>
            ))}
          </div>
        )}

        {selectedBlock.type === 'project_info' && (
          <div className="space-y-2">
            {([
              { key: 'showType', label: 'Afficher type' },
              { key: 'showPeriod', label: 'Afficher période' },
              { key: 'showLocation', label: 'Afficher lieu' },
              { key: 'showDelivery', label: 'Afficher livraison' },
              { key: 'showCoefficientHint', label: 'Afficher coefficient' },
            ] as Array<{ key: keyof ProjectInfoBlock; label: string }>).map((option) => (
              <label key={option.key} className="flex items-center justify-between rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100">
                <span>{option.label}</span>
                <input
                  type="checkbox"
                  checked={selectedBlock[option.key]}
                  onChange={(event) => {
                    const key = option.key;
                    updateBlock(selectedBlock.id, (block) => ({ ...(block as ProjectInfoBlock), [key]: event.target.checked } as ProjectInfoBlock));
                  }}
                />
              </label>
            ))}
          </div>
        )}

        {selectedBlock.type === 'equipment_table' && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-400">Colonnes du tableau</div>
            <div className="flex flex-wrap gap-2">
              {TABLE_COLUMNS.map((col) => {
                const active = selectedBlock.columns.some((value) => value.toLowerCase() === col.toLowerCase());
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => updateBlock(selectedBlock.id, (block) => {
                      const table = block as EquipmentTableBlock;
                      const exists = table.columns.some((value) => value.toLowerCase() === col.toLowerCase());
                      const columns = exists
                        ? table.columns.filter((value) => value.toLowerCase() !== col.toLowerCase())
                        : [...table.columns, col];
                      return { ...table, columns: columns.length ? columns : table.columns };
                    })}
                    className={`rounded-full border px-2 py-1 text-xs ${active ? 'border-blue-500 bg-blue-500/20 text-blue-200' : 'border-slate-600 text-slate-200 hover:bg-slate-800'}`}
                  >
                    {col}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedBlock.type === 'totals' && (
          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-slate-400">Titre</span>
              <input
                value={selectedBlock.title}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as TotalsBlock, title: event.target.value }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100">
              <span>Afficher le détail</span>
              <input
                type="checkbox"
                checked={selectedBlock.showBreakdown}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as TotalsBlock, showBreakdown: event.target.checked }))}
              />
            </label>
          </div>
        )}

        {selectedBlock.type === 'signature' && (
          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-slate-400">Titre</span>
              <input
                value={selectedBlock.title}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as SignatureBlock, title: event.target.value }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-slate-400">Aide</span>
              <textarea
                value={selectedBlock.helper}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as SignatureBlock, helper: event.target.value }))}
                rows={3}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-slate-400">Texte du bouton</span>
              <input
                value={selectedBlock.buttonLabel}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as SignatureBlock, buttonLabel: event.target.value }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
          </div>
        )}

        {selectedBlock.type === 'image' && (
          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-slate-400">URL image</span>
              <input
                value={selectedBlock.url}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as ImageBlock, url: event.target.value }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 block">
                <span className="text-xs font-medium text-slate-400">Largeur (%)</span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={selectedBlock.widthPercent}
                  onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as ImageBlock, widthPercent: clamp(Number(event.target.value), 10, 100) }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium text-slate-400">Alignement</span>
                <select
                  value={selectedBlock.align}
                  onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as ImageBlock, align: event.target.value as TextAlign }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="left">Gauche</option>
                  <option value="center">Centre</option>
                  <option value="right">Droite</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {selectedBlock.type === 'divider' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-400">Épaisseur</span>
              <input
                type="number"
                min={1}
                max={10}
                value={selectedBlock.thickness}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as DividerBlock, thickness: clamp(Number(event.target.value), 1, 10) }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-400">Style</span>
              <select
                value={selectedBlock.lineStyle}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as DividerBlock, lineStyle: event.target.value as 'solid' | 'dashed' }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="solid">Solide</option>
                <option value="dashed">Pointillé</option>
              </select>
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs font-medium text-slate-400">Couleur</span>
              <input
                type="color"
                value={selectedBlock.color}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as DividerBlock, color: event.target.value }))}
                className="h-10 w-20 rounded border border-slate-600 p-0"
              />
            </label>
          </div>
        )}

        {selectedBlock.type === 'spacer' && (
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-slate-400">Hauteur (px)</span>
            <input
              type="number"
              min={4}
              max={240}
              value={selectedBlock.height}
              onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as SpacerBlock, height: clamp(Number(event.target.value), 4, 240) }))}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:ring-blue-500"
            />
          </label>
        )}

        {selectedBlock.type === 'variables' && (
          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-100">
              <span>Afficher en ligne</span>
              <input
                type="checkbox"
                checked={selectedBlock.inline}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as VariablesBlock, inline: event.target.checked }))}
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs font-medium text-slate-400">Tokens (un par ligne)</span>
              <textarea
                rows={6}
                value={selectedBlock.tokens.join('\n')}
                onChange={(event) => updateBlock(selectedBlock.id, (block) => ({
                  ...block as VariablesBlock,
                  tokens: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              />
            </label>
          </div>
        )}

        {selectedBlock.type === 'snippet' && (
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-slate-400">Contenu HTML</span>
            <textarea
              rows={8}
              value={selectedBlock.content}
              onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as SnippetBlock, content: event.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:ring-blue-500"
            />
          </label>
        )}

        {selectedBlock.type === 'custom_html' && (
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-slate-400">HTML</span>
            <textarea
              rows={10}
              value={selectedBlock.html}
              onChange={(event) => updateBlock(selectedBlock.id, (block) => ({ ...block as CustomHtmlBlock, html: event.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:ring-blue-500"
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => setShowStylePopup(true)}
          className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Palette className="h-3.5 w-3.5" />
          Propriétés visuelles (popup)
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(documentLabels) as DocType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setDocType(type)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                docType === type
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {documentLabels[type]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={handleResetTemplate}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Réinitialiser
            </button>
          )}
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            <Maximize2 className="h-4 w-4" />
            Ouvrir le studio
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              Enregistrer
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Aperçu rapide</h4>
            <p className="text-xs text-gray-500">Le rendu ci-dessous simule le contenu généré par le studio.</p>
          </div>
        </div>
        <div
          className="max-h-[360px] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>

      {studioOpen && (
        <div className="fixed inset-0 z-[70] min-h-0 bg-[#2f353d] lg:pl-20">
          <div className="absolute inset-0 flex min-h-0">
            <aside className="hidden w-14 flex-col items-center gap-2 border-r border-[#31363e] bg-[#13171d] py-3 md:flex">
              {[FileText, Table2, Sparkles, LayoutPanelTop, Settings2].map((Icon, idx) => (
                <button
                  key={`rail-${idx}`}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[#2a3039] text-slate-300 hover:bg-[#1f252d]"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="border-b border-[#323843] bg-[#1a1f27] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                    {(Object.keys(documentLabels) as DocType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDocType(type)}
                        className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-xs ${
                          docType === type
                            ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                            : 'border-[#353b45] bg-[#242a33] text-slate-200 hover:bg-[#2a313b]'
                        }`}
                      >
                        {documentLabels[type]}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border border-[#3a404b] p-0.5">
                      <button
                        type="button"
                        onClick={() => setEditorMode('studio')}
                        className={`rounded px-2.5 py-1 text-xs ${editorMode === 'studio' ? 'bg-[#3b82f6] text-white' : 'text-slate-300 hover:bg-[#2a313b]'}`}
                      >
                        Studio
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode('code')}
                        className={`rounded px-2.5 py-1 text-xs ${editorMode === 'code' ? 'bg-[#3b82f6] text-white' : 'text-slate-300 hover:bg-[#2a313b]'}`}
                      >
                        Code HTML
                      </button>
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={handleSave}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
                      >
                        <Check className="h-4 w-4" />
                        Sauvegarder
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setStudioOpen(false)}
                      className="rounded-md border border-[#454c59] px-3 py-1.5 text-sm text-slate-100 hover:bg-[#2a313b]"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                <aside className="hidden w-80 border-r border-[#323843] bg-[#1c2129] lg:flex lg:flex-col">
                  <div className="border-b border-[#323843] px-3 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Insérer: blocs et modules</div>
                    <input
                      value={moduleQuery}
                      onChange={(event) => setModuleQuery(event.target.value)}
                      placeholder="Rechercher un module"
                      className="mt-3 w-full rounded-md border border-[#444b57] bg-[#12161d] px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                    {(Object.keys(MODULE_GROUP_LABELS) as Array<keyof typeof MODULE_GROUP_LABELS>).map((group) => {
                      const modules = filteredModulesByGroup[group] || [];
                      if (!modules.length) return null;
                      return (
                        <div key={group}>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            {MODULE_GROUP_LABELS[group]}
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {modules.map((module) => (
                              <button
                                key={module.type}
                                type="button"
                                onClick={() => addBlock(module.type)}
                                disabled={!canEdit || editorMode === 'code'}
                                className="rounded-lg border border-[#39404c] bg-[#252c36] px-3 py-2 text-left hover:border-blue-500/70 hover:bg-[#2d3541] disabled:opacity-50"
                              >
                                <div className="flex items-start gap-2">
                                  <module.icon className="mt-0.5 h-4 w-4 text-blue-300" />
                                  <div>
                                    <div className="text-sm font-medium text-slate-100">{module.label}</div>
                                    <div className="text-xs text-slate-400">{module.description}</div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    <div className="border-t border-[#323843] pt-4">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Phrases types</div>
                      <div className="space-y-2">
                        {snippets.map((snippet) => (
                          <button
                            key={snippet.id}
                            type="button"
                            onClick={() => addBlock('snippet', snippet.content)}
                            disabled={!canEdit || editorMode === 'code'}
                            className="w-full rounded-md border border-[#39404c] bg-[#252c36] p-2 text-left hover:border-blue-400 disabled:opacity-50"
                          >
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">{snippet.category}</div>
                            <div className="text-sm text-slate-100">{snippet.title}</div>
                            <div className="line-clamp-2 text-xs text-slate-400">{snippet.content}</div>
                          </button>
                        ))}
                        {snippets.length === 0 && (
                          <div className="rounded-md border border-[#39404c] bg-[#252c36] p-2 text-xs text-slate-400">
                            Aucune phrase type.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </aside>

                <main className="min-w-0 flex-1 overflow-auto bg-[#5b6169]">
                  {editorMode === 'studio' ? (
                    <div className="mx-auto my-8 w-[920px] max-w-[calc(100%-2rem)] rounded-sm bg-white shadow-[0_25px_60px_rgba(0,0,0,0.45)]">
                      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 text-xs text-slate-500">
                        <span>Document en cours: {documentLabels[docType]}</span>
                        <span>{studio.blocks.length} module{studio.blocks.length > 1 ? 's' : ''}</span>
                      </div>
                      <div
                        className="space-y-3 p-6"
                        style={{
                          padding: `${studio.page.contentPadding}px`,
                          backgroundColor: studio.page.backgroundColor,
                        }}
                      >
                        {studio.blocks.map((block, index) => (
                          <button
                            key={block.id}
                            type="button"
                            onClick={() => setSelectedBlockId(block.id)}
                            className={`w-full text-left ${
                              selectedBlockId === block.id
                                ? 'border border-dashed border-sky-500 bg-sky-50/70'
                                : 'border border-slate-200 bg-white'
                            } rounded-md transition`}
                          >
                            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-slate-400" />
                                <span className="text-sm font-medium text-slate-700">{block.label}</span>
                                <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                                  {block.type}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={!canEdit || index === 0}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveBlock(block.id, 'up');
                                  }}
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!canEdit || index === studio.blocks.length - 1}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveBlock(block.id, 'down');
                                  }}
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    duplicateBlock(block.id);
                                  }}
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeBlock(block.id);
                                  }}
                                  className="rounded p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <div
                              className="px-3 py-3"
                              dangerouslySetInnerHTML={{ __html: buildPreviewHtml(blockToHtml(block), studio.customCss) }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mx-auto my-8 w-[920px] max-w-[calc(100%-2rem)] space-y-3 rounded-md border border-[#313843] bg-[#1a1f27] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-100">Édition HTML brute</div>
                        <button
                          type="button"
                          onClick={rebuildStudioFromCode}
                          disabled={!canEdit}
                          className="rounded-md border border-[#4b5360] px-3 py-1.5 text-xs text-slate-100 hover:bg-[#2a313b] disabled:opacity-50"
                        >
                          Reconstruire les blocs depuis ce code
                        </button>
                      </div>
                      <textarea
                        value={editorHtml}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEditorHtml(value);
                          setTemplates((prev) => {
                            const existing = prev[docType] || mergeWithDefaults(null, brandAccent)[docType];
                            return {
                              ...prev,
                              [docType]: {
                                ...existing,
                                editor_html: value,
                                studio,
                              },
                            };
                          });
                        }}
                        rows={30}
                        className="w-full rounded-md border border-[#4b5360] bg-[#0f1318] px-3 py-2 font-mono text-xs text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </main>

                <aside className="w-[360px] max-w-[42vw] border-l border-[#323843] bg-[#1b2028]">
                  <div className="flex h-full min-h-0">
                    <div className="flex w-12 flex-col items-center gap-2 border-r border-[#323843] py-3">
                      {[
                        { key: 'block', icon: Settings2, label: 'Bloc' },
                        { key: 'document', icon: FileText, label: 'Document' },
                        { key: 'css', icon: Palette, label: 'CSS' },
                        { key: 'variables', icon: Sparkles, label: 'Variables' },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setPanelTab(tab.key as typeof panelTab)}
                          className={`flex h-9 w-9 items-center justify-center rounded-md border text-xs ${
                            panelTab === tab.key
                              ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                              : 'border-[#3d4451] text-slate-300 hover:bg-[#2a313b]'
                          }`}
                          title={tab.label}
                        >
                          <tab.icon className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                      {panelTab === 'block' && (
                        <div className="rounded-lg border border-[#3b424f] bg-[#242a34] p-3 text-slate-100">
                          {renderBlockProperties()}
                        </div>
                      )}

                      {panelTab === 'document' && (
                        <div className="space-y-4 rounded-lg border border-[#3b424f] bg-[#242a34] p-3 text-slate-100">
                          <div className="text-sm font-semibold">Propriétés document</div>
                          <label className="space-y-1 block">
                            <span className="text-xs text-slate-400">Couleur accent</span>
                            <input
                              type="color"
                              value={studio.accentColor}
                              onChange={(event) => {
                                const nextStudio = { ...studio, accentColor: event.target.value };
                                refreshHtmlFromStudio(nextStudio);
                              }}
                              className="h-10 w-20 rounded border border-slate-600 p-0"
                            />
                          </label>
                          <label className="space-y-1 block">
                            <span className="text-xs text-slate-400">Fond canvas</span>
                            <input
                              type="color"
                              value={studio.page.backgroundColor}
                              onChange={(event) => {
                                const nextStudio = {
                                  ...studio,
                                  page: { ...studio.page, backgroundColor: event.target.value },
                                };
                                refreshHtmlFromStudio(nextStudio);
                              }}
                              className="h-10 w-20 rounded border border-slate-600 p-0"
                            />
                          </label>
                          {styleField('Padding contenu (px)', studio.page.contentPadding, (value) => {
                            const nextStudio = {
                              ...studio,
                              page: { ...studio.page, contentPadding: clamp(value, 0, 120) },
                            };
                            refreshHtmlFromStudio(nextStudio);
                          })}
                          {styleField('Espacement blocs (px)', studio.page.blockGap, (value) => {
                            const nextStudio = {
                              ...studio,
                              page: { ...studio.page, blockGap: clamp(value, 0, 80) },
                            };
                            refreshHtmlFromStudio(nextStudio);
                          }, 0, 80)}
                          {styleField('Largeur max canvas (px)', studio.page.maxWidth, (value) => {
                            const nextStudio = {
                              ...studio,
                              page: { ...studio.page, maxWidth: clamp(value, 540, 1200) },
                            };
                            refreshHtmlFromStudio(nextStudio);
                          }, 540, 1200)}
                        </div>
                      )}

                      {panelTab === 'css' && (
                        <div className="space-y-3 rounded-lg border border-[#3b424f] bg-[#242a34] p-3 text-slate-100">
                          <div className="text-sm font-semibold">CSS personnalisé</div>
                          <p className="text-xs text-slate-400">
                            Ce CSS est appliqué à l’aperçu du template et au mode studio.
                          </p>
                          <textarea
                            rows={18}
                            value={studio.customCss}
                            onChange={(event) => {
                              const nextStudio = { ...studio, customCss: event.target.value };
                              syncTemplateState(nextStudio, editorHtml);
                            }}
                            className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                            placeholder=".template-preview-root h1 { letter-spacing: 0.4px; }"
                          />
                        </div>
                      )}

                      {panelTab === 'variables' && (
                        <div className="space-y-3 rounded-lg border border-[#3b424f] bg-[#242a34] p-3 text-slate-100">
                          <div className="text-sm font-semibold">Variables dynamiques</div>
                          <input
                            value={tokenQuery}
                            onChange={(event) => setTokenQuery(event.target.value)}
                            placeholder="Rechercher une variable"
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                          />
                          <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
                            {filteredTokenGroups.map((group) => (
                              <div key={group.label}>
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</div>
                                <div className="flex flex-wrap gap-2">
                                  {group.tokens.map((token) => (
                                    <button
                                      key={token.token}
                                      type="button"
                                      onClick={() => applyVariableToken(token.token)}
                                      className="rounded-full border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-blue-400 hover:bg-slate-700"
                                    >
                                      {token.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {showStylePopup && selectedBlock && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Propriétés visuelles · {selectedBlock.label}</div>
                <div className="text-xs text-slate-400">Marges, couleurs, bordures, padding.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowStylePopup(false)}
                className="rounded-md border border-slate-600 p-1.5 text-slate-300 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {styleField('Marge haute', selectedBlock.style.marginTop, (value) => updateBlock(selectedBlock.id, (block) => ({
                ...block,
                style: { ...block.style, marginTop: clamp(value, 0, 200) },
              })), 0, 200)}
              {styleField('Marge basse', selectedBlock.style.marginBottom, (value) => updateBlock(selectedBlock.id, (block) => ({
                ...block,
                style: { ...block.style, marginBottom: clamp(value, 0, 200) },
              })), 0, 200)}
              {styleField('Padding', selectedBlock.style.padding, (value) => updateBlock(selectedBlock.id, (block) => ({
                ...block,
                style: { ...block.style, padding: clamp(value, 0, 120) },
              })), 0, 120)}
              {styleField('Rayon', selectedBlock.style.radius, (value) => updateBlock(selectedBlock.id, (block) => ({
                ...block,
                style: { ...block.style, radius: clamp(value, 0, 60) },
              })), 0, 60)}
              {styleField('Bordure (px)', selectedBlock.style.borderWidth, (value) => updateBlock(selectedBlock.id, (block) => ({
                ...block,
                style: { ...block.style, borderWidth: clamp(value, 0, 12) },
              })), 0, 12)}

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">Couleur bordure</span>
                <input
                  type="color"
                  value={selectedBlock.style.borderColor}
                  onChange={(event) => updateBlock(selectedBlock.id, (block) => ({
                    ...block,
                    style: { ...block.style, borderColor: event.target.value },
                  }))}
                  className="h-10 w-20 rounded border border-slate-600 p-0"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">Fond</span>
                <input
                  type="color"
                  value={selectedBlock.style.backgroundColor === 'transparent' ? '#ffffff' : selectedBlock.style.backgroundColor}
                  onChange={(event) => updateBlock(selectedBlock.id, (block) => ({
                    ...block,
                    style: { ...block.style, backgroundColor: event.target.value },
                  }))}
                  className="h-10 w-20 rounded border border-slate-600 p-0"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-400">Texte</span>
                <input
                  type="color"
                  value={selectedBlock.style.textColor}
                  onChange={(event) => updateBlock(selectedBlock.id, (block) => ({
                    ...block,
                    style: { ...block.style, textColor: event.target.value },
                  }))}
                  className="h-10 w-20 rounded border border-slate-600 p-0"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStylePopup(false)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
              >
                Terminer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateEditor;
