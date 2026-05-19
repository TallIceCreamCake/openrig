import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Cloud, Database, Settings, UserPlus, CheckCircle2, Send, ExternalLink, AlertCircle, Loader2, Server, Building2, Image as ImageIcon, Trash2, Upload, ArchiveRestore } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';
import { useNavigate } from 'react-router-dom';
import type { SupportedLanguage } from '../i18n/translations';

type SetupSlide = {
  id: string;
  titleKey: string;
  descriptionKey: string;
};

const carouselSlides: SetupSlide[] = [
  { id: 'fleet', titleKey: 'setup.carousel.fleet.title', descriptionKey: 'setup.carousel.fleet.description' },
  { id: 'planning', titleKey: 'setup.carousel.planning.title', descriptionKey: 'setup.carousel.planning.description' },
  { id: 'integrations', titleKey: 'setup.carousel.integrations.title', descriptionKey: 'setup.carousel.integrations.description' },
];

type SetupStep = {
  id: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  titleKey: string;
  descriptionKey: string;
};

const stepGroups: SetupStep[][] = [
  [{ id: 'mode', icon: Settings, titleKey: 'setup.steps.mode.title', descriptionKey: 'setup.steps.mode.description' }],
  [{ id: 'welcome', icon: Settings, titleKey: 'setup.steps.welcome.title', descriptionKey: 'setup.steps.welcome.description' }],
  [{ id: 'supabase', icon: Database, titleKey: 'setup.steps.supabase.title', descriptionKey: 'setup.steps.supabase.description' }],
  [{ id: 'mail', icon: Cloud, titleKey: 'setup.steps.mail.title', descriptionKey: 'setup.steps.mail.description' }],
  [{ id: 'account', icon: UserPlus, titleKey: 'setup.steps.account.title', descriptionKey: 'setup.steps.account.description' }],
  [{ id: 'company', icon: Building2, titleKey: 'setup.steps.company.title', descriptionKey: 'setup.steps.company.description' }],
  [
    { id: 'finalize', icon: CheckCircle2, titleKey: 'setup.steps.finalize.title', descriptionKey: 'setup.steps.finalize.description' },
  ],
];

const ACCOUNT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const LOGO_FILE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';
const BACKUP_FILE_ACCEPT = '.zip,application/zip,application/octet-stream';

type SetupModeChoice = 'scratch' | 'backup' | null;

