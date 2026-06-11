import React, { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, Upload, FileText, Sparkles, Info, RefreshCcw, Layers3, MessageCircle, Mail, Send, Loader2, Calculator, CalendarDays, Copy, Link2, Download, Bug } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasPerm } from '../utils/perm';
import { useCompanySettings } from '../hooks/useCompanySettings';
import EquipmentCategoriesManager from '../components/settings/EquipmentCategoriesManager';
import BugReportsPanel from '../components/settings/BugReportsPanel';
import { isFeatureEnabled } from '../utils/features';
import { DocumentTableDesign, DEFAULT_DOCUMENT_DESIGN, normalizeDocumentDesign } from '../utils/documentDesign';
import { buildRentalDocument, type DocumentClientInfo } from '../utils/rentalDocumentPdf';
import { LegalCompanyInfo } from '../utils/documentLegalFooter';
import { fetchCompanyLogoDataUrl, invalidateCompanyLogoDataUrl, resolveDocumentDesignImages } from '../utils/documentImages';
import { resolveTemplateStudioSnapshotForDoc } from '../utils/templateStudioDocument';
import { Rental } from '../types/rental';
import {
  computeAutomaticCoefficient,
  evaluateCoefficientFormula,
  normalizeRentalCoefficientMode,
  parseCoefficientFormula,
  RentalCoefficientMode,
} from '../utils/rentalCoefficient';

type TabId = 'company' | 'documents' | 'coefficients' | 'features' | 'categories' | 'bug_reports' | 'about' | 'smtp' | 'ical';

const COMPANY_TAB_IDS: TabId[] = ['company', 'documents', 'coefficients', 'features', 'categories', 'bug_reports', 'about', 'smtp', 'ical'];
const isCompanyTabId = (v: string | null): v is TabId => !!v && COMPANY_TAB_IDS.includes(v as TabId);

const DEFAULT_DOC_DESIGN = DEFAULT_DOCUMENT_DESIGN;
const COMPANY_LOGO_BUCKET = 'company-assets';
const LOGO_PLACEHOLDER_LARGE = 'https://dummyimage.com/160x160/e5e7eb/9ca3af&text=LOGO';
const LOGO_PLACEHOLDER_SMALL = 'https://dummyimage.com/40x40/e5e7eb/9ca3af&text=LOGO';

const PREVIEW_RENTAL: Rental = {
  id: 'preview-rental',
  client_id: 'preview-client',
  client_name: 'ACME Productions',
  reference_code: 'OR-2025-009',
  type: 'rental',
  start_date: '2025-02-12T08:00:00.000Z',
  end_date: '2025-02-14T08:00:00.000Z',
  location: 'Paris',
  status: 'confirmed',
  total_price: 0,
  generate_invoice: false,
  items: [
    {
      id: 'preview-item-1',
      equipment_id: null,
      equipment_name: 'Caméra 4K',
      equipment_type: 'Caméra',
      quantity: 2,
      price_per_day: 120,
    },
    {
      id: 'preview-item-2',
      equipment_id: null,
      equipment_name: 'Micro HF',
      equipment_type: 'Audio',
      quantity: 4,
      price_per_day: 25,
    },
    {
      id: 'preview-item-3',
      equipment_id: null,
      equipment_name: 'Kit lumière',
      equipment_type: 'Lumière',
      quantity: 1,
      price_per_day: 60,
    },
  ],
  item_groups: [],
  maintenance_charges: [],
  created_at: '2025-02-01T09:00:00.000Z',
};

const PREVIEW_CLIENT: DocumentClientInfo = {
  name: 'Camille Dubois',
  company: 'ACME Productions',
  address: '10 rue des Forges, 75011 Paris',
  email: 'camille.dubois@acme.com',
  phone: '+33 1 23 45 67 89',
};

const PREVIEW_DELIVERY_DATE = '2025-02-12T10:00:00.000Z';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const LOGO_BASE_WIDTH = 140;
const LOGO_BASE_HEIGHT = 70;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEFAULT_RENTAL_COEF_FORMULA = '1 + (x - 1) * 0.6';
const FIXED_RENTAL_EXAMPLE_BASE_PRICE = 120;
const FIXED_RENTAL_EXAMPLE_DAYS = Array.from({ length: 10 }, (_, index) => index + 1);
const generateIcalToken = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
};

const buildIcalUrls = (token: string | null, baseUrl: string) => {
  if (!token || !baseUrl) {
    return { icalUrl: '', webcalUrl: '', webcalsUrl: '', googleUrl: '' };
  }
  const icalUrl = `${baseUrl}/api/ical/${token}`;
  const webcalUrl = icalUrl.replace(/^https?:\/\//, 'webcal://');
  const webcalsUrl = icalUrl.replace(/^https?:\/\//, 'webcals://');
  const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(icalUrl)}`;
  return { icalUrl, webcalUrl, webcalsUrl, googleUrl };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseFeaturesMap = (raw: unknown): Record<string, any> => {
  if (!raw) return {};
  try {
    const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (map && typeof map === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { ...(map as Record<string, any>) };
    }
  } catch (err) {
    console.warn('features parse error', err);
  }
  return {};
};

const extractStoragePath = (url: string | null): string | null => {
  if (!url) return null;
  const bucketPattern = escapeRegExp(COMPANY_LOGO_BUCKET);
  const matcher = new RegExp(`/storage/v1/object/public/${bucketPattern}/(.+)$`);
  const match = url.match(matcher);
  return match ? match[1] : null;
};

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
    } else {
      reject(new Error('invalid_result'));
    }
  };
  reader.onerror = () => reject(reader.error || new Error('read_error'));
  reader.readAsDataURL(file);
});

const logoErrorMessage = (code?: string | null) => {
  switch (code) {
    case 'logo_invalid_type':
      return 'Format de fichier non pris en charge.';
    case 'logo_invalid_data':
      return 'Le fichier sélectionné est invalide.';
    case 'logo_too_large':
      return 'Le fichier dépasse la taille maximale autorisée (2 Mo).';
    case 'supabase_not_ready':
      return 'Configurez Supabase avant de téléverser un logo.';
    default:
      return "Impossible de téléverser le logo";
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabs: { id: TabId; label: string; icon: React.FC<any> }[] = [
  { id: 'company', label: 'Entreprise', icon: Building2 },
  { id: 'documents', label: 'Modèles de documents', icon: FileText },
  { id: 'coefficients', label: 'Coefficients de location', icon: Calculator },
  { id: 'features', label: 'Fonctionnalités', icon: Sparkles },
  { id: 'categories', label: 'Catégories matériel', icon: Layers3 },
  { id: 'bug_reports', label: 'Reports de bugs', icon: Bug },
  { id: 'smtp', label: 'Serveur SMTP', icon: Mail },
  { id: 'ical', label: 'Intégration iCal', icon: CalendarDays },
  { id: 'about', label: 'À propos', icon: Info },
];

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }>
  = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
    aria-pressed={checked}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`}
    />
    {label && <span className="sr-only">{label}</span>}
  </button>
);

