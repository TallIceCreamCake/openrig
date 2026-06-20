import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Calendar, Send, Plus, Minus, ShoppingCart, CheckCircle, ChevronLeft, Loader2 } from 'lucide-react';
import ClientPortalLayout from './ClientPortalLayout';
import DateRangePicker from '../../components/ui/DateRangePicker';

type PublicEquipment = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  image_url: string | null;
  rental_price_ht: number;
  rental_price_ttc: number;
};

type CartItem = {
  equipment: PublicEquipment;
  quantity: number;
};

const ClientPortalRequest: React.FC = () => {
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState<PublicEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [projectType, setProjectType] = useState<'rental' | 'service'>('rental');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState<Record<string, { total: number | null; reserved: number | null; available: number | null }>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const availAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('cp_token');
    if (!token) { setLoading(false); return; }
    fetch('/api/client-portal/public-equipment', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setEquipment(data);
        else throw new Error('Format inattendu');
      })
      .catch((e) => setError(`Impossible de charger le catalogue. (${e.message})`))
      .finally(() => setLoading(false));
  }, []);

  // Fetch availability whenever dates + equipment list are ready
  useEffect(() => {
    if (!startDate || !endDate || equipment.length === 0) {
      setAvailability({});
      return;
    }
    if (availAbortRef.current) availAbortRef.current.abort();
    const ctrl = new AbortController();
    availAbortRef.current = ctrl;

    setAvailabilityLoading(true);
    const ids = equipment.map(e => e.id).join(',');
    const token = localStorage.getItem('cp_token');
    fetch(`/api/equipment/availability?start=${startDate}&end=${endDate}&ids=${ids}`, {
      signal: ctrl.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setAvailability(data))
      .catch(() => {})
      .finally(() => setAvailabilityLoading(false));
  }, [startDate, endDate, equipment]);

  const setQty = (item: PublicEquipment, delta: number) => {
    const maxQty = availability[item.id]?.available ?? Infinity;
    setCart((prev) => {
      const existing = prev.find((c) => c.equipment.id === item.id);
      if (!existing) {
        if (delta <= 0) return prev;
        const capped = Number.isFinite(maxQty) ? Math.min(delta, maxQty) : delta;
        if (capped <= 0) return prev;
        return [...prev, { equipment: item, quantity: capped }];
      }
      const newQty = existing.quantity + delta;
      if (newQty <= 0) return prev.filter((c) => c.equipment.id !== item.id);
      const capped = Number.isFinite(maxQty) ? Math.min(newQty, maxQty) : newQty;
      return prev.map((c) => c.equipment.id === item.id ? { ...c, quantity: capped } : c);
    });
  };

  const getQty = (id: string) => cart.find((c) => c.equipment.id === id)?.quantity ?? 0;

  const handleSubmit = async () => {
    if (!startDate || !endDate) { setError('Veuillez sélectionner les dates.'); return; }
    if (cart.length === 0) { setError('Ajoutez au moins un équipement à votre demande.'); return; }
    if (new Date(endDate) < new Date(startDate)) { setError('La date de fin doit être après la date de début.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const token = localStorage.getItem('cp_token');
      const res = await fetch('/api/client-portal/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          message: message.trim() || null,
          project_type: projectType,
          equipment_items: cart.map((c) => ({
            equipment_id: c.equipment.id,
            name: c.equipment.name,
            quantity: c.quantity,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setSubmitted(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Erreur lors de l'envoi : ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <ClientPortalLayout>
        {() => (
          <div className="max-w-lg mx-auto px-4 py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Demande envoyée !</h2>
            <p className="text-slate-500 mb-8">
              Votre demande de projet a bien été transmise. Notre équipe va l'étudier et vous recontactera rapidement.
            </p>
            <button
              onClick={() => navigate('/espaceclient/accueil')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Retour à l'accueil
            </button>
          </div>
        )}
      </ClientPortalLayout>
    );
  }

  return (
    <ClientPortalLayout>
      {() => (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="mb-8">
            <p className="text-sm font-medium text-emerald-600 uppercase tracking-wider mb-1">Espace Client</p>
            <h1 className="text-3xl font-bold text-slate-900">Demande de projet</h1>
            <p className="mt-2 text-slate-500">
              Sélectionnez le matériel souhaité, choisissez vos dates et décrivez votre projet.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Equipment catalog */}
            <div className="lg:col-span-2">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-600" />
                Catalogue matériel
              </h2>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse">
                      <div className="h-32 rounded-xl bg-slate-100 mb-3" />
                      <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-slate-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : equipment.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Aucun équipement disponible pour le moment.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {equipment.map((item) => {
                    const qty = getQty(item.id);
                    const avail = availability[item.id];
                    const availCount = avail?.available ?? null;
                    const isUnavailable = availCount !== null && availCount <= 0;
                    const isAtMax = availCount !== null && qty >= availCount;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border bg-white overflow-hidden transition-shadow ${
                          isUnavailable
                            ? 'border-red-200 opacity-75'
                            : qty > 0
                              ? 'border-emerald-300 shadow-md'
                              : 'border-slate-200 shadow-sm'
                        }`}
                      >
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-36 object-cover" />
                        ) : (
                          <div className="w-full h-36 bg-slate-100 flex items-center justify-center">
                            <Package className="h-10 w-10 text-slate-300" />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-semibold text-slate-800 leading-tight">{item.name}</p>
                            {qty > 0 && (
                              <span className="flex-shrink-0 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                ×{qty}
                              </span>
                            )}
                          </div>
                          {item.type && (
                            <p className="text-xs text-slate-400 mb-1">{item.type}{item.subtype ? ` · ${item.subtype}` : ''}</p>
                          )}
                          {/* Availability badge — only shown when dates are selected */}
                          {startDate && endDate && (
                            <div className="mb-2">
                              {availabilityLoading && availCount === null ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  Vérification…
                                </span>
                              ) : availCount === null ? null : isUnavailable ? (
                                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                                  Indisponible
                                </span>
                              ) : availCount === 1 ? (
                                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  1 restant
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  {availCount} disponibles
                                </span>
                              )}
                            </div>
                          )}
                          {item.description && (
                            <p className="text-xs text-slate-500 mb-3 line-clamp-2">{item.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-auto">
                            <button
                              onClick={() => setQty(item, -1)}
                              disabled={qty === 0}
                              className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-medium text-slate-700">{qty}</span>
                            <button
                              onClick={() => setQty(item, 1)}
                              disabled={isUnavailable || isAtMax}
                              className="h-8 w-8 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar: summary + form */}
            <div className="space-y-5">
              {/* Type de projet */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Type de projet</h3>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {([['rental', 'Location'], ['service', 'Prestation']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setProjectType(value)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                        projectType === value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  Période souhaitée
                </h3>
                <DateRangePicker
                  start={startDate ? `${startDate}T00:00:00` : null}
                  end={endDate ? `${endDate}T23:59:59` : null}
                  onChange={({ start, end }) => {
                    setStartDate(start ? start.slice(0, 10) : '');
                    setEndDate(end ? end.slice(0, 10) : '');
                  }}
                  minDate={new Date()}
                  accentColor="emerald"
                  vertical
                  hideToggle
                  placeholder="Sélectionner une période"
                />
              </div>

              {/* Cart summary */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-emerald-600" />
                  Matériel sélectionné
                </h3>
                {cart.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Aucun matériel sélectionné</p>
                ) : (
                  <ul className="space-y-2">
                    {cart.map((c) => (
                      <li key={c.equipment.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-700 truncate">{c.equipment.name}</span>
                        <span className="flex-shrink-0 text-xs font-medium text-emerald-600">×{c.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Message */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="block text-sm font-semibold text-slate-800 mb-2">Message (optionnel)</label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Décrivez votre projet, contraintes particulières..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-none"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || cart.length === 0 || !startDate || !endDate}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Envoi en cours...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ClientPortalLayout>
  );
};

export default ClientPortalRequest;