const SystemSetupPage: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();
  const navigate = useNavigate();
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const [currentStepGroupIndex, setCurrentStepGroupIndex] = useState(0);
  const currentSteps = stepGroups[currentStepGroupIndex];
  const totalGroups = stepGroups.length;
  const completion = Math.round(((currentStepGroupIndex + 1) / totalGroups) * 100);
  const isFinalGroup = currentStepGroupIndex === totalGroups - 1;
  const languageOptions = useMemo(
    () => [
      { value: 'fr', label: t('setup.language.options.fr'), flag: '🇫🇷' },
      { value: 'en', label: t('setup.language.options.en'), flag: '🇬🇧' },
    ],
    [t],
  );
  const [storedSupabaseUrl, setStoredSupabaseUrl] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [supabaseStartStatus, setSupabaseStartStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [supabaseStartMessage, setSupabaseStartMessage] = useState<string | null>(null);
  const [databaseHealth, setDatabaseHealth] = useState<{
    status: 'unknown' | 'ready' | 'invalid' | 'failed' | 'unreachable' | 'unauthorized';
    message: string | null;
    issues: Array<{ table?: string; message?: string | null; status?: string | null }>;
    updatedAt: string | null;
    bootstrapStatus?: string;
    bootstrapError?: string | null;
    bootstrapStartedAt?: string | null;
    bootstrapCompletedAt?: string | null;
  }>({ status: 'unknown', message: null, issues: [], updatedAt: null });

  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountConfirm, setAccountConfirm] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountSuccess, setAccountSuccess] = useState(false);
  const [adminExists, setAdminExists] = useState(false);
  const [adminStatus, setAdminStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const accountReady = adminExists || accountSuccess;

  const [companyName, setCompanyName] = useState('');
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyAbout, setCompanyAbout] = useState('');
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(null);
  const [companyLogoUpload, setCompanyLogoUpload] = useState<{ filename: string; contentType: string; data: string } | null>(null);
  const [companyLogoRemoved, setCompanyLogoRemoved] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companySuccess, setCompanySuccess] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupModeChoice>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupImported, setBackupImported] = useState(false);
  const [backupImportError, setBackupImportError] = useState<string | null>(null);
  const [backupImportWarnings, setBackupImportWarnings] = useState<string[]>([]);
  const [backupImportedAt, setBackupImportedAt] = useState<string | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const formattedHealthUpdatedAt = useMemo(() => {
    if (!databaseHealth.updatedAt) return null;
    try {
      return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(databaseHealth.updatedAt));
    } catch {
      return databaseHealth.updatedAt;
    }
  }, [databaseHealth.updatedAt, language]);

  const bootstrapRunning = (databaseHealth.bootstrapStatus === 'running') || supabaseStartStatus === 'pending';
  const showStartButton = databaseHealth.status !== 'ready' && !bootstrapRunning;

  const fetchDatabaseHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/system/database-health');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const payload = await res.json();
      setDatabaseHealth({
        status: typeof payload?.status === 'string' ? payload.status : 'unknown',
        message: typeof payload?.message === 'string' ? payload.message : null,
        issues: Array.isArray(payload?.issues) ? payload.issues : [],
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : null,
        bootstrapStatus: typeof payload?.bootstrapStatus === 'string' ? payload.bootstrapStatus : undefined,
        bootstrapError: typeof payload?.bootstrapError === 'string' ? payload.bootstrapError : null,
        bootstrapStartedAt: typeof payload?.bootstrapStartedAt === 'string' ? payload.bootstrapStartedAt : null,
        bootstrapCompletedAt: typeof payload?.bootstrapCompletedAt === 'string' ? payload.bootstrapCompletedAt : null,
      });
      return payload;
    } catch (err) {
      console.error('[system-setup] database health error', err);
      setDatabaseHealth({
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
        issues: [],
        updatedAt: new Date().toISOString(),
      });
      return null;
    }
  }, []);

  const updateSupabaseStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/database-connection-status');
      if (!res.ok) {
        setSupabaseConfigured(false);
        return null;
      }
      const payload = await res.json();
      const hasService = Boolean(payload?.hasServiceRoleKey);
      const hasAnon = Boolean(payload?.hasAnonKey);
      const storedUrl = typeof payload?.supabaseUrl === 'string' ? payload.supabaseUrl : '';

      setStoredSupabaseUrl(storedUrl || null);
      if (typeof payload?.savedAt === 'string' && payload.savedAt) {
        setSavedAt(payload.savedAt);
      }
      setSupabaseConfigured(Boolean(storedUrl && hasService && hasAnon));
      await fetchDatabaseHealth();
      return payload;
    } catch (err) {
      console.error('[system-setup] supabase status error', err);
      setSupabaseConfigured(false);
      await fetchDatabaseHealth();
      return null;
    }
  }, [fetchDatabaseHealth]);

  const updateAdminStatus = useCallback(async (options: { ignoreConfig?: boolean } = {}) => {
    const { ignoreConfig = false } = options;
    if (!supabaseConfigured && !ignoreConfig) {
      setAdminStatus('idle');
      setAdminExists(false);
      return null;
    }
    setAdminStatus('loading');
    try {
      const res = await fetch('/api/system/initial-admin/status');
      if (!res.ok) {
        setAdminStatus('error');
        return null;
      }
      const payload = await res.json().catch(() => ({}));
      setAdminExists(Boolean(payload?.hasUsers));
      setAdminStatus('ready');
      return payload;
    } catch (err) {
      console.error('[system-setup] admin status error', err);
      setAdminStatus('error');
      return null;
    }
  }, [supabaseConfigured]);

  const translateCompanyErrorCode = useCallback((code?: string | null) => {
    switch (code) {
      case 'name_required':
        return t('setup.company.errorName');
      case 'invalid_email':
        return t('setup.company.errorEmail');
      case 'logo_invalid_type':
        return t('setup.company.logoErrorType');
      case 'logo_invalid_data':
        return t('setup.company.logoErrorData');
      case 'logo_too_large':
        return t('setup.company.logoErrorSize');
      case 'logo_upload_failed':
        return t('setup.company.logoErrorUpload');
      case 'save_failed':
      case 'fetch_failed':
        return t('setup.company.errorSave');
      case 'supabase_not_ready':
        return t('setup.company.supabaseMissing');
      default:
        return t('setup.company.errorGeneric');
    }
  }, [t]);

  const fetchCompanyProfile = useCallback(async () => {
    setCompanyLoading(true);
    setCompanyError(null);
    try {
      const res = await fetch('/api/system/company-setup');
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.ok === false) {
        const code = typeof payload?.error === 'string' ? payload.error : null;
        setCompanyError(translateCompanyErrorCode(code));
        setCompanySaved(false);
        return null;
      }

      const data = payload?.data || {};
      setCompanyName(typeof data.name === 'string' ? data.name : '');
      setCompanyLegalName(typeof data.legalName === 'string' ? data.legalName : '');
      setCompanyEmail(typeof data.email === 'string' ? data.email : '');
      setCompanyPhone(typeof data.phone === 'string' ? data.phone : '');
      setCompanyAddress(typeof data.address === 'string' ? data.address : '');
      setCompanyAbout(typeof data.about === 'string' ? data.about : '');
      setCompanyLogoPreview(typeof data.logoUrl === 'string' && data.logoUrl ? data.logoUrl : null);
      setCompanyLogoUpload(null);
      setCompanyLogoRemoved(false);
      const saved = Boolean(payload?.saved && data?.name && data?.email);
      setCompanySaved(saved);
      setCompanySuccess(saved);
      return data;
    } catch (err) {
      console.error('[system-setup] company fetch error', err);
      setCompanyError(t('setup.company.errorLoad'));
      setCompanySaved(false);
      return null;
    } finally {
      setCompanyLoading(false);
    }
  }, [t, translateCompanyErrorCode]);

  useEffect(() => {
    void updateSupabaseStatus();
  }, [updateSupabaseStatus]);

  useEffect(() => {
    void fetchDatabaseHealth();
  }, [fetchDatabaseHealth]);

  useEffect(() => {
    if (!bootstrapRunning) return undefined;
    const timer = setInterval(() => {
      void updateSupabaseStatus();
    }, 4000);
    return () => clearInterval(timer);
  }, [bootstrapRunning, updateSupabaseStatus]);

  useEffect(() => {
    void updateAdminStatus();
  }, [updateAdminStatus]);

  useEffect(() => {
    if (!supabaseConfigured || databaseHealth.status !== 'ready') {
      setCompanyLoaded(false);
      return;
    }
    if (companyLoaded) {
      return;
    }
    setCompanyLoaded(true);
    void fetchCompanyProfile();
  }, [supabaseConfigured, databaseHealth.status, companyLoaded, fetchCompanyProfile]);

  const triggerSupabaseStart = async () => {
    setSupabaseStartStatus('pending');
    setSupabaseStartMessage(null);
    try {
      const res = await fetch('/api/system/supabase/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        setSupabaseStartStatus('error');
        const message = typeof payload?.message === 'string'
          ? payload.message
          : typeof payload?.error === 'string'
            ? payload.error
            : t('setup.database.form.startError');
        setSupabaseStartMessage(message);
        return;
      }
      const summary = typeof payload?.config?.supabaseUrl === 'string'
        ? payload.config.supabaseUrl
        : typeof payload?.databaseUrl === 'string'
          ? payload.databaseUrl
          : null;
      setSupabaseStartMessage(summary ? summary : null);
      await updateSupabaseStatus();
      await updateAdminStatus({ ignoreConfig: true });
      await fetchDatabaseHealth();
      setSupabaseStartStatus('success');
    } catch (err) {
      console.error('[system-setup] supabase start error', err);
      setSupabaseStartStatus('error');
      setSupabaseStartMessage(err instanceof Error ? err.message : 'unknown_error');
    }
  };

  const formattedSavedAt = useMemo(() => {
    if (!savedAt) return null;
    try {
      return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(savedAt));
    } catch {
      return savedAt;
    }
  }, [language, savedAt]);

  const translateAccountErrorCode = (code?: string | null) => {
    switch (code) {
      case 'supabase_not_configured':
        return t('setup.account.error.supabase');
      case 'invalid_email':
        return t('setup.account.error.emailInvalid');
      case 'password_too_short':
        return t('setup.account.error.passwordTooShort');
      case 'admin_already_exists':
        return t('setup.account.error.alreadyExists');
      case 'status_check_failed':
        return t('setup.account.error.status');
      default:
        return t('setup.account.error.generic');
    }
  };

  const handleCreateAdmin = async () => {
    if (accountSubmitting || accountReady) return;
    if (!supabaseConfigured) {
      setAccountError(t('setup.account.error.supabase'));
      return;
    }
    const trimmedName = accountName.trim();
    const trimmedEmail = accountEmail.trim();

    if (!trimmedName) {
      setAccountError(t('setup.account.error.nameRequired'));
      return;
    }
    if (!ACCOUNT_EMAIL_REGEX.test(trimmedEmail)) {
      setAccountError(t('setup.account.error.emailInvalid'));
      return;
    }
    if (accountPassword.length < 8) {
      setAccountError(t('setup.account.error.passwordTooShort'));
      return;
    }
    if (accountPassword !== accountConfirm) {
      setAccountError(t('setup.account.error.passwordMismatch'));
      return;
    }

    setAccountSubmitting(true);
    setAccountError(null);

    try {
      const res = await fetch('/api/system/initial-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: trimmedName,
          email: trimmedEmail,
          password: accountPassword,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        const code = typeof payload?.error === 'string' ? payload.error : null;
        setAccountError(translateAccountErrorCode(code));
        if (code === 'admin_already_exists') {
          setAdminExists(true);
        }
        return;
      }

      setAccountSuccess(true);
      setAdminExists(true);
      setAccountName(trimmedName);
      setAccountEmail(trimmedEmail);
      setAccountPassword('');
      setAccountConfirm('');
    } catch (err) {
      console.error('[system-setup] create admin error', err);
      setAccountError(t('setup.account.error.generic'));
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleCompanyLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setCompanyError(t('setup.company.logoErrorSize'));
      setCompanySuccess(false);
      setCompanySaved(false);
      return;
    }

    const contentType = file.type || 'image/png';
    if (!ALLOWED_LOGO_TYPES.has(contentType)) {
      setCompanyError(t('setup.company.logoErrorType'));
      setCompanySuccess(false);
      setCompanySaved(false);
      return;
    }

    const readAsDataUrl = () => new Promise<string>((resolve, reject) => {
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

    try {
      const dataUrl = await readAsDataUrl();
      const base64 = dataUrl.includes(',') ? dataUrl.split(',').pop() || '' : dataUrl;
      setCompanyLogoPreview(dataUrl);
      setCompanyLogoUpload({ filename: file.name, contentType, data: base64 });
      setCompanyLogoRemoved(false);
      setCompanyError(null);
      setCompanySuccess(false);
      setCompanySaved(false);
    } catch (err) {
      console.error('[system-setup] logo read error', err);
      setCompanyError(t('setup.company.logoErrorRead'));
      setCompanySuccess(false);
      setCompanySaved(false);
    }
  };

  const handleCompanyLogoRemove = () => {
    setCompanyLogoPreview(null);
    setCompanyLogoUpload(null);
    setCompanyLogoRemoved(true);
    setCompanySuccess(false);
    setCompanySaved(false);
    setCompanyError(null);
  };

  const handleBackupImport = async (fileOverride?: File) => {
    if (backupImporting) return;
    const fileToImport = fileOverride ?? backupFile;
    if (!fileToImport) {
      setBackupImportError(t('setup.mode.backup.errorNoFile'));
      return;
    }

    setBackupImporting(true);
    setBackupImportError(null);
    setBackupImported(false);
    setBackupImportWarnings([]);

    try {
      const response = await fetch('/api/system/full-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          'x-backup-filename': fileToImport.name,
        },
        body: fileToImport,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        const message = typeof payload?.message === 'string'
          ? payload.message
          : typeof payload?.error === 'string'
            ? payload.error
            : 'full_import_failed';
        throw new Error(message);
      }

      const warnings = Array.isArray(payload?.report?.warnings)
        ? payload.report.warnings.filter((value: unknown): value is string => typeof value === 'string')
        : [];

      setBackupImported(true);
      setBackupImportedAt(typeof payload?.report?.importedAt === 'string' ? payload.report.importedAt : new Date().toISOString());
      setBackupImportWarnings(warnings);
      setBackupFile(fileToImport);
      setSetupMode('backup');

      await updateSupabaseStatus();
      await updateAdminStatus({ ignoreConfig: true });
      await fetchDatabaseHealth();
    } catch (err) {
      console.error('[system-setup] backup import error', err);
      setBackupImportError(err instanceof Error && err.message ? err.message : t('setup.mode.backup.errorGeneric'));
    } finally {
      setBackupImporting(false);
    }
  };

  const handleBackupUploadClick = () => {
    if (backupImporting) return;
    setSetupMode('backup');
    setBackupImportError(null);
    backupFileInputRef.current?.click();
  };

  const handleBackupFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    setSetupMode('backup');
    setBackupFile(file);
    setBackupImported(false);
    setBackupImportError(null);
    setBackupImportWarnings([]);

    const confirmed = window.confirm(t('setup.mode.backup.confirmImport', { name: file.name }));
    if (!confirmed) {
      return;
    }

    await handleBackupImport(file);
  };

  const handleCompanySave = async () => {
    if (companySaving) return;
    if (!supabaseConfigured || databaseHealth.status !== 'ready') {
      setCompanyError(t('setup.company.supabaseMissing'));
      return;
    }

    const trimmedName = companyName.trim();
    const trimmedEmail = companyEmail.trim();

    if (!trimmedName) {
      setCompanyError(t('setup.company.errorName'));
      return;
    }

    if (!ACCOUNT_EMAIL_REGEX.test(trimmedEmail)) {
      setCompanyError(t('setup.company.errorEmail'));
      return;
    }

    setCompanySaving(true);
    setCompanyError(null);
    setCompanySuccess(false);

    const payload: Record<string, unknown> = {
      name: trimmedName,
      legalName: companyLegalName,
      email: trimmedEmail,
      phone: companyPhone,
      address: companyAddress,
      about: companyAbout,
    };

    if (companyLogoUpload) {
      payload.logo = companyLogoUpload;
    } else if (companyLogoRemoved) {
      payload.logo = { remove: true };
    }

    try {
      const res = await fetch('/api/system/company-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok || body?.ok === false) {
        const code = typeof body?.error === 'string' ? body.error : null;
        setCompanyError(translateCompanyErrorCode(code));
        setCompanySaved(false);
        return;
      }

      const data = body?.data || {};
      setCompanyName(typeof data.name === 'string' ? data.name : trimmedName);
      setCompanyLegalName(typeof data.legalName === 'string' ? data.legalName : companyLegalName);
      setCompanyEmail(typeof data.email === 'string' ? data.email : trimmedEmail);
      setCompanyPhone(typeof data.phone === 'string' ? data.phone : companyPhone);
      setCompanyAddress(typeof data.address === 'string' ? data.address : companyAddress);
      setCompanyAbout(typeof data.about === 'string' ? data.about : companyAbout);
      setCompanyLogoPreview(typeof data.logoUrl === 'string' && data.logoUrl ? data.logoUrl : companyLogoPreview);
      setCompanyLogoUpload(null);
      setCompanyLogoRemoved(false);
      setCompanySaved(true);
      setCompanySuccess(true);
    } catch (err) {
      console.error('[system-setup] company save error', err);
      setCompanyError(t('setup.company.errorSave'));
      setCompanySaved(false);
    } finally {
      setCompanySaving(false);
    }
  };

  const canGoPrev = currentStepGroupIndex > 0;
  const canGoNext = currentStepGroupIndex < stepGroups.length - 1;
  const nextGroup = () => {
    setCurrentStepGroupIndex((prev) => (prev < stepGroups.length - 1 ? prev + 1 : prev));
  };
  const prevGroup = () => {
    setCurrentStepGroupIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const nextSlide = () => {
    setCurrentCarouselIndex((prev) => (prev + 1) % carouselSlides.length);
  };

  const prevSlide = () => {
    setCurrentCarouselIndex((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length);
  };

  const handlePrimaryAction = () => {
    if (currentSteps.some((step) => step.id === 'mode')) {
      if (setupMode === 'backup' && backupImported) {
        navigate('/login');
        return;
      }
      nextGroup();
      return;
    }
    if (isFinalGroup) {
      navigate('/login');
      return;
    }
    nextGroup();
  };

  const companyDisabled = !supabaseConfigured || databaseHealth.status !== 'ready';
  const modeStepActive = currentSteps.some((step) => step.id === 'mode');
  const modeReady = setupMode === 'scratch' || (setupMode === 'backup' && backupImported);
  const primaryButtonLabel = modeStepActive
    ? (setupMode === 'backup' ? t('setup.mode.actions.finishBackup') : t('setup.mode.actions.continue'))
    : (isFinalGroup ? t('setup.actions.finish') : t('setup.actions.next'));
  const supabaseStepActive = currentSteps.some((step) => step.id === 'supabase');
  const accountStepActive = currentSteps.some((step) => step.id === 'account');
  const companyStepActive = currentSteps.some((step) => step.id === 'company');
  const showPrimaryFooterButton = !modeStepActive || setupMode === 'backup';
  const primaryButtonDisabled = isFinalGroup
    ? false
    : !canGoNext
      || (modeStepActive && !modeReady)
      || (supabaseStepActive && databaseHealth.status !== 'ready')
      || (accountStepActive && (!accountReady || adminStatus === 'loading'))
      || (companyStepActive && (!companySaved || companySaving || companyLoading));

  return (
    <div className="relative min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A]/10 via-[#1E293B]/5 to-transparent" />
        <div className="login-circle animate-drift-slow" style={{ width: '520px', height: '520px', top: '-160px', left: '-120px', opacity: 0.45 }} />
        <div className="login-circle animate-drift-slower" style={{ width: '320px', height: '320px', top: '18%', right: '-140px', opacity: 0.4 }} />
        <div className="login-circle animate-drift-slow" style={{ width: '220px', height: '220px', bottom: '12%', left: '8%', opacity: 0.32, animationDelay: '3s' }} />
        <div className="login-circle animate-drift-slower" style={{ width: '180px', height: '180px', bottom: '25%', right: '22%', opacity: 0.28, animationDelay: '1.5s' }} />
        <div className="login-circle animate-drift-slow" style={{ width: '140px', height: '140px', top: '12%', right: '32%', opacity: 0.25, animationDelay: '4s' }} />
      </div>

      <div className={`relative z-10 w-full max-w-5xl grid rounded-[28px] bg-white shadow-xl overflow-hidden ${
        modeStepActive ? 'lg:grid-cols-[1.45fr_0.55fr]' : 'lg:grid-cols-[1fr_1fr]'
      }`}>
        <main className="order-2 lg:order-1 px-10 py-14 sm:px-16 sm:py-16 bg-white">
          {!isFinalGroup && !modeStepActive && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {t('setup.progress.status', { current: currentStepGroupIndex + 1, total: totalGroups })}
                </p>
              </div>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </>
          )}

          {isFinalGroup ? (
            <div key={currentStepGroupIndex} className="mt-14 space-y-6 animate-slide-in">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle2 className="h-8 w-8" />
                <p className="text-xl font-semibold text-slate-900">{t('setup.final.title')}</p>
              </div>
              <p className="text-lg font-semibold text-slate-800">{t('setup.final.subtitle')}</p>
              <p className="text-sm text-slate-500 whitespace-pre-line">{t('setup.final.description')}</p>
            </div>
          ) : (
            <div key={currentStepGroupIndex} className="mt-10 space-y-8 animate-slide-in">
              {currentSteps.map((step) => {
                const hideDescription = step.id === 'mode';
                return (
                  <section key={step.id} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        <step.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{t(step.titleKey)}</p>
                        {!hideDescription && <p className="text-xs text-slate-500 mt-1">{t(step.descriptionKey)}</p>}
                      </div>
                    </div>
                    {step.id === 'welcome' ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-700">{t('setup.language.title')}</h3>
                          <div className="relative">
                            <label htmlFor="setup-language" className="sr-only">
                              {t('setup.language.label')}
                            </label>
                            <select
                              id="setup-language"
                              value={language}
                              onChange={(event) => {
                                const value = event.target.value === 'en' ? 'en' : 'fr';
                                setLanguage(value as SupportedLanguage);
                              }}
                              className="appearance-none rounded-full border border-slate-200 bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              {languageOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {`${option.flag} ${option.label}`}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                              <ChevronDown className="h-4 w-4" />
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-500 whitespace-pre-line">{t('setup.language.placeholder')}</p>
                      </div>
                    ) : null}
                    {step.id === 'mode' ? (
                      <div className="space-y-5">
                        <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-blue-600" />
                              <h4 className="text-sm font-semibold text-slate-900">{t('setup.mode.scratch.title')}</h4>
                            </div>
                            <p className="text-sm text-slate-600">{t('setup.mode.scratch.description')}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setSetupMode('scratch');
                                setBackupImportError(null);
                                nextGroup();
                              }}
                              className="inline-flex items-center gap-2 rounded-full border border-transparent bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                            >
                              {t('setup.actions.next')}
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="hidden lg:flex items-center justify-center">
                            <div className="h-full w-px bg-slate-200" />
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <ArchiveRestore className="h-4 w-4 text-emerald-600" />
                              <h4 className="text-sm font-semibold text-slate-900">{t('setup.mode.backup.title')}</h4>
                            </div>
                            <p className="text-sm text-slate-600">{t('setup.mode.backup.description')}</p>

                            <input
                              ref={backupFileInputRef}
                              type="file"
                              accept={BACKUP_FILE_ACCEPT}
                              className="sr-only"
                              disabled={backupImporting}
                              onChange={(event) => {
                                void handleBackupFileSelected(event);
                              }}
                            />

                            <button
                              type="button"
                              onClick={handleBackupUploadClick}
                              disabled={backupImporting}
                              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                                backupImporting
                                  ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                                  : 'border-transparent bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                            >
                              {backupImporting ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {t('setup.mode.backup.importing')}
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4" />
                                  {t('setup.mode.backup.import')}
                                </>
                              )}
                            </button>

                            {backupFile ? (
                              <span className="block text-xs text-slate-500">{t('setup.mode.backup.fileSelected', { name: backupFile.name })}</span>
                            ) : null}

                            {backupImportError ? (
                              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                <AlertCircle className="mt-0.5 h-4 w-4" />
                                <span>{backupImportError}</span>
                              </div>
                            ) : null}

                            {backupImported ? (
                              <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                                  <span>{t('setup.mode.backup.success')}</span>
                                </div>
                                {backupImportedAt ? (
                                  <p className="text-emerald-800/80">{new Date(backupImportedAt).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US')}</p>
                                ) : null}
                                {backupImportWarnings.length > 0 ? (
                                  <p className="text-amber-700">{t('setup.mode.backup.warningCount', { count: backupImportWarnings.length })}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {step.id === 'company' ? (
                      <div className="space-y-6">
                        <p className="text-sm text-slate-500 whitespace-pre-line">{t('setup.company.instructions')}</p>

                        {companyDisabled ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            <AlertCircle className="mt-0.5 h-4 w-4" />
                            <span>{t('setup.company.supabaseMissing')}</span>
                          </div>
                        ) : null}

                        {companyLoading ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('setup.company.loading')}
                          </div>
                        ) : null}

                        {companyError ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            <AlertCircle className="mt-0.5 h-4 w-4" />
                            <span>{companyError}</span>
                          </div>
                        ) : null}

                        {companySuccess ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                            <CheckCircle2 className="mt-0.5 h-4 w-4" />
                            <span>{t('setup.company.saved')}</span>
                          </div>
                        ) : null}

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label htmlFor="setup-company-name" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.company.name')}
                            </label>
                            <input
                              id="setup-company-name"
                              type="text"
                              value={companyName}
                              onChange={(event) => {
                                if (companyError) setCompanyError(null);
                                setCompanyName(event.target.value);
                                setCompanySaved(false);
                                setCompanySuccess(false);
                              }}
                              placeholder={t('setup.company.namePlaceholder')}
                              disabled={companyDisabled || companyLoading || companySaving}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-company-email" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.company.email')}
                            </label>
                            <input
                              id="setup-company-email"
                              type="email"
                              value={companyEmail}
                              onChange={(event) => {
                                if (companyError) setCompanyError(null);
                                setCompanyEmail(event.target.value);
                                setCompanySaved(false);
                                setCompanySuccess(false);
                              }}
                              placeholder={t('setup.company.emailPlaceholder')}
                              disabled={companyDisabled || companyLoading || companySaving}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                              autoComplete="email"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-company-legal" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.company.legalName')}
                            </label>
                            <input
                              id="setup-company-legal"
                              type="text"
                              value={companyLegalName}
                              onChange={(event) => {
                                if (companyError) setCompanyError(null);
                                setCompanyLegalName(event.target.value);
                                setCompanySaved(false);
                                setCompanySuccess(false);
                              }}
                              placeholder={t('setup.company.legalPlaceholder')}
                              disabled={companyDisabled || companyLoading || companySaving}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-company-phone" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.company.phone')}
                            </label>
                            <input
                              id="setup-company-phone"
                              type="tel"
                              value={companyPhone}
                              onChange={(event) => {
                                if (companyError) setCompanyError(null);
                                setCompanyPhone(event.target.value);
                                setCompanySaved(false);
                                setCompanySuccess(false);
                              }}
                              placeholder={t('setup.company.phonePlaceholder')}
                              disabled={companyDisabled || companyLoading || companySaving}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                              autoComplete="tel"
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1.5">
                            <label htmlFor="setup-company-address" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.company.address')}
                            </label>
                            <input
                              id="setup-company-address"
                              type="text"
                              value={companyAddress}
                              onChange={(event) => {
                                if (companyError) setCompanyError(null);
                                setCompanyAddress(event.target.value);
                                setCompanySaved(false);
                                setCompanySuccess(false);
                              }}
                              placeholder={t('setup.company.addressPlaceholder')}
                              disabled={companyDisabled || companyLoading || companySaving}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                              autoComplete="street-address"
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1.5">
                            <label htmlFor="setup-company-about" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.company.about')}
                            </label>
                            <textarea
                              id="setup-company-about"
                              value={companyAbout}
                              onChange={(event) => {
                                if (companyError) setCompanyError(null);
                                setCompanyAbout(event.target.value);
                                setCompanySaved(false);
                                setCompanySuccess(false);
                              }}
                              placeholder={t('setup.company.aboutPlaceholder')}
                              disabled={companyDisabled || companyLoading || companySaving}
                              className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          </div>
                        </div>

                        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
                          <h4 className="text-sm font-semibold text-slate-800">{t('setup.company.logoTitle')}</h4>
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                              {companyLogoPreview ? (
                                <img src={companyLogoPreview} alt={t('setup.company.logoAlt')} className="h-full w-full object-cover" />
                              ) : (
                                <ImageIcon className="h-8 w-8 text-slate-300" />
                              )}
                            </div>
                            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                              <label className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition ${
                                companyDisabled || companyLoading || companySaving
                                  ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                                  : 'border-slate-900 bg-white text-slate-700 hover:bg-slate-100'
                              }`}>
                                <input
                                  type="file"
                                  accept={LOGO_FILE_ACCEPT}
                                  className="sr-only"
                                  onChange={handleCompanyLogoChange}
                                  disabled={companyDisabled || companyLoading || companySaving}
                                />
                                <ImageIcon className="h-4 w-4" />
                                {t('setup.company.logoUpload')}
                              </label>
                              {companyLogoPreview ? (
                                <button
                                  type="button"
                                  onClick={handleCompanyLogoRemove}
                                  disabled={companyDisabled || companyLoading || companySaving}
                                  className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition ${
                                    companyDisabled || companyLoading || companySaving
                                      ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                                      : 'border-transparent bg-rose-50 text-rose-600 hover:bg-rose-100'
                                  }`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {t('setup.company.logoRemove')}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <p className="text-xs text-slate-400">{t('setup.company.logoHelper')}</p>
                        </div>

                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={handleCompanySave}
                            disabled={companyDisabled || companyLoading || companySaving}
                            className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-sm transition ${
                              companyDisabled || companyLoading || companySaving
                                ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                                : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {companySaving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('setup.company.saving')}
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4" />
                                {t('setup.company.save')}
                              </>
                            )}
                          </button>
                          <p className="text-xs text-slate-400">{t('setup.company.note')}</p>
                        </div>
                      </div>
                    ) : null}
                    {step.id === 'supabase' ? (
                      <div className="space-y-6">
                        <p className="text-sm text-slate-500 whitespace-pre-line">{t('setup.database.instructions')}</p>

                        <div className="space-y-4 rounded-3xl border border-slate-100 bg-slate-50/60 p-5">
                          {formattedSavedAt && (
                            <p className="text-xs text-slate-500">{t('setup.database.form.lastSaved', { date: formattedSavedAt })}</p>
                          )}
                          {storedSupabaseUrl && (
                            <p className="text-xs text-slate-500">{t('setup.database.form.savedUrl', { url: storedSupabaseUrl })}</p>
                          )}

                          {bootstrapRunning && databaseHealth.status !== 'ready' ? (
                            <div className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-blue-700">
                              <Loader2 className="mt-0.5 h-5 w-5 animate-spin" />
                              <div>
                                <p className="text-sm font-semibold">{t('setup.database.health.bootstrapRunning')}</p>
                              </div>
                            </div>
                          ) : null}

                          {databaseHealth.status === 'ready' ? (
                            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-700">
                              <CheckCircle2 className="mt-0.5 h-5 w-5" />
                              <div>
                                <p className="text-sm font-semibold">{t('setup.database.health.ready')}</p>
                                {formattedHealthUpdatedAt ? (
                                  <p className="mt-1 text-xs text-emerald-800/80">{formattedHealthUpdatedAt}</p>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {databaseHealth.status === 'invalid' && (
                            <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-800">
                              <AlertCircle className="mt-0.5 h-5 w-5" />
                              <div>
                                <p className="text-sm font-semibold">{t('setup.database.health.invalid')}</p>
                                {databaseHealth.message ? (
                                  <p className="mt-1 text-xs">{databaseHealth.message}</p>
                                ) : null}
                                {Array.isArray(databaseHealth.issues) && databaseHealth.issues.length > 0 ? (
                                  <div className="mt-2 text-xs text-amber-900/80">
                                    <p className="font-semibold">{t('setup.database.health.issuesTitle')}</p>
                                    <ul className="mt-1 list-disc space-y-1 pl-5">
                                      {databaseHealth.issues.map((issue, index) => (
                                        <li key={`${issue.table || 'issue'}-${index}`}>
                                          {issue.table ? issue.table : t('setup.database.health.details', { message: issue.message || issue.status || '' })}
                                          {issue.table && issue.message ? ` — ${issue.message}` : null}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )}

                          {databaseHealth.status === 'unauthorized' && (
                            <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-rose-700">
                              <AlertCircle className="mt-0.5 h-5 w-5" />
                              <div>
                                <p className="text-sm font-semibold">{t('setup.database.health.unauthorized')}</p>
                                {databaseHealth.message ? (
                                  <p className="mt-1 text-xs text-rose-600/80">{databaseHealth.message}</p>
                                ) : null}
                              </div>
                            </div>
                          )}

                          {databaseHealth.status === 'unreachable' && (
                            <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-800">
                              <AlertCircle className="mt-0.5 h-5 w-5" />
                              <div>
                                <p className="text-sm font-semibold">{t('setup.database.health.unreachable')}</p>
                                {databaseHealth.message ? (
                                  <p className="mt-1 text-xs text-amber-900/80">{databaseHealth.message}</p>
                                ) : null}
                              </div>
                            </div>
                          )}

                          {databaseHealth.status === 'failed' && (
                            <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-rose-700">
                              <AlertCircle className="mt-0.5 h-5 w-5" />
                              <div>
                                <p className="text-sm font-semibold">{t('setup.database.health.failed')}</p>
                                {databaseHealth.message ? (
                                  <p className="mt-1 text-xs text-rose-600/80">{databaseHealth.message}</p>
                                ) : null}
                              </div>
                            </div>
                          )}

                          {showStartButton ? (
                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                              <button
                                type="button"
                                onClick={triggerSupabaseStart}
                                disabled={bootstrapRunning}
                                className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-sm transition sm:w-auto ${
                                  bootstrapRunning
                                    ? 'cursor-wait border-slate-100 bg-slate-100 text-slate-400'
                                    : 'border-slate-900 bg-white text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {bootstrapRunning ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('setup.database.actions.starting')}
                                  </>
                                ) : (
                                  <>
                                    <Server className="h-4 w-4" />
                                    {t('setup.database.actions.startLocal')}
                                  </>
                                )}
                              </button>
                            </div>
                          ) : null}

                          {supabaseStartStatus === 'error' && (
                            <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-rose-700">
                              <AlertCircle className="mt-0.5 h-5 w-5" />
                              <div>
                                <p className="text-sm font-semibold">{t('setup.database.form.startError')}</p>
                                {supabaseStartMessage ? (
                                  <p className="mt-1 text-xs text-rose-600/80 break-all">{supabaseStartMessage}</p>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
                          <h4 className="text-sm font-semibold text-slate-800">{t('setup.database.manual.title')}</h4>
                          <p className="text-xs text-slate-500 whitespace-pre-line">{t('setup.database.manual.intro')}</p>
                          <ol className="list-decimal space-y-2 pl-5 text-xs text-slate-600">
                            <li>{t('setup.database.manual.step1')}</li>
                            <li>{t('setup.database.manual.step2')}</li>
                            <li>{t('setup.database.manual.step3')}</li>
                            <li>{t('setup.database.manual.step4')}</li>
                          </ol>
                          <p className="text-xs text-slate-500 whitespace-pre-line">{t('setup.database.manual.note')}</p>
                        </div>
                      </div>
                    ) : null}
                    {step.id === 'mail' ? (
                      <div className="space-y-6">
                        <p className="text-sm text-slate-500 whitespace-pre-line">{t('setup.mail.placeholder')}</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label htmlFor="setup-mail-host" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.mail.host')}
                            </label>
                            <input
                              id="setup-mail-host"
                              type="text"
                              placeholder={t('setup.mail.hostPlaceholder')}
                              disabled
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-mail-port" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.mail.port')}
                            </label>
                            <input
                              id="setup-mail-port"
                              type="text"
                              placeholder={t('setup.mail.portPlaceholder')}
                              disabled
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-mail-username" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.mail.username')}
                            </label>
                            <input
                              id="setup-mail-username"
                              type="text"
                              placeholder={t('setup.mail.usernamePlaceholder')}
                              disabled
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-mail-password" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.mail.password')}
                            </label>
                            <input
                              id="setup-mail-password"
                              type="password"
                              placeholder={t('setup.mail.passwordPlaceholder')}
                              disabled
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                            />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <p className="text-xs text-slate-400">{t('setup.mail.note')}</p>
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                          >
                            <Send className="h-4 w-4" />
                            {t('setup.mail.test')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {step.id === 'account' ? (
                      <div className="space-y-6">
                        <p className="text-sm text-slate-500 whitespace-pre-line">{t('setup.account.placeholder')}</p>

                        {!supabaseConfigured ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            <AlertCircle className="mt-0.5 h-4 w-4" />
                            <span>{t('setup.account.needsSupabase')}</span>
                          </div>
                        ) : null}

                        {adminStatus === 'loading' ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('setup.account.status.loading')}
                          </div>
                        ) : null}

                        {adminStatus === 'error' ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            <AlertCircle className="mt-0.5 h-4 w-4" />
                            <span>{t('setup.account.error.status')}</span>
                          </div>
                        ) : null}

                        {accountError ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            <AlertCircle className="mt-0.5 h-4 w-4" />
                            <span>{accountError}</span>
                          </div>
                        ) : null}

                        {accountSuccess ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                            <CheckCircle2 className="mt-0.5 h-4 w-4" />
                            <span>{t('setup.account.success')}</span>
                          </div>
                        ) : null}

                        {!accountSuccess && adminExists ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                            <span>{t('setup.account.alreadyExists')}</span>
                          </div>
                        ) : null}

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label htmlFor="setup-account-name" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.account.fullName')}
                            </label>
                            <input
                              id="setup-account-name"
                              type="text"
                              value={accountName}
                              onChange={(event) => {
                                if (accountError) setAccountError(null);
                                setAccountName(event.target.value);
                              }}
                              placeholder={t('setup.account.fullNamePlaceholder')}
                              disabled={accountSubmitting || accountReady || !supabaseConfigured}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                              autoComplete="name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-account-email" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.account.email')}
                            </label>
                            <input
                              id="setup-account-email"
                              type="email"
                              value={accountEmail}
                              onChange={(event) => {
                                if (accountError) setAccountError(null);
                                setAccountEmail(event.target.value);
                              }}
                              placeholder={t('setup.account.emailPlaceholder')}
                              disabled={accountSubmitting || accountReady || !supabaseConfigured}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                              autoComplete="email"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-account-password" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.account.password')}
                            </label>
                            <input
                              id="setup-account-password"
                              type="password"
                              value={accountPassword}
                              onChange={(event) => {
                                if (accountError) setAccountError(null);
                                setAccountPassword(event.target.value);
                              }}
                              placeholder={t('setup.account.passwordPlaceholder')}
                              disabled={accountSubmitting || accountReady || !supabaseConfigured}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                              autoComplete="new-password"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="setup-account-confirm" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              {t('setup.account.confirm')}
                            </label>
                            <input
                              id="setup-account-confirm"
                              type="password"
                              value={accountConfirm}
                              onChange={(event) => {
                                if (accountError) setAccountError(null);
                                setAccountConfirm(event.target.value);
                              }}
                              placeholder={t('setup.account.confirmPlaceholder')}
                              disabled={accountSubmitting || accountReady || !supabaseConfigured}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
                              autoComplete="new-password"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <p className="text-xs text-slate-400">{t('setup.account.note')}</p>
                          {!accountReady ? (
                            <button
                              type="button"
                              onClick={handleCreateAdmin}
                              disabled={accountSubmitting || !supabaseConfigured}
                              className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-sm transition ${
                                accountSubmitting || !supabaseConfigured
                                  ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                                  : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                            >
                              {accountSubmitting ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {t('setup.account.creating')}
                                </>
                              ) : (
                                <>
                                  <UserPlus className="h-4 w-4" />
                                  {t('setup.account.createButton')}
                                </>
                              )}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {step.id === 'finalize' ? (
                      <div className="space-y-6">
                        <p className="text-sm text-slate-500 whitespace-pre-line">{t('setup.final.instructions')}</p>
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => navigate('/setup/database')}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {t('setup.database.actions.open')}
                          </button>
                          <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-5">
                            <h4 className="text-sm font-semibold text-slate-800">{t('setup.database.manual.title')}</h4>
                            <p className="text-xs text-slate-500 whitespace-pre-line">{t('setup.database.manual.intro')}</p>
                            <ol className="list-decimal space-y-2 pl-5 text-xs text-slate-600">
                              <li>{t('setup.database.manual.step1')}</li>
                              <li>{t('setup.database.manual.step2')}</li>
                              <li>{t('setup.database.manual.step3')}</li>
                              <li>{t('setup.database.manual.step4')}</li>
                            </ol>
                            <p className="text-xs text-slate-500 whitespace-pre-line">{t('setup.database.manual.note')}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}

          <div className={`mt-12 flex items-center ${canGoPrev || currentStepGroupIndex === 0 ? 'justify-between' : 'justify-end'}`}>
            {currentStepGroupIndex === 1 ? (
              <button
                type="button"
                onClick={() => navigate('/setup/database')}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                <Database className="h-4 w-4" />
                {t('setup.actions.connectDatabase')}
              </button>
            ) : null}
            {canGoPrev && currentStepGroupIndex !== 0 && (
              <button
                type="button"
                onClick={prevGroup}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('setup.actions.previous')}
              </button>
            )}
            {showPrimaryFooterButton ? (
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={primaryButtonDisabled}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  primaryButtonDisabled
                    ? 'border-slate-100 bg-slate-100 text-slate-300 cursor-not-allowed'
                    : 'border-transparent bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {primaryButtonLabel}
                {isFinalGroup ? <CheckCircle2 className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
        </main>

        <aside className={`order-1 lg:order-2 relative bg-[#0F172A] text-white overflow-hidden ${
          modeStepActive ? 'px-8 py-12 sm:px-10 sm:py-14' : 'px-10 py-16 sm:px-16 sm:py-20'
        }`}>
          <div className="absolute inset-0">
            <div className="absolute -left-20 -top-32 h-72 w-72 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/20 blur-3xl" />
            <div className="absolute -right-16 top-16 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-500/30 via-blue-500/20 to-transparent blur-3xl" />
            <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/60 to-transparent" />
          </div>
          <div className="relative space-y-10">
            {modeStepActive ? (
              <>
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('setup.hero.preheading')}</p>
                  <h1 className="text-3xl font-semibold leading-tight">{t('setup.steps.mode.title')}</h1>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('setup.hero.preheading')}</p>
                  <h1 className="text-3xl font-semibold leading-tight whitespace-pre-line">
                    {t('setup.hero.heading')}
                  </h1>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={prevSlide}
                      className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                      aria-label={t('setup.carousel.previous')}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex-1 px-4 text-center">
                      <h2 className="text-lg font-semibold">{t(carouselSlides[currentCarouselIndex].titleKey)}</h2>
                      <p className="mt-2 text-sm text-white/80 whitespace-pre-line">
                        {t(carouselSlides[currentCarouselIndex].descriptionKey)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={nextSlide}
                      className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                      aria-label={t('setup.carousel.next')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex justify-center gap-2">
                    {carouselSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => setCurrentCarouselIndex(index)}
                        className={`h-2.5 w-2.5 rounded-full transition ${
                          index === currentCarouselIndex ? 'bg-white' : 'bg-white/30 hover:bg-white/60'
                        }`}
                        aria-label={t('setup.carousel.jump', { index: index + 1 })}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SystemSetupPage;
