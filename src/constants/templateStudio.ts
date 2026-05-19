export const TEMPLATE_STUDIO_SAVE_EVENT            = 'template-studio:save';
export const TEMPLATE_STUDIO_PDF_PREVIEW_REQUEST   = 'template-studio:pdf-preview-request';
export const TEMPLATE_STUDIO_PDF_PREVIEW_READY     = 'template-studio:pdf-preview-ready';
export const TEMPLATE_STUDIO_DOM_CAPTURE_REQUEST   = 'template-studio:dom-capture-request';
export const TEMPLATE_STUDIO_DOM_CAPTURE_READY     = 'template-studio:dom-capture-ready';

export const TEMPLATE_STUDIO_DOC_PARAM = 'doc';

export const TEMPLATE_STUDIO_DOCUMENT_TYPES = [
  { key: 'devis', label: 'Devis' },
  { key: 'facture', label: 'Facture' },
  { key: 'bon_prepa', label: 'Bon de préparation' },
] as const;

export type TemplateStudioDocumentType = (typeof TEMPLATE_STUDIO_DOCUMENT_TYPES)[number]['key'];

export const DEFAULT_TEMPLATE_STUDIO_DOCUMENT_TYPE: TemplateStudioDocumentType = 'devis';

export const normalizeTemplateStudioDocumentType = (value: string | null | undefined): TemplateStudioDocumentType => {
  if (!value) return DEFAULT_TEMPLATE_STUDIO_DOCUMENT_TYPE;
  const match = TEMPLATE_STUDIO_DOCUMENT_TYPES.find((entry) => entry.key === value);
  return match ? match.key : DEFAULT_TEMPLATE_STUDIO_DOCUMENT_TYPE;
};

export const getTemplateStudioDocumentLabel = (value: string | null | undefined): string => {
  const key = normalizeTemplateStudioDocumentType(value);
  const match = TEMPLATE_STUDIO_DOCUMENT_TYPES.find((entry) => entry.key === key);
  return match ? match.label : 'Document';
};
