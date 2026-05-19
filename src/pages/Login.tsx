import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, ArrowRight, X, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { TwoFactorMethod, TwoFactorRequiredError, useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import type { SupportedLanguage } from '../i18n/translations';
import {
  type InterfaceMode,
  getPreferredInterfaceMode,
  resolvePostLoginPath,
  setPreferredInterfaceMode,
} from '../utils/interfaceMode';

type MailConfigInfo = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  hasPass?: boolean;
};

type TwoFactorChallengeState = {
  userId: string;
  email: string;
  fullName: string;
  mustChangePassword: boolean;
  methods: TwoFactorMethod[];
  emailChallengeId: string | null;
  emailExpiresAt: string | null;
};

const maskEmail = (value: string) => {
  const trimmed = (value || '').trim();
  const [local, domain] = trimmed.split('@');
  if (!domain) return trimmed;
  const safeLocal = local.length <= 2
    ? `${local.slice(0, 1)}***`
    : `${local.slice(0, 2)}***`;
  const domainParts = domain.split('.');
  if (domainParts.length === 0) return `${safeLocal}@***`;
  const domainHead = domainParts[0];
  const maskedHead = domainHead.length <= 2
    ? `${domainHead.slice(0, 1)}***`
    : `${domainHead.slice(0, 2)}***`;
  const domainTail = domainParts.slice(1).join('.');
  return `${safeLocal}@${maskedHead}${domainTail ? `.${domainTail}` : ''}`;
};

