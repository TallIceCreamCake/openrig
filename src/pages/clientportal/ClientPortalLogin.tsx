import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Mail, X, Mail as MailIcon, Phone, MapPin, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type CompanyContact = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

const ClientPortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFirstTime, setShowFirstTime] = useState(false);
  const [contact, setContact] = useState<CompanyContact | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const hadDark = root.classList.contains('dark');
    if (hadDark) root.classList.remove('dark');
    body.classList.remove('dark');
    root.style.setProperty('color-scheme', 'light');
    return () => {
      if (hadDark) root.classList.add('dark');
      root.style.removeProperty('color-scheme');
    };
  }, []);

  useEffect(() => {
    fetch('/api/client-portal/company-info')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setContact(d))
      .catch(() => setContact({ name: 'votre prestataire', email: null, phone: null, address: null }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/client-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Identifiants invalides');
        return;
      }
      localStorage.setItem('cp_token', data.token);
      localStorage.setItem('cp_email', data.email);
      localStorage.setItem('cp_client_id', data.client_id);
      if (data.must_change_password) {
        navigate('/espaceclient/changer-mot-de-passe');
      } else {
        navigate('/espaceclient/accueil');
      }
    } catch {
      setError('Impossible de se connecter. Vérifiez votre connexion réseau.');
    } finally {
      setLoading(false);
    }
  };

  const logoSrc = `${import.meta.env.BASE_URL}LogoOP.png`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50/40 to-slate-100 px-4 py-10">

      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute rounded-full bg-emerald-400/10 blur-3xl"
          style={{ width: 600, height: 600, top: '-10%', right: '-8%' }}
        />
        <div
          className="absolute rounded-full bg-teal-300/10 blur-3xl"
          style={{ width: 400, height: 400, bottom: '-6%', left: '-4%' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-4xl">

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden grid lg:grid-cols-[1fr_1.1fr]">

          {/* ── Left: branding panel ── */}
          <div className="relative flex flex-col justify-between bg-emerald-600 px-10 py-12 text-white overflow-hidden">
            {/* decorative circles */}
            <div className="pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute bottom-10 right-[-60px] h-48 w-48 rounded-full bg-white/8" />
            <div className="pointer-events-none absolute top-1/2 right-4 h-24 w-24 rounded-full bg-emerald-500/50" />

            <div className="relative">
              <img
                src={logoSrc}
                alt="OpenRig"
                className="h-40 w-auto object-contain brightness-0 invert select-none"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>

            <div className="relative mt-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Espace Client
              </div>
              <h1 className="text-3xl font-bold leading-tight">
                Bienvenue sur<br />votre portail
              </h1>
              <p className="mt-4 text-sm text-emerald-100 leading-relaxed max-w-xs">
                Consultez vos projets, vos factures et vos documents en toute simplicité.
              </p>
            </div>

            <p className="relative mt-8 text-xs text-emerald-200/60">
              Propulsé par OpenRig
            </p>
          </div>

          {/* ── Right: form ── */}
          <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
            <div className="max-w-sm w-full mx-auto">
              <h2 className="text-2xl font-bold text-slate-900">Connexion</h2>
              <p className="mt-1 text-sm text-slate-500">Entrez vos identifiants pour accéder à votre espace.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="cp-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Adresse e-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="cp-email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/25"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cp-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="cp-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-12 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/25"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                      aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Connexion en cours…
                    </span>
                  ) : 'Se connecter'}
                </button>
              </form>

              <div className="mt-6 space-y-2 text-center">
                <p className="text-xs text-slate-400">
                  Problème de connexion ?{' '}
                  <span className="text-slate-500 font-medium">Contactez votre prestataire.</span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowFirstTime(true)}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline transition"
                >
                  Première fois ?
                </button>
              </div>
            </div>
          </div>

        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} OpenRig — Tous droits réservés
        </p>
      </div>

      {/* ── Première fois modal ── */}
      {showFirstTime && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowFirstTime(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between bg-emerald-600 px-6 py-5 text-white">
              <div>
                <h2 className="text-base font-bold">Première connexion ?</h2>
                <p className="text-xs text-emerald-100 mt-0.5">Voici comment accéder à votre espace client.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFirstTime(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/20 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Steps */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">1</div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  <span className="font-medium text-slate-800">Votre espace doit d'abord être activé</span> par votre prestataire. Si ce n'est pas encore fait, prenez contact avec lui directement.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">2</div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Une fois votre accès créé, <span className="font-medium text-slate-800">un e-mail vous sera envoyé</span> à votre adresse avec vos identifiants et un mot de passe provisoire.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">3</div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Connectez-vous avec ces identifiants, puis modifiez votre mot de passe pour sécuriser votre compte.
                </p>
              </div>

              {/* Info banner */}
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <Info className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Si vous avez déjà reçu votre e-mail mais que la connexion échoue, vérifiez vos spams ou contactez votre prestataire pour réinitialiser votre accès.
                </p>
              </div>
            </div>

            {/* Contact */}
            {contact && (
              <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Contacter votre prestataire</p>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{contact.name}</p>
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-emerald-600 hover:underline">
                      <MailIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      {contact.phone}
                    </a>
                  )}
                  {contact.address && (
                    <p className="flex items-start gap-2 text-sm text-slate-500">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      {contact.address}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFirstTime(false)}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPortalLogin;
