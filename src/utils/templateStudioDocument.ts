export type TemplateStudioDocumentType = 'devis' | 'facture' | 'bon_prepa';

const isRecord = (value: unknown): value is Record<string, any> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

export const createBlankTemplateStudioSnapshot = (): Record<string, any> => ({
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
  },
  blocks: [],
  layerGroups: [],
  updated_at: new Date().toISOString(),
});

const getTemplateSnapshotFromLibrary = (
  templatesRoot: Record<string, any>,
  docType: TemplateStudioDocumentType
): Record<string, any> | null => {
  const common = isRecord(templatesRoot.studio_common_library)
    ? templatesRoot.studio_common_library
    : null;
  if (!common) return null;

  const templates = Array.isArray(common.templates) ? common.templates : [];
  if (templates.length === 0) return null;

  const rawActiveByDoc = isRecord(common.active_template_by_doc)
    ? common.active_template_by_doc
    : {};
  const selectedId = typeof rawActiveByDoc[docType] === 'string'
    ? rawActiveByDoc[docType]
    : '';
  const selectedTemplate = templates.find((entry) => isRecord(entry) && entry.id === selectedId)
    ?? templates.find((entry) => isRecord(entry))
    ?? null;
  if (!isRecord(selectedTemplate)) return null;

  const byDoc = isRecord(selectedTemplate.studio_by_doc)
    ? selectedTemplate.studio_by_doc
    : {};
  const byDocSnapshot = byDoc[docType];
  if (isRecord(byDocSnapshot)) {
    return byDocSnapshot;
  }

  if (isRecord(selectedTemplate.studio)) {
    return selectedTemplate.studio;
  }

  return null;
};

export const resolveTemplateStudioSnapshotForDoc = (
  templatesInput: unknown,
  docType: TemplateStudioDocumentType
): Record<string, any> => {
  const templatesRoot = isRecord(templatesInput)
    ? templatesInput
    : {};

  const fromLibrary = getTemplateSnapshotFromLibrary(templatesRoot, docType);
  if (isRecord(fromLibrary)) {
    return fromLibrary;
  }

  const docEntry = isRecord(templatesRoot[docType])
    ? templatesRoot[docType]
    : {};
  if (isRecord(docEntry.studio)) {
    return docEntry.studio;
  }

  return createBlankTemplateStudioSnapshot();
};
