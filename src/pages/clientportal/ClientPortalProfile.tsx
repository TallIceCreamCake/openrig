import React, { useState } from 'react';
import ClientPortalLayout, { CPUser } from './ClientPortalLayout';
import { Building2, CheckCircle, Phone, Save, User, AlertTriangle } from 'lucide-react';

const token = () => localStorage.getItem('cp_token') || '';

// ── Profile edit form ───────────────────────────────────────────────────────
const ProfileForm: React.FC<{ user: CPUser; onUpdated: (u: Partial<CPUser>) => void }> = ({ user, onUpdated }) => {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = name.trim() !== (user.name || '') || phone.trim() !== (user.phone || '');

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/client-portal/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (!res.ok) throw new Error();
      onUpdated({ name: name.trim() || null, phone: phone.trim() || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Une erreur est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <User className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Informations personnelles</h2>
          <p className="text-xs text-slate-400 mt-0.5">Ces informations sont visibles par votre prestataire.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">Adresse e-mail</label>
        <input
          type="email"
          value={user.email}
          disabled
          className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
        />
        <p className="text-xs text-slate-400">L'adresse e-mail ne peut pas être modifiée ici.</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">Nom complet</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          placeholder="Votre nom"
          className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">
          <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Téléphone</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
          placeholder="Ex : +33 6 00 00 00 00"
          className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!hasChanges || saving}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {saved ? (
          <><CheckCircle className="h-4 w-4" />Enregistré</>
        ) : (
          <><Save className="h-4 w-4" />{saving ? 'Enregistrement…' : 'Enregistrer'}</>
        )}
      </button>
    </div>
  );
};

// ── Company report form ─────────────────────────────────────────────────────
const CompanyReportForm: React.FC<{ companyName: string }> = ({ companyName }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/client-portal/company-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
      setMessage('');
    } catch {
      setError("Impossible d'envoyer le signalement. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Signaler une erreur — {companyName}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Une information de votre entreprise est incorrecte ou obsolète ? Signalez-la ici.
          </p>
        </div>
      </div>

      {sent ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-4">
          <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Signalement envoyé</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Votre prestataire a bien reçu votre message et y donnera suite.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Décrivez précisément l'information incorrecte (nom, adresse, SIRET, forme juridique…) et la valeur correcte.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Votre message</label>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setError(null); }}
              rows={4}
              placeholder="Ex : L'adresse enregistrée est incorrecte, la bonne adresse est…"
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm resize-none focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <p className="text-xs text-slate-400 text-right">{message.length} / 1000</p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={!message.trim() || sending || message.length > 1000}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <AlertTriangle className="h-4 w-4" />
            {sending ? 'Envoi…' : 'Envoyer le signalement'}
          </button>
        </>
      )}
    </div>
  );
};

// ── Page principale ─────────────────────────────────────────────────────────
const ProfileContent: React.FC<{ user: CPUser }> = ({ user }) => {
  const [localUser, setLocalUser] = useState<CPUser>(user);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-600 uppercase tracking-wider mb-1">Mon profil</p>
        <h1 className="text-2xl font-bold text-slate-900">Mes informations</h1>
      </div>

      <ProfileForm
        user={localUser}
        onUpdated={(updates) => setLocalUser((u) => ({ ...u, ...updates }))}
      />

      {localUser.company_client_id && localUser.company_name && (
        <CompanyReportForm companyName={localUser.company_name} />
      )}
    </div>
  );
};

const ClientPortalProfile: React.FC = () => (
  <ClientPortalLayout>
    {(user) => <ProfileContent user={user} />}
  </ClientPortalLayout>
);

export default ClientPortalProfile;
