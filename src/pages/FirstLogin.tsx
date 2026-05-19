import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, Check, LogOut, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const passwordChecks = [
  { label: 'Au moins 8 caractères', test: (value: string) => value.length >= 8 },
  { label: 'Une lettre majuscule', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Une lettre minuscule', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Un chiffre', test: (value: string) => /\d/.test(value) },
  { label: 'Un caractère spécial', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

const FirstLoginPage: React.FC = () => {
  const { user, logout, markPasswordUpdated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { fromWizard?: boolean } | null) || {};
  const fromLogin = !!locationState.fromWizard;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    if (fromLogin) {
      requestAnimationFrame(() => {
        navigate(location.pathname, { replace: true, state: null });
      });
    }
  }, [fromLogin, location.pathname, navigate]);

  const requirements = useMemo(() => passwordChecks.map((check) => ({
    ...check,
    satisfied: check.test(newPassword),
  })), [newPassword]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!user) {
      setError('Session expirée. Veuillez vous reconnecter.');
      return;
    }
    const unmet = requirements.filter((item) => !item.satisfied);
    if (unmet.length > 0) {
      setError('Votre nouveau mot de passe ne respecte pas toutes les exigences.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (!currentPassword) {
      setError('Veuillez saisir votre mot de passe temporaire.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('change_password', {
        p_user_id: user.id,
        p_old_password: currentPassword,
        p_new_password: newPassword,
      });
      if (rpcError) {
        throw rpcError;
      }
      if (data !== true) {
        throw new Error('Le mot de passe actuel est incorrect.');
      }
      markPasswordUpdated();
      toast.success('Mot de passe mis à jour avec succès');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de mettre à jour le mot de passe.';
      if (/Password too short/i.test(message)) {
        setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`relative min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10 transition-opacity duration-500 ${fromLogin ? 'animate-fade-in-from-login' : ''}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E3A8A]/10 via-[#2563EB]/5 to-transparent" />
        <div className="login-circle animate-drift-slow" style={{ width: '520px', height: '520px', top: '-160px', left: '-120px', opacity: 0.55 }} />
        <div className="login-circle animate-drift-slower" style={{ width: '320px', height: '320px', top: '18%', right: '-140px', opacity: 0.4 }} />
        <div className="login-circle animate-drift-slow" style={{ width: '220px', height: '220px', bottom: '12%', left: '8%', opacity: 0.32, animationDelay: '3s' }} />
        <div className="login-circle animate-drift-slower" style={{ width: '180px', height: '180px', bottom: '25%', right: '22%', opacity: 0.28, animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[1fr_1fr] rounded-[28px] bg-white shadow-xl overflow-hidden">
        <div className="px-10 py-14 sm:px-16 sm:py-16">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Définir votre mot de passe</h1>
              <p className="mt-2 text-sm text-slate-500">
                Ce compte utilise un mot de passe temporaire. Personnalisez votre accès dès maintenant.
              </p>
              {user?.email && (
                <p className="mt-3 text-xs font-medium text-primary/80">
                  Connecté en tant que {user.email}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { logout(); navigate('/login', { state: { fromFirstLogin: true } }); }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            <div>
              <label htmlFor="current-password" className="text-sm font-medium text-slate-700">
                Mot de passe temporaire
              </label>
              <div className="relative mt-2">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Mot de passe envoyé par e-mail"
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label={showCurrentPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="new-password" className="text-sm font-medium text-slate-700">
                  Nouveau mot de passe
                </label>
                <div className="relative mt-2">
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                  Confirmer le nouveau mot de passe
                </label>
                <div className="relative mt-2">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Lock className="h-4 w-4 text-primary" />
                Exigences du mot de passe
              </div>
              <ul className="mt-3 space-y-2 text-xs text-slate-500">
                {requirements.map((item) => (
                  <li key={item.label} className="flex items-center gap-2">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      item.satisfied ? 'border-emerald-300 bg-emerald-100 text-emerald-600' : 'border-slate-200 bg-white text-slate-400'
                    }`}>
                      <Check className="h-3 w-3" />
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`group inline-flex w-full items-center justify-center rounded-lg bg-primary py-3 text-sm font-semibold text-white transition ${submitting ? 'opacity-60' : 'hover:opacity-90'}`}
            >
              Valider et continuer
            </button>
          </form>
        </div>

        <div className="relative hidden lg:block bg-[#2563EB]">
          <div className="pointer-events-none absolute -top-32 -left-48 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-white/35 to-transparent" />
          <div className="pointer-events-none absolute bottom-20 right-16 h-28 w-28 rounded-full bg-gradient-to-br from-white/30 to-transparent" />

          <div className="absolute left-16 bottom-16 text-white">
            <p className="text-2xl font-semibold leading-tight">Sécurisons<br />votre accès</p>
            <p className="mt-3 text-sm text-white/70 max-w-[200px]">
              Choisissez un mot de passe robuste pour protéger votre espace Open RIG.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstLoginPage;