const LoginPage: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();
  const { user, login, completeTwoFactor, completeTwoFactorTotp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { fromFirstLogin?: boolean } | null) || {};
  const fromFirstLogin = !!locationState.fromFirstLogin;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [mailConfig, setMailConfig] = useState<MailConfigInfo | null>(null);
  const [mailConfigLoaded, setMailConfigLoaded] = useState(false);
  const mailConfigLooksDefault = !!mailConfig && (mailConfig.host === 'smtp.example.com' || !mailConfig.user);
  const [codeSent, setCodeSent] = useState(false);
  const [resetExpiresAt, setResetExpiresAt] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [newPasswordReset, setNewPasswordReset] = useState('');
  const [confirmPasswordReset, setConfirmPasswordReset] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallengeState | null>(null);
  const [selectedTwoFactorMethod, setSelectedTwoFactorMethod] = useState<TwoFactorMethod>('email');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorInfo, setTwoFactorInfo] = useState<string | null>(null);
  const [confirmingTwoFactor, setConfirmingTwoFactor] = useState(false);
  const [emailChallengeLoading, setEmailChallengeLoading] = useState(false);
  const twoFactorInputRef = useRef<HTMLInputElement>(null);
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>(() => getPreferredInterfaceMode());
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const greetingLines = useMemo(() => t('login.greeting').split('\n'), [t]);
  const languageOptions = useMemo(() => ([
    { value: 'fr', label: t('login.language.french'), flag: '🇫🇷' },
    { value: 'en', label: t('login.language.english'), flag: '🇬🇧' },
  ]), [t]);
  const interfaceOptions = useMemo(() => ([
    { value: 'classic' as InterfaceMode, label: t('login.interface.classic') },
    { value: 'depot' as InterfaceMode, label: t('login.interface.depot') },
  ]), [t]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const hadDark = root.classList.contains('dark');
    const bodyHadDark = body.classList.contains('dark');
    const previousColorScheme = root.style.getPropertyValue('color-scheme');
    if (hadDark) root.classList.remove('dark');
    if (bodyHadDark) body.classList.remove('dark');
    root.style.setProperty('color-scheme', 'light');
    return () => {
      if (hadDark) root.classList.add('dark');
      if (bodyHadDark) body.classList.add('dark');
      if (previousColorScheme) {
        root.style.setProperty('color-scheme', previousColorScheme);
      } else {
        root.style.removeProperty('color-scheme');
      }
    };
  }, []);

  useEffect(() => {
    if (fromFirstLogin) {
      requestAnimationFrame(() => {
        navigate(location.pathname, { replace: true, state: null });
      });
    }
  }, [fromFirstLogin, location.pathname, navigate]);

  useEffect(() => {
    if (!twoFactorChallenge) return;
    const timer = setTimeout(() => {
      twoFactorInputRef.current?.focus();
    }, 120);
    return () => clearTimeout(timer);
  }, [twoFactorChallenge]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const getPostLoginTarget = (mustChangePassword: boolean) =>
    resolvePostLoginPath(mustChangePassword, interfaceMode);

  if (user) {
    return <Navigate to={getPostLoginTarget(user.must_change_password)} replace />;
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const resetExpiryDisplay = resetExpiresAt ? new Date(resetExpiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  const displayedResetCode = resetCode.padEnd(6, '•').slice(0, 6).split('');
  const maskedTwoFactorEmail = twoFactorChallenge ? maskEmail(twoFactorChallenge.email) : '';
  const twoFactorExpiryDisplay = twoFactorChallenge?.emailExpiresAt
    ? new Date(twoFactorChallenge.emailExpiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const availableTwoFactorMethods = twoFactorChallenge?.methods ?? [];
  const displayedTwoFactorCode = twoFactorCode.padEnd(6, '•').slice(0, 6).split('');
  const dateTimeLocale = language === 'en' ? 'en-US' : 'fr-FR';
  const loginDateLabel = new Intl.DateTimeFormat(dateTimeLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(currentDateTime);
  const loginTimeLabel = new Intl.DateTimeFormat(dateTimeLocale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: language === 'en',
  }).format(currentDateTime);
  const loginLogoSrc = `${import.meta.env.BASE_URL}LogoOP.png`;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setTwoFactorError(null);
    setTwoFactorInfo(null);
    try {
      setPreferredInterfaceMode(interfaceMode);
      const account = await login(email, password);
      setTwoFactorChallenge(null);
      setTwoFactorCode('');
      const target = getPostLoginTarget(account.must_change_password);
      if (account.must_change_password) {
        navigate(target, { state: { fromWizard: true } });
      } else {
        navigate(target);
      }
    } catch (err) {
      if (err instanceof TwoFactorRequiredError) {
        setTwoFactorChallenge({
          userId: err.userId,
          email: err.email,
          fullName: err.fullName,
          mustChangePassword: err.mustChangePassword,
          methods: err.methods,
          emailChallengeId: err.challengeId || null,
          emailExpiresAt: err.expiresAt || null,
        });
        const preferred = err.methods.includes('totp') ? 'totp' : 'email';
        setSelectedTwoFactorMethod(preferred);
        setTwoFactorCode('');
        setTwoFactorError(null);
        if (err.challengeId) {
          setTwoFactorInfo(t('login.twoFactor.emailSent'));
        } else if (preferred === 'totp') {
          setTwoFactorInfo(t('login.twoFactor.appDescription'));
        } else {
          setTwoFactorInfo(err.message || t('login.twoFactor.required'));
        }
        return;
      }
      const message = err instanceof Error ? err.message : 'Échec de la connexion';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/system/mail-config')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (isMounted) setMailConfig(data);
      })
      .catch(() => {
        if (isMounted) setMailConfig(null);
      })
      .finally(() => {
        if (isMounted) setMailConfigLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSendResetCode = async () => {
    setForgotError(null);
    setForgotSuccess(null);
    setSendingCode(true);
    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setForgotError('Veuillez renseigner une adresse e-mail valide');
      setSendingCode(false);
      return;
    }
    try {
      const response = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Impossible d\'envoyer le code de réinitialisation');
      }
      setCodeSent(true);
      setResetCode('');
      setResetExpiresAt(payload?.expires_at || null);
      setForgotSuccess('Si un compte correspond, un code vient d’être envoyé. Consultez votre boîte mail.');
      setForgotStep(2);
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 150);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible d\'envoyer le code de réinitialisation';
      setForgotError(message);
    } finally {
      setSendingCode(false);
    }
  };

  const completeReset = async () => {
    setForgotError(null);
    setForgotSuccess(null);
    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setForgotError('Veuillez renseigner une adresse e-mail valide');
      return;
    }
    if (!codeSent) {
      setForgotError('Demandez d’abord un code de réinitialisation.');
      return;
    }
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setForgotError('Saisissez le code à 6 chiffres reçu par e-mail.');
      return;
    }
    if (newPasswordReset.length < 8) {
      setForgotError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPasswordReset !== confirmPasswordReset) {
      setForgotError('Les mots de passe ne correspondent pas.');
      return;
    }
    setResettingPassword(true);
    try {
      const response = await fetch('/api/auth/confirm-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          code: resetCode.trim(),
          newPassword: newPasswordReset,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Impossible de réinitialiser le mot de passe');
      }
      setResetSuccessMessage('Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter avec vos nouveaux identifiants.');
      setForgotSuccess(null);
      setCodeSent(false);
      setResetExpiresAt(null);
      setResetCode('');
      setNewPasswordReset('');
      setConfirmPasswordReset('');
      setForgotStep(4);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de réinitialiser le mot de passe';
      setForgotError(message);
    } finally {
      setResettingPassword(false);
    }
  };

  const finalizeTwoFactorLogin = (account: { must_change_password: boolean }) => {
    setError(null);
    setTwoFactorChallenge(null);
    setTwoFactorCode('');
    setTwoFactorInfo(null);
    setTwoFactorError(null);
    setSelectedTwoFactorMethod('email');
    setEmailChallengeLoading(false);
    setPreferredInterfaceMode(interfaceMode);
    const target = getPostLoginTarget(account.must_change_password);
    if (account.must_change_password) {
      navigate(target, { state: { fromWizard: true } });
    } else {
      navigate(target);
    }
  };

  const triggerEmailChallenge = useCallback(async (userId: string) => {
    if (!userId) return null;
    setEmailChallengeLoading(true);
    setTwoFactorError(null);
    try {
      const response = await fetch('/api/auth/request-two-factor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t('login.twoFactor.emailError'));
      }
      const challengeId = payload?.challenge_id ?? null;
      const expiresAt = payload?.expires_at ?? null;
      setTwoFactorChallenge((prev) => (prev ? {
        ...prev,
        emailChallengeId: challengeId,
        emailExpiresAt: expiresAt,
      } : prev));
      setTwoFactorCode('');
      setTwoFactorInfo(t('login.twoFactor.emailSent'));
      return challengeId;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('login.twoFactor.emailError');
      setTwoFactorError(message);
      return null;
    } finally {
      setEmailChallengeLoading(false);
    }
  }, [t]);

  const handleTwoFactorSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!twoFactorChallenge) return;
    const sanitized = twoFactorCode.trim();
    if (!/^[0-9]{6}$/.test(sanitized)) {
      setTwoFactorError(selectedTwoFactorMethod === 'email'
        ? 'Saisissez le code à 6 chiffres reçu par e-mail.'
        : 'Saisissez le code à 6 chiffres généré par votre application.');
      return;
    }
    setConfirmingTwoFactor(true);
    setTwoFactorError(null);
    try {
      if (selectedTwoFactorMethod === 'email') {
        let challengeIdValue = twoFactorChallenge.emailChallengeId;
        if (!challengeIdValue) {
          await triggerEmailChallenge(twoFactorChallenge.userId);
          setConfirmingTwoFactor(false);
          return;
        }
        const account = await completeTwoFactor(challengeIdValue, sanitized);
        finalizeTwoFactorLogin(account);
      } else {
        const account = await completeTwoFactorTotp(twoFactorChallenge.userId, sanitized);
        finalizeTwoFactorLogin(account);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de vérifier le code 2FA';
      setTwoFactorError(message);
    } finally {
      setConfirmingTwoFactor(false);
    }
  };

  const handleResendEmailCode = async () => {
    if (!twoFactorChallenge) return;
    await triggerEmailChallenge(twoFactorChallenge.userId);
  };

  const handleSelectTwoFactorMethod = (method: TwoFactorMethod) => {
    setSelectedTwoFactorMethod(method);
    setTwoFactorCode('');
    setTwoFactorError(null);
    if (method === 'totp') {
      setTwoFactorInfo(t('login.twoFactor.appDescription'));
    }
  };

  const handleCancelTwoFactor = () => {
    setTwoFactorChallenge(null);
    setTwoFactorCode('');
    setTwoFactorError(null);
    setTwoFactorInfo(null);
    setSelectedTwoFactorMethod('email');
    setEmailChallengeLoading(false);
  };

  useEffect(() => {
    if (!twoFactorChallenge) return;
    if (selectedTwoFactorMethod === 'email') {
      if (!twoFactorChallenge.emailChallengeId && !emailChallengeLoading) {
        triggerEmailChallenge(twoFactorChallenge.userId);
      } else if (twoFactorChallenge.emailChallengeId && !twoFactorInfo) {
        setTwoFactorInfo(t('login.twoFactor.emailHint'));
      }
    } else if (selectedTwoFactorMethod === 'totp' && twoFactorInfo !== t('login.twoFactor.appDescription')) {
      setTwoFactorInfo(t('login.twoFactor.appDescription'));
    }
  }, [twoFactorChallenge, selectedTwoFactorMethod, emailChallengeLoading, triggerEmailChallenge, twoFactorInfo, t]);

  const openForgotModal = () => {
    setForgotEmail(email);
    setForgotError(null);
    setForgotSuccess(null);
    setShowForgot(true);
    setForgotStep(1);
    setCodeSent(false);
    setResetExpiresAt(null);
    setResetCode('');
    setNewPasswordReset('');
    setConfirmPasswordReset('');
    setSendingCode(false);
    setResettingPassword(false);
    setResetSuccessMessage(null);
  };

  const closeForgotModal = () => {
    setShowForgot(false);
    setCodeSent(false);
    setResetExpiresAt(null);
    setResetCode('');
    setNewPasswordReset('');
    setConfirmPasswordReset('');
    setSendingCode(false);
    setResettingPassword(false);
    setForgotSuccess(null);
    setForgotError(null);
    setResetSuccessMessage(null);
  };

  const goToStep = (step: number) => {
    setForgotStep(step);
    setForgotError(null);
  };
  const handleStepOneNext = () => {
    if (!codeSent) {
      setForgotError('Envoyez d’abord un code pour continuer.');
      return;
    }
    goToStep(2);
  };
  const handleStepTwoNext = () => {
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setForgotError('Veuillez saisir le code à 6 chiffres reçu par e-mail.');
      return;
    }
    goToStep(3);
  };

  return (
    <div className={`login-page-bg animate-login-background relative min-h-screen flex items-center justify-center px-4 py-8 sm:py-10 ${fromFirstLogin ? 'animate-fade-in-from-login' : ''}`}>
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center gap-2">
        <div className="relative">
          <label htmlFor="login-language" className="sr-only">{t('login.language.label')}</label>
          <select
            id="login-language"
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
        <div className="relative">
          <label htmlFor="login-interface-mode" className="sr-only">{t('login.interface.label')}</label>
          <select
            id="login-interface-mode"
            value={interfaceMode}
            onChange={(event) => {
              const value = event.target.value === 'depot' ? 'depot' : 'classic';
              setInterfaceMode(value);
              setPreferredInterfaceMode(value);
            }}
            className="appearance-none rounded-full border border-slate-200 bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {interfaceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      </div>
      {showForgot && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Réinitialiser le mot de passe</h2>
                <p className="mt-1 text-sm text-slate-500">Suivez les étapes pour recevoir un code et définir un nouveau mot de passe.</p>
              </div>
              <button
                type="button"
                onClick={closeForgotModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.3em] text-slate-400">
                <span>Étape {forgotStep}</span>
                <span>/ 4</span>
              </div>

              {forgotStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">{t('login.emailLabel')}</label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendResetCode}
                    disabled={sendingCode || !mailConfigLoaded}
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {sendingCode ? 'Envoi en cours…' : 'Envoyer le code'}
                  </button>
                  {mailConfigLoaded && mailConfigLooksDefault && (
                    <p className="text-xs text-amber-600">Le service d’envoi n’est pas encore configuré. Merci de contacter un administrateur.</p>
                  )}
                  {forgotSuccess && <p className="text-sm text-emerald-600">{forgotSuccess}</p>}
                </div>
              )}

              {forgotStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Code reçu</label>
                    <div className="relative mt-2 flex justify-center">
                      <div
                        className="flex gap-2"
                        onClick={() => codeInputRef.current?.focus()}
                        role="presentation"
                      >
                        {displayedResetCode.map((char, index) => (
                          <div
                            key={index}
                            className="flex h-14 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-800"
                          >
                            {char}
                          </div>
                        ))}
                      </div>
                      <input
                        ref={codeInputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={resetCode}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                          setResetCode(digits);
                        }}
                        className="absolute inset-0 h-full w-full opacity-0"
                      />
                    </div>
                    {resetExpiryDisplay && (
                      <p className="mt-2 text-xs text-slate-500">Code valable jusqu&apos;à {resetExpiryDisplay}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSendResetCode}
                    disabled={sendingCode}
                    className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
                  >
                    {sendingCode ? 'Renvoi en cours…' : 'Renvoyer le code'}
                  </button>
                </div>
              )}

              {forgotStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="reset-password" className="text-sm font-medium text-slate-700">Nouveau mot de passe</label>
                    <div className="relative mt-2">
                      <input
                        id="reset-password"
                        type={showResetPassword ? 'text' : 'password'}
                        value={newPasswordReset}
                        onChange={(event) => setNewPasswordReset(event.target.value)}
                        autoComplete="new-password"
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        aria-label={showResetPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="reset-password-confirm" className="text-sm font-medium text-slate-700">Confirmer le mot de passe</label>
                    <div className="relative mt-2">
                      <input
                        id="reset-password-confirm"
                        type={showResetPasswordConfirm ? 'text' : 'password'}
                        value={confirmPasswordReset}
                        onChange={(event) => setConfirmPasswordReset(event.target.value)}
                        autoComplete="new-password"
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPasswordConfirm((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        aria-label={showResetPasswordConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showResetPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {forgotStep === 4 && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-500 text-2xl font-semibold">✓</div>
                  <h3 className="text-lg font-semibold text-slate-900">Mot de passe mis à jour</h3>
                  <p className="text-sm text-slate-600">
                    {resetSuccessMessage ?? 'Votre mot de passe a été modifié avec succès.'}
                  </p>
                </div>
              )}

              {forgotError && <p className="text-sm text-rose-600">{forgotError}</p>}
              {forgotSuccess && forgotStep !== 1 && <p className="text-sm text-emerald-600">{forgotSuccess}</p>}
            </div>

            {forgotStep < 4 ? (
              <div className="mt-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => (forgotStep === 1 ? closeForgotModal() : goToStep(Math.max(1, forgotStep - 1)))}
                  className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  {forgotStep === 1 ? 'Annuler' : 'Précédent'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (forgotStep === 1) handleStepOneNext();
                    else if (forgotStep === 2) handleStepTwoNext();
                    else completeReset();
                  }}
                  disabled={(forgotStep === 1 && (!codeSent || sendingCode)) || (forgotStep === 2 && sendingCode) || (forgotStep === 3 && resettingPassword)}
                  className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {forgotStep === 3 ? (resettingPassword ? 'Validation…' : 'Valider') : 'Suivant'}
                </button>
              </div>
            ) : (
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => {
                    closeForgotModal();
                    if (forgotEmail) setEmail(forgotEmail);
                  }}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                >
                  Se connecter
                </button>
              </div>
            )}
          </div>
          <div className="mt-6 flex flex-col items-start gap-1 text-xs text-slate-400">
            <span>Progression</span>
            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(forgotStep / 4) * 100}%` }} />
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="login-grid animate-login-grid" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E3A8A]/10 via-[#2563EB]/5 to-transparent" />
        <div
          className="login-aurora animate-login-aurora"
          style={{ width: '46vw', height: '46vw', minWidth: '420px', minHeight: '420px', top: '-10%', right: '6%' }}
        />
        <div
          className="login-aurora animate-login-aurora"
          style={{ width: '34vw', height: '34vw', minWidth: '320px', minHeight: '320px', bottom: '-8%', left: '10%', animationDelay: '5s' }}
        />
        <div className="login-circle animate-drift-slow" style={{ width: '520px', height: '520px', top: '-160px', left: '-120px', opacity: 0.55 }} />
        <div className="login-circle animate-drift-slower" style={{ width: '320px', height: '320px', top: '18%', right: '-140px', opacity: 0.4 }} />
        <div className="login-circle animate-drift-slow" style={{ width: '220px', height: '220px', bottom: '12%', left: '8%', opacity: 0.32, animationDelay: '3s' }} />
        <div className="login-circle animate-drift-slower" style={{ width: '180px', height: '180px', bottom: '25%', right: '22%', opacity: 0.28, animationDelay: '1.5s' }} />
        <div className="login-circle animate-drift-slow" style={{ width: '140px', height: '140px', top: '12%', right: '32%', opacity: 0.25, animationDelay: '4s' }} />
      </div>

      <div className="pointer-events-none absolute left-6 bottom-6 z-10 hidden md:block text-white drop-shadow-[0_6px_20px_rgba(15,23,42,0.35)]">
        <p className="text-base font-medium capitalize tracking-[0.08em] text-white/85">
          {loginDateLabel}
        </p>
        <p className="mt-1 text-6xl font-semibold leading-none sm:text-7xl">
          {loginTimeLabel}
        </p>
      </div>

      <div className="pointer-events-none fixed right-4 -bottom-12 z-40 block sm:right-6 sm:-bottom-14">
        <img
          src={loginLogoSrc}
          alt="Open logo"
          className="h-auto w-32 select-none object-contain opacity-95 drop-shadow-[0_6px_20px_rgba(15,23,42,0.35)] sm:w-48 md:w-64 lg:w-72"
        />
      </div>

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[1fr_1fr] rounded-2xl sm:rounded-[28px] bg-white shadow-lg sm:shadow-xl overflow-hidden">
        <div className="px-6 py-10 sm:px-16 sm:py-16">
          <h1 className="text-3xl font-semibold text-slate-900">{t('login.title')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('login.subtitle')}</p>

          <form onSubmit={handleSubmit} className="mt-8 sm:mt-10 space-y-6">
            <div>
              <label htmlFor="email" className="text-sm font-medium text-slate-700">{t('login.emailLabel')}</label>
              <div className="relative mt-2">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                  required
                  autoComplete="username"
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-medium text-slate-700">{t('login.passwordLabel')}</label>
              <div className="relative mt-2">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="password"
                  type={showLoginPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  required
                  autoComplete="current-password"
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label={showLoginPassword ? t('login.passwordHide') : t('login.passwordShow')}
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !!twoFactorChallenge}
              className={`group inline-flex w-full items-center justify-center rounded-lg bg-primary py-3 text-sm font-semibold text-white transition ${loading || twoFactorChallenge ? 'opacity-60' : 'hover:opacity-90'}`}
            >
              {t('login.submit')}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          {twoFactorChallenge && (
            <div className="mt-8 sm:mt-10 rounded-2xl border border-blue-100 bg-blue-50/70 p-6 shadow-sm">
              <div className="flex flex-col gap-2 text-blue-900">
                <h3 className="text-base font-semibold">{t('login.twoFactor.title')}</h3>
                <p className="text-sm text-blue-900/80">
                  {selectedTwoFactorMethod === 'email' ? (
                    <>
                      {t('login.twoFactor.emailDescription', { email: maskedTwoFactorEmail })}
                      {twoFactorExpiryDisplay ? ` (${t('login.twoFactor.expires', { time: twoFactorExpiryDisplay })})` : ''}
                    </>
                  ) : (
                    t('login.twoFactor.appDescription')
                  )}
                </p>
              </div>
              {availableTwoFactorMethods.length > 1 && (
                <div className="mt-4 inline-flex rounded-full bg-blue-100/70 p-1">
                  {availableTwoFactorMethods.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => handleSelectTwoFactorMethod(method)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full transition ${selectedTwoFactorMethod === method ? 'bg-white text-blue-900 shadow-sm' : 'text-blue-700/70 hover:text-blue-900'}`}
                    >
                      {method === 'email' ? t('login.twoFactor.method.email') : t('login.twoFactor.method.totp')}
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={handleTwoFactorSubmit} className="mt-4 space-y-5">
                <div>
                  <div
                    className="relative mx-auto flex justify-center"
                    onClick={() => twoFactorInputRef.current?.focus()}
                    role="presentation"
                  >
                    <div className="flex gap-2">
                      {displayedTwoFactorCode.map((char, index) => (
                        <div
                          key={index}
                          className="flex h-12 w-10 items-center justify-center rounded-lg border border-blue-200 bg-white/90 text-lg font-semibold text-blue-900 shadow-sm"
                        >
                          {char}
                        </div>
                      ))}
                    </div>
                    <input
                      ref={twoFactorInputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={twoFactorCode}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                        setTwoFactorCode(digits);
                      }}
                    className="absolute inset-0 h-full w-full opacity-0"
                    aria-label={t('login.twoFactor.codeAria')}
                    />
                  </div>
                {twoFactorInfo && (
                    <p className="mt-3 text-xs font-medium text-blue-900/90 text-center">{twoFactorInfo}</p>
                  )}
                </div>
                {twoFactorError && <p className="text-sm text-rose-600 text-center">{twoFactorError}</p>}
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button
                    type="submit"
                    disabled={confirmingTwoFactor}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {confirmingTwoFactor ? t('login.twoFactor.validating') : t('login.twoFactor.validate')}
                  </button>
                  {selectedTwoFactorMethod === 'email' && (
                    <button
                      type="button"
                      onClick={handleResendEmailCode}
                      disabled={emailChallengeLoading}
                      className="text-sm font-medium text-blue-800 hover:underline disabled:opacity-60"
                    >
                      {emailChallengeLoading ? t('login.twoFactor.resending') : t('login.twoFactor.resend')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCancelTwoFactor}
                    className="text-sm text-blue-800/70 hover:underline"
                  >
                    {t('login.twoFactor.cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="mt-8 text-xs text-slate-500">
            <button
              type="button"
              onClick={openForgotModal}
              className="font-medium text-slate-500 hover:text-primary"
            >
              {t('login.forgot')}
            </button>
          </div>
        </div>

        <div className="relative hidden lg:block bg-[#1D4ED8]">
          <div className="pointer-events-none absolute -top-32 -left-48 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-white/35 to-transparent" />
          <div className="pointer-events-none absolute bottom-20 right-16 h-28 w-28 rounded-full bg-gradient-to-br from-white/30 to-transparent" />

          <div className="absolute left-16 bottom-16 text-white">
            <p className="text-2xl font-semibold leading-tight">
              {greetingLines.map((line, idx) => (
                <React.Fragment key={idx}>
                  {line}
                  {idx < greetingLines.length - 1 && <br />}
                </React.Fragment>
              ))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
