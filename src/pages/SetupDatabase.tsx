import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, HelpCircle, ExternalLink, Loader2, X } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';
import { useNavigate } from 'react-router-dom';

const SetupDatabasePage: React.FC = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const connectUrl = useMemo(
    () => import.meta.env.VITE_SUPABASE_CONNECT_URL || 'https://supabase.com/dashboard/projects',
    [],
  );

  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [storedSupabaseUrl, setStoredSupabaseUrl] = useState<string | null>(null);
  const [anonKey, setAnonKey] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [hasStoredService, setHasStoredService] = useState(false);
  const [hasStoredAnon, setHasStoredAnon] = useState(false);
  const [hasOpenedSupabase, setHasOpenedSupabase] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const redirectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/system/database-connection-status');
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        if (typeof payload?.supabaseUrl === 'string' && payload.supabaseUrl) {
          setStoredSupabaseUrl(payload.supabaseUrl);
        }
        if (typeof payload?.savedAt === 'string' && payload.savedAt) {
          setSavedAt(payload.savedAt);
        }
        setHasStoredService(Boolean(payload?.hasServiceRoleKey));
        setHasStoredAnon(Boolean(payload?.hasAnonKey));
      } catch {
        // ignore prefill errors
      }
    };

    fetchStatus();

    return () => {
      cancelled = true;
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const formattedSavedAt = useMemo(() => {
    if (!savedAt) return null;
    try {
      return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(savedAt));
    } catch (err) {
      return savedAt;
    }
  }, [language, savedAt]);

  const translateError = (code: string | null) => {
    if (!code) return t('setup.database.form.error.generic');
    const key = `setup.database.form.error.${code}`;
    const translated = t(key);
    return translated === key ? t('setup.database.form.error.generic') : translated;
  };

  const handleOpenSupabase = () => {
    setHasOpenedSupabase(true);
    window.open(connectUrl, '_blank', 'noopener,noreferrer');
    setErrorCode(null);
  };

  const trimmedSupabaseUrl = supabaseUrl.trim();
  const trimmedAnonKey = anonKey.trim();
  const trimmedServiceRoleKey = serviceRoleKey.trim();

  const useStoredKeys =
    hasStoredAnon &&
    hasStoredService &&
    !trimmedSupabaseUrl &&
    !trimmedAnonKey &&
    !trimmedServiceRoleKey;

  const isSaveDisabled =
    (!trimmedSupabaseUrl && !storedSupabaseUrl) ||
    (!useStoredKeys && (!trimmedAnonKey || !trimmedServiceRoleKey));

  const handleSave = async () => {
    if (isSaveDisabled) return;

    setStatus('pending');
    setErrorCode(null);

    try {
      const res = await fetch('/api/system/connect-existing-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: useStoredKeys ? '' : trimmedSupabaseUrl,
          anonKey: useStoredKeys ? '' : trimmedAnonKey,
          serviceRoleKey: useStoredKeys ? '' : trimmedServiceRoleKey,
          skipVerification: true,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.ok === false) {
        setStatus('error');
        setErrorCode(
          typeof payload?.error === 'string'
            ? payload.error
            : typeof payload?.reason === 'string'
              ? payload.reason
              : 'generic',
        );
        return;
      }

      if (typeof payload?.supabaseUrl === 'string' && payload.supabaseUrl) {
        setStoredSupabaseUrl(payload.supabaseUrl);
      }
      if (typeof payload?.savedAt === 'string' && payload.savedAt) {
        setSavedAt(payload.savedAt);
      }

      if (typeof payload?.supabaseUrl === 'string' && payload.supabaseUrl) {
        setStoredSupabaseUrl(payload.supabaseUrl);
      }
      setHasStoredService(true);
      setHasStoredAnon(Boolean(payload?.hasAnonKey ?? true));

      setStatus('success');
      setErrorCode(null);
      setSupabaseUrl('');
      setAnonKey('');
      setServiceRoleKey('');

      redirectTimeoutRef.current = window.setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err) {
      console.error('[setup/database] verification error', err);
      setStatus('error');
      setErrorCode('generic');
    }
  };

  const hasStoredCredentials = hasStoredAnon && hasStoredService;

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

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[1fr_1fr] rounded-[28px] bg-white shadow-xl overflow-hidden">
        <main className="order-2 lg:order-1 px-10 py-14 sm:px-16 sm:py-16 bg-white space-y-10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/setup')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('setup.database.back')}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 shadow-sm transition hover:bg-slate-100"
            >
              <HelpCircle className="h-5 w-5" />
              <span className="sr-only">{t('setup.database.help.open')}</span>
            </button>
          </div>

          <div className="space-y-6 animate-slide-in">
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold text-slate-900">{t('setup.database.heading')}</h1>
              <p className="text-sm text-slate-600 whitespace-pre-line">{t('setup.database.instructions')}</p>
              {formattedSavedAt && (
                <p className="text-xs text-slate-400">{t('setup.database.form.lastSaved', { date: formattedSavedAt })}</p>
              )}
              {storedSupabaseUrl && (
                <p className="text-xs text-slate-500">
                  {t('setup.database.form.savedUrl', { url: storedSupabaseUrl })}
                </p>
              )}
              {hasStoredCredentials && (
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-600">
                  {t('setup.database.form.existing')}
                </div>
              )}
            </div>

            <div className="space-y-6 rounded-3xl border border-slate-100 bg-slate-50/60 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t('setup.database.actionTitle')}</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{t('setup.database.actionDescription')}</p>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="setup-supabase-url" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {t('setup.database.form.supabaseUrl.label')}
                  </label>
                  <input
                    id="setup-supabase-url"
                    type="url"
                    autoComplete="off"
                    value={supabaseUrl}
                    onChange={(event) => setSupabaseUrl(event.target.value)}
                    placeholder={t('setup.database.form.supabaseUrl.placeholder')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="text-xs text-slate-500">{t('setup.database.form.supabaseUrl.help')}</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="setup-anon-key" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {t('setup.database.form.anonKey.label')}
                  </label>
                  <textarea
                    id="setup-anon-key"
                    autoComplete="off"
                    value={anonKey}
                    onChange={(event) => setAnonKey(event.target.value)}
                    placeholder={t('setup.database.form.anonKey.placeholder')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    rows={2}
                  />
                  <p className="text-xs text-slate-500">{t('setup.database.form.anonKey.help')}</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="setup-service-role" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {t('setup.database.form.serviceKey.label')}
                  </label>
                  <textarea
                    id="setup-service-role"
                    autoComplete="off"
                    value={serviceRoleKey}
                    onChange={(event) => setServiceRoleKey(event.target.value)}
                    placeholder={t('setup.database.form.serviceKey.placeholder')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    rows={2}
                  />
                  <p className="text-xs text-slate-500">{t('setup.database.form.serviceKey.help')}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleOpenSupabase}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  disabled={status === 'pending'}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('setup.database.actions.open')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={status === 'pending' || isSaveDisabled}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-sm transition ${
                    status === 'pending' || isSaveDisabled
                      ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                      : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {status === 'pending' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('setup.database.actions.saving')}
                    </>
                  ) : (
                    <>
                      {t('setup.database.actions.save')}
                    </>
                  )}
                </button>
              </div>

              {status === 'success' && (
                <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="text-sm font-semibold">{t('setup.database.form.status.successTitle')}</p>
                    <p className="text-xs mt-1">{t('setup.database.form.status.successBody')}</p>
                    <p className="text-xs mt-2 text-emerald-600/80">{t('setup.database.form.status.redirect')}</p>
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-rose-700">
                  <AlertCircle className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="text-sm font-semibold">{t('setup.database.form.status.errorTitle')}</p>
                    <p className="text-xs mt-1">{t('setup.database.form.status.errorBody')}</p>
                    <p className="text-xs mt-2 text-rose-600/80">{translateError(errorCode)}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-800">{t('setup.database.manual.title')}</h2>
              <p className="text-xs text-slate-500 whitespace-pre-line">{t('setup.database.manual.intro')}</p>
              <ol className="list-decimal space-y-2 pl-5 text-xs text-slate-600">
                <li>{t('setup.database.manual.step1')}</li>
                <li>{t('setup.database.manual.step2')}</li>
                <li>{t('setup.database.manual.step3')}</li>
                <li>{t('setup.database.manual.step4')}</li>
              </ol>
              <p className="text-xs text-slate-500 whitespace-pre-line">{t('setup.database.manual.note')}</p>
            </div>

            {hasOpenedSupabase && status === 'idle' && (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">{t('setup.database.actions.reminder')}</p>
            )}
          </div>
        </main>

        <aside className="order-1 lg:order-2 relative px-10 py-16 sm:px-16 sm:py-20 bg-[#0F172A] text-white overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute -left-20 -top-32 h-72 w-72 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/20 blur-3xl" />
            <div className="absolute -right-16 top-16 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-500/30 via-blue-500/20 to-transparent blur-3xl" />
            <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/60 to-transparent" />
          </div>

          <div className="relative space-y-8">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">{t('setup.database.heroPreheading')}</p>
              <h2 className="text-3xl font-semibold leading-tight whitespace-pre-line">
                {t('setup.database.heroHeading')}
              </h2>
              <p className="text-sm text-white/80 whitespace-pre-line">{t('setup.database.heroDescription')}</p>
            </div>

            <p className="text-xs text-white/70 whitespace-pre-line">{t('setup.database.progress.note')}</p>
          </div>
        </aside>
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl space-y-4 rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t('setup.database.help.title')}</h2>
                <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{t('setup.database.help.intro')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
              >
                <span className="sr-only">{t('setup.database.help.close')}</span>
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>{t('setup.database.help.step1')}</li>
              <li>{t('setup.database.help.step2')}</li>
              <li>{t('setup.database.help.step3')}</li>
              <li>{t('setup.database.help.step4')}</li>
            </ol>
            <p className="text-xs text-slate-500">{t('setup.database.help.note')}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                {t('setup.database.help.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupDatabasePage;