const SectionTitle: React.FC<{ title: string; description?: string }>
  = ({ title, description }) => (
  <div className="mb-4">
    <h3 className="text-sm font-medium text-gray-900">{title}</h3>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
  </div>
);

const CompanySettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState<TabId>(() => {
    const t = searchParams.get('tab');
    return isCompanyTabId(t) ? t : 'company';
  });

  const handleTabChange = (next: TabId) => {
    setActive(next);
    setSearchParams({ tab: next }, { replace: true });
  };
  const { user } = useAuth();
  const canView = hasPerm(user, 'cs_view_company');
  const canEdit = hasPerm(user, 'cs_edit_company');

  const { settings, saveSettings } = useCompanySettings();
  // Entreprise
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [siren, setSiren] = useState('');
  const [vat, setVat] = useState('');
  const [isAutoEntrepreneur, setIsAutoEntrepreneur] = useState(false);
  const [inventoryCyclePeriodDays, setInventoryCyclePeriodDays] = useState('30');
  const [inventoryCycleFullEvery, setInventoryCycleFullEvery] = useState('6');
  const [inventoryCycleAnchorDate, setInventoryCycleAnchorDate] = useState('');
  const [siret, setSiret] = useState('');
  const [naf, setNaf] = useState('');
  const [capital, setCapital] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [about, setAbout] = useState('');
  const [logo, setLogo] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const [accent, setAccent] = useState('#2563eb');
  const [secondary, setSecondary] = useState('#111827');

  const [fullExporting, setFullExporting] = useState(false);

  type AppUpdateStatus = {
    ok?: boolean;
    currentVersion?: string | null;
    remoteVersion?: string | null;
    commitsBehind?: number | null;
    branch?: string | null;
    updateAvailable?: boolean;
    lastCheckedAt?: string | null;
    error?: string | null;
    errorDetail?: string | null;
  };
  type AppUpdateResult = {
    newVersion: string | null;
    changelog: string[];
    npmInstalled: boolean;
    needsRestart: boolean;
  };
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateApplying, setUpdateApplying] = useState(false);
  const [updateResult, setUpdateResult] = useState<AppUpdateResult | null>(null);
  const [updateDirtyFiles, setUpdateDirtyFiles] = useState<string[] | null>(null);

  const fetchUpdateStatus = async (refresh: boolean) => {
    setUpdateChecking(true);
    try {
      const res = await fetch(`/api/system/update/status${refresh ? '?refresh=1' : ''}`);
      const data: AppUpdateStatus = await res.json();
      setUpdateStatus(data);
      if (refresh) {
        if (data.error) {
          toast.error('Vérification impossible : ' + (data.errorDetail || data.error));
        } else if (data.updateAvailable) {
          toast.success(`Mise à jour disponible : ${data.remoteVersion || 'nouvelle version'}`);
        } else {
          toast.success('OpenRig est à jour.');
        }
      }
    } catch (err) {
      console.error('update status', err);
      if (refresh) toast.error('Vérification des mises à jour impossible.');
    } finally {
      setUpdateChecking(false);
    }
  };

  const applyAppUpdate = async (force = false) => {
    setUpdateApplying(true);
    setUpdateDirtyFiles(null);
    try {
      const res = await fetch('/api/system/update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.error === 'working_tree_dirty') {
        setUpdateDirtyFiles(Array.isArray(data.files) ? data.files : []);
        toast.error('Des modifications locales bloquent la mise à jour.');
        return;
      }
      if (!res.ok || !data?.ok) {
        toast.error('Mise à jour échouée : ' + (data?.errorDetail || data?.error || res.status));
        return;
      }
      if (!data.updated) {
        toast.success('OpenRig est déjà à jour.');
      } else {
        setUpdateResult({
          newVersion: data.newVersion ?? null,
          changelog: Array.isArray(data.changelog) ? data.changelog : [],
          npmInstalled: Boolean(data.npmInstalled),
          needsRestart: Boolean(data.needsRestart),
        });
        toast.success(`Mise à jour installée : ${data.newVersion || ''}`);
      }
      await fetchUpdateStatus(false);
    } catch (err) {
      console.error('update apply', err);
      toast.error('Mise à jour impossible (serveur injoignable ?).');
    } finally {
      setUpdateApplying(false);
    }
  };

  useEffect(() => {
    if (active === 'about' && !updateStatus && !updateChecking) {
      void fetchUpdateStatus(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const [mailHost, setMailHost] = useState('');
  const [mailPort, setMailPort] = useState('');
  const [mailSecure, setMailSecure] = useState(false);
  const [mailUser, setMailUser] = useState('');
  const [mailPass, setMailPass] = useState('');
  const [mailHasPass, setMailHasPass] = useState(false);
  const [mailLoading, setMailLoading] = useState(true);
  const [mailSaving, setMailSaving] = useState(false);
  const [mailTesting, setMailTesting] = useState(false);
  const [mailTestEmail, setMailTestEmail] = useState('');

  const [featureBillingManual, setFeatureBillingManual] = useState(true);
  const [featurePersonnelChat, setFeaturePersonnelChat] = useState(false);
  const [rentalCoefficientMode, setRentalCoefficientMode] = useState<RentalCoefficientMode>('none');
  const [rentalCoefficientFormula, setRentalCoefficientFormula] = useState(DEFAULT_RENTAL_COEF_FORMULA);
  const [docDesign, setDocDesign] = useState<DocumentTableDesign>(DEFAULT_DOC_DESIGN);
  const [docDragTarget, setDocDragTarget] = useState<'background' | 'logo'>('background');
  const [docPreviewDesign, setDocPreviewDesign] = useState<DocumentTableDesign>(DEFAULT_DOC_DESIGN);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const docPreviewUrlRef = useRef<string | null>(null);
  const docPreviewEnabled = false;
  const [icalEnabled, setIcalEnabled] = useState(false);
  const [icalToken, setIcalToken] = useState('');
  const [icalSaving, setIcalSaving] = useState(false);

  const updateDocDesign = <K extends keyof DocumentTableDesign>(key: K, value: DocumentTableDesign[K]) => {
    setDocDesign(prev => ({ ...prev, [key]: value }));
  };

  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    target: 'background' | 'logo';
  } | null>(null);

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = docDragTarget;
    const canDragBackground = target === 'background' && !!docDesign.backgroundImageUrl?.trim();
    const logoSrc = (docDesign.logoImageUrl || logo || '').trim();
    const canDragLogo = target === 'logo' && !!logoSrc;
    if (!canDragBackground && !canDragLogo) return;
    if (!previewRef.current) return;
    previewRef.current.setPointerCapture(event.pointerId);
    setIsDraggingPreview(true);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: target === 'logo' ? docDesign.logoPositionX : docDesign.backgroundPositionX,
      originY: target === 'logo' ? docDesign.logoPositionY : docDesign.backgroundPositionY,
      target,
    };
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;
    const nextX = Math.min(100, Math.max(0, dragStateRef.current.originX + (deltaX / rect.width) * 100));
    const nextY = Math.min(100, Math.max(0, dragStateRef.current.originY + (deltaY / rect.height) * 100));
    if (dragStateRef.current.target === 'logo') {
      updateDocDesign('logoPositionX', nextX);
      updateDocDesign('logoPositionY', nextY);
      return;
    }
    updateDocDesign('backgroundPositionX', nextX);
    updateDocDesign('backgroundPositionY', nextY);
  };

  const handlePreviewPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!previewRef.current || !dragStateRef.current) return;
    previewRef.current.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    setIsDraggingPreview(false);
    setDocPreviewDesign(docDesign);
  };

  const handleBackgroundImageUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await toBase64(file);
      updateDocDesign('backgroundImageUrl', dataUrl);
      setDocDragTarget('background');
      toast.success('Image de fond mise à jour');
    } catch (err) {
      console.error('upload background image', err);
      toast.error("Impossible de charger l'image");
    }
  };

  const resetBackgroundPosition = () => {
    updateDocDesign('backgroundPositionX', DEFAULT_DOC_DESIGN.backgroundPositionX);
    updateDocDesign('backgroundPositionY', DEFAULT_DOC_DESIGN.backgroundPositionY);
  };

  const handleLogoImageUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await toBase64(file);
      updateDocDesign('logoImageUrl', dataUrl);
      setDocDragTarget('logo');
      toast.success('Logo du document mis à jour');
    } catch (err) {
      console.error('upload document logo', err);
      toast.error("Impossible de charger le logo");
    }
  };

  const resetLogoPosition = () => {
    updateDocDesign('logoPositionX', DEFAULT_DOC_DESIGN.logoPositionX);
    updateDocDesign('logoPositionY', DEFAULT_DOC_DESIGN.logoPositionY);
  };

  useEffect(() => {
    if (active !== 'documents') return;
    if (isDraggingPreview) return;
    const timer = window.setTimeout(() => {
      setDocPreviewDesign(docDesign);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [active, docDesign, isDraggingPreview]);

  useEffect(() => {
    if (active !== 'documents') return;
    if (!previewRef.current) return;
    const element = previewRef.current;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setPreviewSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!docPreviewEnabled) return;
    if (active !== 'documents') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setDocPreviewLoading(true);
        const { Document, Page, Text, View, StyleSheet, Image, pdf } = await import('@react-pdf/renderer');
        const templatesRoot = (settings as any)?.templates || {};
        const template = templatesRoot?.devis || {};
        const editorHtml = typeof template.editor_html === 'string' ? template.editor_html : '';
        const studioTemplate = resolveTemplateStudioSnapshotForDoc(templatesRoot, 'devis');
        const previewCompany: LegalCompanyInfo = {
          name: name || 'OpenRig',
          legalName,
          logoUrl: companyLogoUrl || null,
          capital,
          address: address || 'Adresse non renseignée',
          phone,
          email,
          siren,
          siret,
          naf,
          vat,
          isAutoEntrepreneur,
        };
        const logoDataUrl = await fetchCompanyLogoDataUrl();
        const logoFallback = pickLogoUrl(logo, logoDataUrl);
        const resolvedDesign = await resolveDocumentDesignImages(docPreviewDesign, logoFallback || null);
        const Doc = buildRentalDocument({
          renderer: { Document, Page, Text, View, StyleSheet, Image },
          rental: PREVIEW_RENTAL,
          docType: 'devis',
          documentDesign: resolvedDesign,
          editorHtml,
          studioTemplate,
          payments: [],
          company: previewCompany,
          client: PREVIEW_CLIENT,
          deliveryDate: PREVIEW_DELIVERY_DATE,
        });
        const blob = await pdf(Doc).toBlob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (docPreviewUrlRef.current) {
          URL.revokeObjectURL(docPreviewUrlRef.current);
        }
        docPreviewUrlRef.current = url;
        setDocPreviewUrl(url);
      } catch (err) {
        console.error('document preview', err);
        if (!cancelled) {
          setDocPreviewUrl(null);
        }
      } finally {
        if (!cancelled) {
          setDocPreviewLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, docPreviewDesign, settings?.templates, name, legalName, logo, capital, address, phone, email, siren, siret, naf, vat, isAutoEntrepreneur, docPreviewEnabled]);

  useEffect(() => () => {
    if (docPreviewUrlRef.current) {
      URL.revokeObjectURL(docPreviewUrlRef.current);
    }
  }, []);

  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    const previousLogo = logo;
    const previousPath = logoPath;
    const previewUrl = URL.createObjectURL(file);
    setLogo(previewUrl);
    setLogoUploading(true);
    try {
      const dataUrl = await toBase64(file);
      const payload = {
        data: dataUrl,
        contentType: file.type || 'image/png',
      };
      const response = await fetch('/api/system/company-setup/logo-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        const code = typeof body?.error === 'string' ? body.error : null;
        throw new Error(code || 'upload_failed');
      }

      const publicUrl = typeof body?.url === 'string' && body.url ? body.url : previewUrl;
      const storagePath = typeof body?.path === 'string' ? body.path : null;

      setLogo(publicUrl);
      setLogoPath(storagePath);
      invalidateCompanyLogoDataUrl();
      toast.success('Logo mis à jour');
    } catch (error) {
      console.error('upload company logo', error);
      setLogo(previousLogo);
      setLogoPath(previousPath);
      const message = error instanceof Error ? logoErrorMessage(error.message) : logoErrorMessage();
      toast.error(message);
    } finally {
      setLogoUploading(false);
      URL.revokeObjectURL(previewUrl);
    }
  };

  const buildFeaturesPayload = () => {
    const base = parseFeaturesMap(settings?.features);
    delete base.document_design;
    return {
      ...base,
      billing_manual: featureBillingManual,
      personnel_chat: featurePersonnelChat,
    };
  };

  useEffect(() => {
    if (!settings) return;
    setName(settings.name || '');
    setLegalName(settings.legal_name || '');
    setSiren(settings.siren || '');
    setVat(settings.vat || '');
    setIsAutoEntrepreneur(Boolean(settings.is_auto_entrepreneur));
    setInventoryCyclePeriodDays(String(Math.max(1, Number(settings.inventory_cycle_period_days ?? 30) || 30)));
    setInventoryCycleFullEvery(String(Math.max(1, Number(settings.inventory_cycle_full_every ?? 6) || 6)));
    setInventoryCycleAnchorDate(settings.inventory_cycle_anchor_date || '');
    setSiret(settings.siret || '');
    setNaf(settings.naf || '');
    setCapital(settings.capital || '');
    setEmail(settings.email || '');
    setPhone(settings.phone || '');
    setAddress(settings.address || '');
    setAbout(settings.about || '');
    setLogo(settings.logo_url || '');
    setLogoPath(extractStoragePath(settings.logo_url || null));
    setAccent(settings.accent_color || '#2563eb');
    setSecondary(settings.secondary_color || '#111827');
    const featuresMap = parseFeaturesMap(settings.features);
    if ('billing_manual' in featuresMap) {
      setFeatureBillingManual(Boolean(featuresMap.billing_manual));
    } else {
      setFeatureBillingManual(isFeatureEnabled(settings, 'billing_manual', true));
    }

    if ('personnel_chat' in featuresMap) {
      setFeaturePersonnelChat(Boolean(featuresMap.personnel_chat));
    } else {
      setFeaturePersonnelChat(isFeatureEnabled(settings, 'personnel_chat', false));
    }

    const coefficientMode = normalizeRentalCoefficientMode(settings.rental_coefficient_mode);
    setRentalCoefficientMode(coefficientMode);
    setRentalCoefficientFormula(settings.rental_coefficient_formula || DEFAULT_RENTAL_COEF_FORMULA);
    const normalizedDesign = normalizeDocumentDesign(settings.document_design);
    setDocDesign(normalizedDesign);
    setDocPreviewDesign(normalizedDesign);
    setIcalEnabled(Boolean(settings.ical_enabled));
    setIcalToken(settings.ical_token || '');
  }, [settings]);

  useEffect(() => {
    let isMounted = true;
    const loadMailConfig = async () => {
      try {
        setMailLoading(true);
        const res = await fetch('/api/system/mail-config');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!isMounted) return;
        setMailHost(data?.host ?? '');
        setMailPort(data?.port ? String(data.port) : '');
        setMailSecure(Boolean(data?.secure));
        setMailUser(data?.user ?? '');
        setMailHasPass(Boolean(data?.hasPass));
      } catch (err) {
        console.error('load mail config', err);
        if (isMounted) toast.error('Impossible de charger la configuration SMTP');
      } finally {
        if (isMounted) setMailLoading(false);
      }
    };
    loadMailConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (settings?.email && !mailTestEmail) {
      setMailTestEmail(settings.email);
    }
  }, [settings?.email, mailTestEmail]);

  useEffect(() => {
    let cancelled = false;
    if (!logo && !settings?.logo_url) {
      setLogoDataUrl(null);
      return () => {
        cancelled = true;
      };
    }
    fetchCompanyLogoDataUrl({ force: true }).then((dataUrl) => {
      if (!cancelled) {
        setLogoDataUrl(dataUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [logo, settings?.logo_url]);

  const saveMailConfig = async () => {
    setMailSaving(true);
    try {
      const payload: Record<string, unknown> = {
        host: mailHost.trim(),
        port: mailPort.trim(),
        secure: mailSecure,
        user: mailUser.trim(),
      };
      if (mailPass.trim()) {
        payload.pass = mailPass;
      }
      const res = await fetch('/api/system/mail-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setMailHost(data?.host ?? '');
      setMailPort(data?.port ? String(data.port) : '');
      setMailSecure(Boolean(data?.secure));
      setMailUser(data?.user ?? '');
      setMailHasPass(Boolean(data?.hasPass));
      setMailPass('');
      toast.success('Configuration SMTP enregistrée');
    } catch (err) {
      console.error('save mail config', err);
      toast.error("Impossible d'enregistrer la configuration SMTP");
    } finally {
      setMailSaving(false);
    }
  };

  const testMailConfig = async () => {
    setMailTesting(true);
    try {
      const trimmed = mailTestEmail.trim();
      const body: Record<string, string> = {};
      if (trimmed) body.to = trimmed;
      const res = await fetch('/api/system/mail-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `status ${res.status}`);
      toast.success(data?.message || 'Email de test envoyé');
    } catch (err) {
      console.error('test mail config', err);
      const message = err instanceof Error && err.message ? err.message : 'Impossible de tester le serveur SMTP';
      toast.error(message);
    } finally {
      setMailTesting(false);
    }
  };

  const save = async () => {
    try {
      if (logoUploading) {
        toast.error('Téléversement du logo en cours, veuillez patienter.');
        return;
      }
      const normalizedCyclePeriodDays = Math.max(1, Math.min(3650, Number.parseInt(inventoryCyclePeriodDays, 10) || 30));
      const normalizedCycleFullEvery = Math.max(1, Math.min(120, Number.parseInt(inventoryCycleFullEvery, 10) || 6));
      const normalizedCycleAnchorDate = /^\d{4}-\d{2}-\d{2}$/.test(inventoryCycleAnchorDate)
        ? inventoryCycleAnchorDate
        : (settings?.inventory_cycle_anchor_date || new Date().toISOString().slice(0, 10));
      const rentalCoefficientExamples = {
        basePrice: FIXED_RENTAL_EXAMPLE_BASE_PRICE,
        days: [...FIXED_RENTAL_EXAMPLE_DAYS],
      };
      await saveSettings({
        name,
        legal_name: legalName,
        siren,
        vat,
        is_auto_entrepreneur: isAutoEntrepreneur,
        siret,
        naf,
        capital,
        email,
        phone,
        address,
        about,
        logo_url: logo,
        accent_color: accent,
        secondary_color: secondary,
        features: buildFeaturesPayload(),
        document_design: { ...docDesign },
        rental_coefficient_mode: rentalCoefficientMode,
        rental_coefficient_formula: rentalCoefficientMode === 'formula' && rentalCoefficientFormula.trim()
          ? rentalCoefficientFormula.trim()
          : null,
        rental_coefficient_examples: rentalCoefficientExamples,
        inventory_cycle_period_days: normalizedCyclePeriodDays,
        inventory_cycle_full_every: normalizedCycleFullEvery,
        inventory_cycle_anchor_date: normalizedCycleAnchorDate,
        ical_enabled: icalEnabled,
        ical_token: icalToken || null,
      });

    } catch (err) {
      console.error('save company settings', err);
    }
  };

  const exportCompleteBackup = async () => {
    setFullExporting(true);
    try {
      const response = await fetch('/api/system/full-export');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body?.error === 'string' ? body.error : `status_${response.status}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition');
      const fallbackName = `openrig-full-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
      const filename = contentDisposition?.match(/filename="?([^"]+)"?/)?.[1] || fallbackName;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);

      toast.success('Export complet téléchargé.');
    } catch (err) {
      console.error('export complete backup', err);
      toast.error("Impossible d'exporter la sauvegarde complète.");
    } finally {
      setFullExporting(false);
    }
  };

  const saveIcalSettings = async (nextToken?: string) => {
    try {
      setIcalSaving(true);
      const tokenValue = icalEnabled ? (nextToken || icalToken || generateIcalToken()) : (nextToken || icalToken);
      const featuresPayload = {
        ...parseFeaturesMap(settings?.features),
        ical: {
          enabled: icalEnabled,
          token: tokenValue || null,
        },
        ical_enabled: icalEnabled,
        ical_token: tokenValue || null,
      };
      try {
        const saved = await saveSettings({
          ical_enabled: icalEnabled,
          ical_token: tokenValue || null,
          features: featuresPayload,
        });
        setIcalEnabled(Boolean(saved.ical_enabled));
        setIcalToken(saved.ical_token || '');
        toast.success('Intégration iCal enregistrée');
        return saved;
      } catch (err) {
        console.warn('save ical settings fallback', err);
        const saved = await saveSettings({
          features: featuresPayload,
        });
        setIcalEnabled(icalEnabled);
        setIcalToken(tokenValue || '');
        toast.success('Intégration iCal enregistrée');
        return saved;
      }
    } catch (err) {
      console.error('save ical settings', err);
      toast.error("Impossible d'enregistrer l'intégration iCal");
      return null;
    } finally {
      setIcalSaving(false);
    }
  };

  const pickLogoUrl = (rawLogo: string, fallback?: string | null) => {
    const trimmed = rawLogo.trim();
    if (!trimmed) return fallback?.trim() || '';
    if (trimmed.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return fallback?.trim() || '';
    }
    return trimmed;
  };

  const companyLogoUrl = pickLogoUrl(logo, logoDataUrl);
  const resolvedLogoUrl = pickLogoUrl(docDesign.logoImageUrl || '', companyLogoUrl);
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const buildIcalBaseUrl = () => {
    if (!appOrigin) return '';
    const { protocol, hostname, port } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalhost && protocol === 'https:' && port === '5173') {
      const localHost = hostname === 'localhost' ? '127.0.0.1' : hostname;
      return `http://${localHost}:3001`;
    }
    return appOrigin;
  };
  const icalBaseUrl = typeof window !== 'undefined' ? buildIcalBaseUrl() : appOrigin;
  const { icalUrl, webcalUrl: icalWebcalUrl, webcalsUrl: icalWebcalsUrl, googleUrl: googleCalendarUrl } = buildIcalUrls(
    icalEnabled ? (icalToken || null) : null,
    icalBaseUrl
  );

  const ensureIcalReady = async () => {
    let nextToken = icalToken;
    if (!nextToken) {
      nextToken = generateIcalToken();
      setIcalToken(nextToken);
    }
    if (!icalEnabled) {
      setIcalEnabled(true);
    }
    const saved = await saveIcalSettings(nextToken);
    return saved?.ical_token || nextToken || null;
  };

  const previewDragEnabled = docDragTarget === 'background'
    ? !!docDesign.backgroundImageUrl?.trim()
    : !!resolvedLogoUrl;
  const previewScale = previewSize.width > 0 ? previewSize.width / A4_WIDTH : 0;
  const buildPreviewLayerStyle = (
    baseWidth: number,
    baseHeight: number,
    scale: number,
    positionX: number,
    positionY: number,
  ) => {
    if (!previewScale) return null;
    const width = baseWidth * scale * previewScale;
    const height = baseHeight * scale * previewScale;
    const left = (previewSize.width - width) * (positionX / 100);
    const top = (previewSize.height - height) * (positionY / 100);
    return { width, height, left, top };
  };
  const livePreviewActive = isDraggingPreview;
  const liveBackgroundStyle = livePreviewActive && docDragTarget === 'background'
    ? buildPreviewLayerStyle(
      A4_WIDTH,
      A4_HEIGHT,
      Math.max(0.5, docDesign.backgroundScale || 1),
      docDesign.backgroundPositionX,
      docDesign.backgroundPositionY,
    )
    : null;
  const liveLogoStyle = livePreviewActive && docDragTarget === 'logo'
    ? buildPreviewLayerStyle(
      LOGO_BASE_WIDTH,
      LOGO_BASE_HEIGHT,
      Math.min(3, Math.max(0.3, docDesign.logoScale || 1)),
      docDesign.logoPositionX,
      docDesign.logoPositionY,
    )
    : null;
  const compiledCoefficientFormula = React.useMemo(
    () => parseCoefficientFormula(rentalCoefficientFormula),
    [rentalCoefficientFormula],
  );
  const coefficientFormulaError = rentalCoefficientMode === 'formula'
    ? compiledCoefficientFormula.error
    : null;
  const normalizedExampleBasePrice = FIXED_RENTAL_EXAMPLE_BASE_PRICE;

  const computeCoefficientForDays = (days: number) => {
    if (rentalCoefficientMode === 'none') return Math.max(1, Math.floor(days));
    if (rentalCoefficientMode === 'automatic') return computeAutomaticCoefficient(days);
    if (!compiledCoefficientFormula.node) return null;
    const value = evaluateCoefficientFormula(compiledCoefficientFormula.node, days);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Gestion de l'entreprise</h1>
        <div className="bg-white rounded-lg shadow p-6 text-gray-700">Accès refusé: vous n'avez pas l'autorisation de voir ces paramètres.</div>
      </div>
    );
  }

  return (
    <div className="flex gap-5 items-start min-h-[calc(100vh-7rem)]">

      {/* ── Left sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-0 self-start">
        <div className="px-4 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-blue-600 flex-shrink-0">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">Gestion entreprise</div>
              <div className="text-xs text-gray-400 truncate">{name || 'Mon entreprise'}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {tabs.map((tabItem) => {
            const Icon = tabItem.icon;
            const isActive = active === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => handleTabChange(tabItem.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-100 group ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <div className={`flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0 transition-colors ${
                  isActive ? 'bg-white/10' : 'bg-gray-100 group-hover:bg-gray-200'
                }`}>
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`} />
                </div>
                <span className="text-sm font-medium">{tabItem.label}</span>
              </button>
            );
          })}
        </nav>

        {canEdit && active !== 'bug_reports' && (
          <div className="p-3 border-t border-gray-100">
            <button
              type="button"
              onClick={save}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold shadow-sm transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Enregistrer
            </button>
          </div>
        )}
      </aside>

      {/* ── Right content ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {canEdit && active !== 'bug_reports' && (
          <div className="md:hidden flex justify-end">
            <button type="button" onClick={save} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold">
              Enregistrer
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 space-y-8">
            <fieldset
              disabled={!canEdit && active !== 'bug_reports'}
              className={!canEdit && active !== 'bug_reports' ? 'opacity-75 pointer-events-none select-none' : ''}
            >
          {active === 'company' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <SectionTitle title="Identité" description="Informations générales de votre entreprise." />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Nom commercial</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Raison sociale</label>
                      <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">SIREN</label>
                      <input value={siren} onChange={(e) => setSiren(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">SIRET</label>
                      <input value={siret} onChange={(e) => setSiret(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">TVA intracommunautaire</label>
                      <input
                        value={vat}
                        onChange={(e) => setVat(e.target.value)}
                        disabled={isAutoEntrepreneur}
                        placeholder={isAutoEntrepreneur ? 'TVA non applicable (art. 293 B du CGI)' : ''}
                        className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Code NAF</label>
                      <input value={naf} onChange={(e) => setNaf(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Capital</label>
                      <input value={capital} onChange={(e) => setCapital(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" placeholder="ex: 10 000 €" />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                  <SectionTitle
                    title="Mode comptable"
                    description="Activez ce mode si votre entreprise est en auto-entrepreneur (saisie TTC uniquement, sans calcul de TVA)."
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Auto-entrepreneur (TTC uniquement)</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Matériel, projets (presta/location/vente), comptabilité et documents utiliseront uniquement des montants TTC.
                      </p>
                    </div>
                    <Switch
                      checked={isAutoEntrepreneur}
                      onChange={setIsAutoEntrepreneur}
                      label="Activer le mode auto-entrepreneur"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
                  <SectionTitle
                    title="Inventaires tournants"
                    description="Définissez la cadence des inventaires et la fréquence des inventaires complets."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Période d'un cycle (jours)</label>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={inventoryCyclePeriodDays}
                        onChange={(e) => setInventoryCyclePeriodDays(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Inventaire total tous les</label>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={inventoryCycleFullEvery}
                        onChange={(e) => setInventoryCycleFullEvery(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">cycle(s)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Date de départ du cycle</label>
                      <input
                        type="date"
                        value={inventoryCycleAnchorDate}
                        onChange={(e) => setInventoryCycleAnchorDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle title="Contact & adresse" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Téléphone</label>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Adresse</label>
                      <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle title="À propos" />
                  <textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500" />
                </div>

              </div>

              <div className="lg:col-span-1">
                <div className="rounded-lg border border-gray-200 p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Logo & aperçu</h4>
                  <div className="flex items-center gap-4">
                    <img src={companyLogoUrl || LOGO_PLACEHOLDER_LARGE} alt="Logo" className="h-16 w-16 rounded-md object-cover ring-1 ring-black/10 bg-white" />
                    <label
                      className={`inline-flex items-center px-3 py-2 rounded-md border border-gray-300 text-gray-700 transition ${
                        logoUploading ? 'opacity-60 pointer-events-none' : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      {logoUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importation...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Importer
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void handleLogoUpload(file);
                          }
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-md border border-gray-200 p-4">
                    <div className="text-xs text-gray-500 mb-1">Carte d'entreprise</div>
                    <div className="flex items-center gap-3">
                        <img src={companyLogoUrl || LOGO_PLACEHOLDER_SMALL} alt="Logo" className="h-10 w-10 rounded-md object-cover ring-1 ring-black/10 bg-white" />
                        <div>
                          <div className="font-medium text-gray-900">{name}</div>
                          <div className="text-sm text-gray-500">{email}</div>
                        </div>
                      </div>
                    <div className="mt-3 text-xs text-gray-500">{address}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {active === 'coefficients' && (
            <div className="space-y-6">
              <SectionTitle
                title="Coefficients de location"
                description="Définissez comment le coefficient est calculé selon la durée. x = nombre de jours."
              />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition ${
                      rentalCoefficientMode === 'none'
                        ? 'border-blue-500 bg-blue-50/40'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rental-coefficient-mode"
                      className="mt-1"
                      checked={rentalCoefficientMode === 'none'}
                      onChange={() => setRentalCoefficientMode('none')}
                    />
                    <div>
                      <div className="font-medium text-gray-900">Sans coefficient</div>
                      <p className="text-xs text-gray-500">Calcul standard : prix/jour × jours.</p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition ${
                      rentalCoefficientMode === 'automatic'
                        ? 'border-blue-500 bg-blue-50/40'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rental-coefficient-mode"
                      className="mt-1"
                      checked={rentalCoefficientMode === 'automatic'}
                      onChange={() => setRentalCoefficientMode('automatic')}
                    />
                    <div>
                      <div className="font-medium text-gray-900">Automatique</div>
                      <p className="text-xs text-gray-500">
                        Barème progressif par paliers (1 -&gt; 1, 5 -&gt; 3, 30 -&gt; 8, 70 -&gt; 28).
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition ${
                      rentalCoefficientMode === 'formula'
                        ? 'border-blue-500 bg-blue-50/40'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rental-coefficient-mode"
                      className="mt-1"
                      checked={rentalCoefficientMode === 'formula'}
                      onChange={() => setRentalCoefficientMode('formula')}
                    />
                    <div>
                      <div className="font-medium text-gray-900">Calcul personnalisé</div>
                      <p className="text-xs text-gray-500">
                        Utilisez une formule libre avec des variables (x = jours).
                      </p>
                    </div>
                  </label>

                  {rentalCoefficientMode === 'formula' && (
                    <div className="rounded-lg border border-gray-200 p-3">
                      <label className="block text-xs font-medium text-gray-700">Formule du coefficient</label>
                      <input
                        value={rentalCoefficientFormula}
                        onChange={(event) => setRentalCoefficientFormula(event.target.value)}
                        placeholder="ex : 1 + (x - 1) * 0.6"
                        className="mt-2 block w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        Fonctions disponibles : min(), max(), abs(), round(), floor(), ceil().
                      </p>
                      {coefficientFormulaError && (
                        <p className="mt-2 text-xs text-rose-600">{coefficientFormulaError}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Exemples</h4>
                      <p className="text-xs text-gray-500">Valeurs fixes de 1 à 10 jours.</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-600">
                    Prix de base fixe : {FIXED_RENTAL_EXAMPLE_BASE_PRICE.toFixed(2)} €
                  </div>
                  <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Jours</th>
                          <th className="px-3 py-2 text-right font-medium">Coeff.</th>
                          <th className="px-3 py-2 text-right font-medium">Prix</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {FIXED_RENTAL_EXAMPLE_DAYS.map((days) => {
                          const coefficientValue = computeCoefficientForDays(days);
                          const priceValue = coefficientValue === null
                            ? null
                            : normalizedExampleBasePrice * coefficientValue;
                          const coefficientLabel = coefficientValue === null
                            ? '—'
                            : coefficientValue.toFixed(2);
                          const priceLabel = priceValue === null
                            ? '—'
                            : `${priceValue.toFixed(2)} €`;
                          return (
                            <tr key={days}>
                              <td className="px-3 py-2 text-gray-700">{days}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{coefficientLabel}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{priceLabel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Le prix est calculé sur la base indiquée et le coefficient choisi.
                  </p>
                </div>
              </div>
            </div>
          )}

          {active === 'smtp' && (
            <div className="space-y-6">
              <div>
                <SectionTitle
                  title="Serveur SMTP"
                  description="Configurez le serveur d'envoi pour les emails automatiques (codes de réinitialisation, notifications…)."
                />
                {mailLoading ? (
                  <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
                    Chargement de la configuration SMTP…
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Hôte SMTP</label>
                          <input
                            value={mailHost}
                            onChange={(e) => setMailHost(e.target.value)}
                            placeholder="smtp.exemple.com"
                            className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Port</label>
                          <input
                            value={mailPort}
                            onChange={(e) => setMailPort(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="587"
                            className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Connexion sécurisée (TLS/SSL)</p>
                          <p className="text-xs text-gray-500">Activez si votre fournisseur demande STARTTLS ou SSL.</p>
                        </div>
                        <Switch checked={mailSecure} onChange={setMailSecure} />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Utilisateur</label>
                          <input
                            value={mailUser}
                            onChange={(e) => setMailUser(e.target.value)}
                            placeholder="noreply@exemple.com"
                            className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
                          <input
                            type="password"
                            value={mailPass}
                            onChange={(e) => setMailPass(e.target.value)}
                            placeholder={mailHasPass ? '•••••••• (inchangé)' : 'Mot de passe SMTP'}
                            className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                          <p className="mt-1 text-xs text-gray-500">Laissez vide pour conserver le mot de passe déjà enregistré.</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={saveMailConfig}
                          disabled={mailSaving}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {mailSaving && <RefreshCcw className="h-4 w-4 animate-spin" />}
                          Enregistrer le serveur SMTP
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-lg border border-gray-200 p-4">
                        <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          <Send className="h-4 w-4 text-blue-500" />
                          Envoyer un email de test
                        </h4>
                        <p className="mt-2 text-sm text-gray-500">
                          Vérifiez immédiatement que la configuration actuelle est fonctionnelle.
                        </p>
                        <label className="mt-3 block text-sm font-medium text-gray-700">Adresse de test (optionnelle)</label>
                        <input
                          type="email"
                          value={mailTestEmail}
                          onChange={(e) => setMailTestEmail(e.target.value)}
                          placeholder="destinataire@exemple.com"
                          className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={testMailConfig}
                          disabled={mailTesting || mailSaving}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                        >
                          {mailTesting && <RefreshCcw className="h-4 w-4 animate-spin" />}
                          Envoyer un email de test
                        </button>
                        <p className="mt-3 text-xs text-gray-500">
                          L'adresse renseignée recevra immédiatement un email de vérification (ou l'email utilisateur si ce champ est vide).
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {active === 'ical' && (
            <div className="space-y-6">
              <SectionTitle
                title="Synchronisation iCal"
                description="Exposez vos projets (presta, location, vente) dans un calendrier externe."
              />

              <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">Activer le flux iCal</div>
                    <p className="text-xs text-gray-500">Un lien privé sera généré pour vos calendriers.</p>
                  </div>
                  <Switch
                    checked={icalEnabled}
                    onChange={(value) => {
                      setIcalEnabled(value);
                      if (value && !icalToken) {
                        setIcalToken(generateIcalToken());
                      }
                    }}
                    label="Activer iCal"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Lien iCal</label>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                        <Link2 className="h-4 w-4 text-gray-400" />
                        <span className="truncate">{icalUrl || "Activez l'iCal pour générer un lien."}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={icalSaving}
                      onClick={async () => {
                        try {
                          const token = await ensureIcalReady();
                          const { icalUrl: liveUrl } = buildIcalUrls(token, icalBaseUrl);
                          if (!liveUrl) return;
                          await navigator.clipboard.writeText(liveUrl);
                          toast.success('Lien copié dans le presse-papiers');
                        } catch (err) {
                          console.error('copy ical link', err);
                          toast.error('Impossible de copier le lien');
                        }
                      }}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${
                        icalSaving
                          ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Copy className="h-4 w-4" />
                      Copier
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={icalSaving}
                    onClick={async () => {
                      const token = await ensureIcalReady();
                      const { webcalsUrl, webcalUrl, icalUrl: liveUrl } = buildIcalUrls(token, icalBaseUrl);
                      const targetUrl = webcalsUrl || webcalUrl || liveUrl;
                      if (!targetUrl) return;
                      window.location.href = targetUrl;
                    }}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                      icalSaving
                        ? 'bg-blue-200 text-blue-700 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    Ajouter à Apple/Outlook
                  </button>
                  <button
                    type="button"
                    disabled={icalSaving}
                    onClick={async () => {
                      const token = await ensureIcalReady();
                      const { googleUrl } = buildIcalUrls(token, icalBaseUrl);
                      if (!googleUrl) return;
                      window.open(googleUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border ${
                      icalSaving
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Ajouter à Google Calendar
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-gray-500">
                    Le lien est privé. Si vous le régénérez, l'ancien sera désactivé.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saveIcalSettings()}
                      disabled={icalSaving}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                        icalSaving
                          ? 'bg-blue-200 text-blue-700 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {icalSaving ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                    <button
                      type="button"
                      disabled={!icalEnabled || icalSaving}
                      onClick={() => {
                        const nextToken = generateIcalToken();
                        setIcalToken(nextToken);
                        void saveIcalSettings(nextToken);
                      }}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border ${
                        icalEnabled
                          ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          : 'border-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Régénérer le lien
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {active === 'categories' && (
            <div className="space-y-6">
              <div>
                <SectionTitle
                  title="Catégories de matériel"
                  description="Gérez les familles de matériel et leurs sous-catégories pour harmoniser la saisie et les statistiques."
                />
                <EquipmentCategoriesManager canEdit={canEdit} />
              </div>
            </div>
          )}

          {active === 'documents' && (
            <div className="space-y-8">
              <div className="rounded-lg border border-gray-200 bg-white p-4 md:p-6">
                <SectionTitle
                  title="Template Studio"
                  description="Ouvrez la nouvelle page dédiée à l'éditeur de templates."
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/company/template-studio')}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                  >
                    <Sparkles className="h-4 w-4" />
                    Ouvrir Template Studio
                  </button>
                  <span className="text-sm text-gray-500">
                    La page est volontairement vide pour l'instant.
                  </span>
                </div>
              </div>
            </div>
          )}

          {active === 'features' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Modules optionnels</h3>
                <p className="mt-1 text-xs text-gray-500">Activez ou désactivez les fonctionnalités pour votre équipe. Les changements s'appliquent immédiatement.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

                {/* Billing */}
                <div className={`flex flex-col gap-4 rounded-xl border p-5 shadow-sm transition-all duration-150 ${featureBillingManual ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-blue-500 shadow-sm shadow-blue-200">
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Factures &amp; devis</div>
                      <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                        Création manuelle de documents dans le module Factures &amp; Devis, en complément des documents générés automatiquement depuis les projets.
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <span className={`text-xs font-medium ${featureBillingManual ? 'text-blue-600' : 'text-gray-400'}`}>{featureBillingManual ? 'Activé' : 'Désactivé'}</span>
                    <Switch checked={featureBillingManual} onChange={setFeatureBillingManual} />
                  </div>
                </div>

                {/* Chat */}
                <div className={`flex flex-col gap-4 rounded-xl border p-5 shadow-sm transition-all duration-150 ${featurePersonnelChat ? 'border-violet-200 bg-violet-50/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-violet-500 shadow-sm shadow-violet-200">
                      <MessageCircle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Chat du personnel</div>
                      <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                        Fil de discussion interne pour votre équipe, accessible depuis la page Chat du personnel.
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <span className={`text-xs font-medium ${featurePersonnelChat ? 'text-violet-600' : 'text-gray-400'}`}>{featurePersonnelChat ? 'Activé' : 'Désactivé'}</span>
                    <Switch checked={featurePersonnelChat} onChange={setFeaturePersonnelChat} />
                  </div>
                </div>

                {/* Coming soon */}
                <div className="flex flex-col gap-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-gray-200">
                      <Sparkles className="h-5 w-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-400">Prochainement</div>
                      <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                        Portail client, abonnements, intégrations tierces... Contactez-nous pour un early-access.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {active === 'bug_reports' && (
            <BugReportsPanel canEdit={canEdit} isActive={active === 'bug_reports'} />
          )}

          {active === 'about' && (
            <div className="space-y-8">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Informations système</h3>
                  <p className="text-sm text-gray-500">Résumé technique du déploiement actuel d'OpenRig.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <Download className="h-5 w-5 text-emerald-500" />
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">Sauvegarde complète</h4>
                      <p className="text-xs text-gray-500">Exporte la base, les configs, les images et le stockage dans un ZIP.</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    Le fichier inclut un dump SQL de la base, les fichiers de configuration serveur et les fichiers/images disponibles.
                  </p>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void exportCompleteBackup();
                      }}
                      disabled={fullExporting}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-500 px-3 py-2 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {fullExporting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {fullExporting ? 'Export en cours...' : 'Télécharger le ZIP'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <RefreshCcw className={`h-5 w-5 text-sky-500 ${updateChecking || updateApplying ? 'animate-spin' : ''}`} />
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">Mises à jour</h4>
                      <p className="text-xs text-gray-500">Comparaison avec le dépôt GitHub et installation en un clic.</p>
                    </div>
                  </div>

                  <dl className="space-y-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between">
                      <dt>Version installée</dt>
                      <dd className="font-semibold">{updateStatus?.currentVersion ? `build ${updateStatus.currentVersion}` : '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt>Version disponible</dt>
                      <dd className={updateStatus?.updateAvailable ? 'font-semibold text-emerald-600' : ''}>
                        {updateStatus?.remoteVersion ? `build ${updateStatus.remoteVersion}` : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt>Branche suivie</dt>
                      <dd className="text-gray-500">{updateStatus?.branch || '—'}</dd>
                    </div>
                    {typeof updateStatus?.commitsBehind === 'number' && updateStatus.commitsBehind > 0 && (
                      <div className="flex items-center justify-between">
                        <dt>Retard</dt>
                        <dd className="text-amber-600 font-medium">{updateStatus.commitsBehind} commit{updateStatus.commitsBehind > 1 ? 's' : ''}</dd>
                      </div>
                    )}
                    {updateStatus?.lastCheckedAt && (
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <dt>Dernière vérification</dt>
                        <dd>{new Date(updateStatus.lastCheckedAt).toLocaleString()}</dd>
                      </div>
                    )}
                  </dl>

                  {updateStatus?.error && (
                    <p className="text-sm text-red-600">
                      Impossible de joindre le dépôt : {updateStatus.errorDetail || updateStatus.error}
                    </p>
                  )}

                  {updateStatus && !updateStatus.error && !updateStatus.updateAvailable && (
                    <p className="inline-flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> OpenRig est à jour.
                    </p>
                  )}

                  {updateDirtyFiles && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-2">
                      <p className="font-medium">Des modifications locales non commit bloquent la mise à jour :</p>
                      <ul className="list-disc pl-5 text-xs max-h-24 overflow-y-auto">
                        {updateDirtyFiles.map((file) => <li key={file}>{file}</li>)}
                      </ul>
                      <button
                        type="button"
                        disabled={updateApplying}
                        onClick={() => { void applyAppUpdate(true); }}
                        className="inline-flex items-center gap-2 rounded-md border border-amber-500 px-3 py-1.5 text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                      >
                        Forcer (mettre les modifications de côté)
                      </button>
                    </div>
                  )}

                  {updateResult && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 space-y-2">
                      <p className="font-medium">
                        Mise à jour vers la build {updateResult.newVersion} installée
                        {updateResult.npmInstalled ? ' (dépendances réinstallées)' : ''}.
                      </p>
                      {updateResult.changelog.length > 0 && (
                        <ul className="list-disc pl-5 text-xs max-h-32 overflow-y-auto font-mono">
                          {updateResult.changelog.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                      {updateResult.needsRestart && (
                        <p className="font-semibold">
                          Redémarrez l'application (relancez « npm run start » ou « npm run start:full ») pour appliquer la mise à jour du serveur.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      disabled={updateChecking || updateApplying}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-500 px-3 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => { void fetchUpdateStatus(true); }}
                    >
                      <RefreshCcw className={`h-4 w-4 ${updateChecking ? 'animate-spin' : ''}`} />
                      {updateChecking ? 'Vérification...' : 'Rechercher des mises à jour'}
                    </button>
                    {updateStatus?.updateAvailable && (
                      <button
                        type="button"
                        disabled={updateApplying || updateChecking}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => { void applyAppUpdate(false); }}
                      >
                        {updateApplying ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {updateApplying ? 'Installation...' : 'Installer la mise à jour'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettingsPage;
