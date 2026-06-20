import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Inbox, Search, CheckCircle2, XCircle, ArrowRight,
  CalendarDays, Package, MessageSquare, User, Clock,
  ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';

type EquipmentItem = { equipment_id: string; name: string; quantity: number };

type PortalRequest = {
  id: string;
  client_id: string;
  status: 'pending' | 'converted' | 'rejected';
  project_type: 'rental' | 'service' | null;
  start_date: string;
  end_date: string;
  message: string | null;
  equipment_items: EquipmentItem[];
  created_at: string;
  converted_at: string | null;
  rental_id: string | null;
  clients?: { id: string; name: string; email: string } | null;
};

const STATUS_CONFIG = {
  pending:   { label: 'En attente',  className: 'bg-amber-100 text-amber-700' },
  converted: { label: 'Converti',    className: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: 'Refusé',      className: 'bg-red-100 text-red-600' },
} as const;

const TYPE_LABEL: Record<string, string> = {
  rental:  'Location',
  service: 'Prestation',
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

type Tab = 'all' | 'pending' | 'converted' | 'rejected';

const PortalRequests: React.FC = () => {
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PortalRequest | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal-requests');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PortalRequest[] = await res.json();
      setRequests(data);
      setSelected(prev => prev ? (data.find(r => r.id === prev.id) ?? null) : null);
    } catch (e) {
      setError('Impossible de charger les demandes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConvert = async (id: string) => {
    setConvertingId(id);
    try {
      const res = await fetch(`/api/portal-requests/${id}/convert`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const { rental_id } = await res.json();
      await load();
      navigate(`/rentals/${rental_id}`);
    } catch {
      alert('Erreur lors de la conversion.');
    } finally {
      setConvertingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setRejectingId(id);
    try {
      const res = await fetch(`/api/portal-requests/${id}/reject`, { method: 'POST' });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      alert('Erreur lors du refus.');
    } finally {
      setRejectingId(null);
    }
  };

  const counts = {
    all:       requests.length,
    pending:   requests.filter(r => r.status === 'pending').length,
    converted: requests.filter(r => r.status === 'converted').length,
    rejected:  requests.filter(r => r.status === 'rejected').length,
  };

  const filtered = requests.filter(r => {
    if (tab !== 'all' && r.status !== tab) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(r.clients?.name || '').toLowerCase().includes(q) &&
          !(r.clients?.email || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all',       label: 'Toutes' },
    { key: 'pending',   label: 'En attente' },
    { key: 'converted', label: 'Converties' },
    { key: 'rejected',  label: 'Refusées' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100">
              <Inbox className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Demandes clients</h1>
              <p className="text-xs text-gray-400">Portail espace client</p>
            </div>
          </div>
          {counts.pending > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
              <Clock className="h-3.5 w-3.5" />
              {counts.pending} en attente
            </span>
          )}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Total',     value: counts.all,       color: 'text-gray-900' },
            { label: 'En attente', value: counts.pending,   color: 'text-amber-600' },
            { label: 'Converties', value: counts.converted, color: 'text-emerald-600' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* List panel */}
        <div className="flex flex-col w-80 flex-shrink-0 border-r border-gray-200 bg-white">
          {/* Search + tabs */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher un client…"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="flex gap-1 mt-2">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                    tab === t.key
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {t.label}
                  {counts[t.key] > 0 && (
                    <span className={`ml-1 ${tab === t.key ? 'opacity-80' : 'text-gray-400'}`}>
                      {counts[t.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Request list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Chargement…</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 mx-3 mt-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Inbox className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                <p className="text-sm text-gray-400">Aucune demande</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map(req => {
                  const status = STATUS_CONFIG[req.status];
                  const isSelected = selected?.id === req.id;
                  return (
                    <button
                      key={req.id}
                      onClick={() => setSelected(req)}
                      className={`w-full text-left px-4 py-3.5 transition-colors ${
                        isSelected
                          ? 'bg-emerald-50 border-l-2 border-emerald-500'
                          : 'hover:bg-gray-50 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-800' : 'text-gray-900'}`}>
                          {req.clients?.name || 'Client inconnu'}
                        </p>
                        <span className={`flex-shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                        <CalendarDays className="h-3 w-3" />
                        <span>{fmtDateShort(req.start_date)} → {fmtDateShort(req.end_date)}</span>
                        {req.project_type && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span>{TYPE_LABEL[req.project_type]}</span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {req.equipment_items.slice(0, 2).map((item, i) => (
                          <span key={i} className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                            {item.name} ×{item.quantity}
                          </span>
                        ))}
                        {req.equipment_items.length > 2 && (
                          <span className="text-[10px] text-gray-400">+{req.equipment_items.length - 2}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="h-16 w-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-4 shadow-sm">
                <ChevronRight className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-400">Sélectionnez une demande</p>
              <p className="text-xs text-gray-300 mt-1">Le détail s'affichera ici</p>
            </div>
          ) : (
            <DetailPanel
              req={selected}
              convertingId={convertingId}
              rejectingId={rejectingId}
              onConvert={handleConvert}
              onReject={handleReject}
            />
          )}
        </div>
      </div>
    </div>
  );
};

type AvailInfo = { total: number | null; reserved: number | null; available: number | null };

const DetailPanel: React.FC<{
  req: PortalRequest;
  convertingId: string | null;
  rejectingId: string | null;
  onConvert: (id: string) => void;
  onReject: (id: string) => void;
}> = ({ req, convertingId, rejectingId, onConvert, onReject }) => {
  const status = STATUS_CONFIG[req.status];
  const [avail, setAvail] = useState<Record<string, AvailInfo> | null>(null);
  const [availLoading, setAvailLoading] = useState(false);

  useEffect(() => {
    if (req.status !== 'pending' || req.equipment_items.length === 0) { setAvail(null); return; }
    const ids = req.equipment_items.map(i => i.equipment_id).filter(Boolean).join(',');
    if (!ids) { setAvail(null); return; }
    setAvailLoading(true);
    fetch(`/api/equipment/availability?start=${req.start_date}&end=${req.end_date}&ids=${ids}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setAvail(data))
      .catch(() => setAvail(null))
      .finally(() => setAvailLoading(false));
  }, [req.id, req.start_date, req.end_date, req.status]);

  const conflicts = req.equipment_items.filter(item => {
    const a = avail?.[item.equipment_id];
    return a !== undefined && a.available !== null && a.available < item.quantity;
  });

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">{req.clients?.name || 'Client inconnu'}</p>
              {req.clients?.email && (
                <p className="text-xs text-gray-400">{req.clients.email}</p>
              )}
            </div>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
            {status.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Type" value={req.project_type ? TYPE_LABEL[req.project_type] : '—'} />
          <InfoRow label="Soumise le" value={fmtDateTime(req.created_at)} />
          <InfoRow label="Début" value={fmtDate(req.start_date)} />
          <InfoRow label="Fin" value={fmtDate(req.end_date)} />
          {req.converted_at && (
            <InfoRow label="Convertie le" value={fmtDateTime(req.converted_at)} />
          )}
        </div>

        {req.status === 'pending' && (
          <>
            {availLoading && (
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Vérification des disponibilités…
              </div>
            )}
            {!availLoading && conflicts.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Conflits de disponibilité
                </p>
                <ul className="space-y-0.5">
                  {conflicts.map(item => {
                    const a = avail![item.equipment_id];
                    return (
                      <li key={item.equipment_id} className="text-xs text-amber-700">
                        <span className="font-medium">{item.name}</span>
                        {' — '}demandé ×{item.quantity}, disponible : {a.available ?? '?'}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
              <button
                onClick={() => onConvert(req.id)}
                disabled={convertingId === req.id}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                <CheckCircle2 className="h-4 w-4" />
                {convertingId === req.id ? 'Création…' : 'Créer le projet'}
              </button>
              <button
                onClick={() => onReject(req.id)}
                disabled={rejectingId === req.id}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
              >
                <XCircle className="h-4 w-4" />
                {rejectingId === req.id ? 'Refus…' : 'Refuser'}
              </button>
            </div>
          </>
        )}

        {req.status === 'converted' && req.rental_id && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <Link
              to={`/rentals/${req.rental_id}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <ArrowRight className="h-4 w-4" />
              Voir le projet créé
            </Link>
          </div>
        )}
      </div>

      {/* Equipment */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-gray-400" />
          Matériel demandé
          <span className="ml-auto text-xs font-normal text-gray-400">{req.equipment_items.length} article(s)</span>
        </h3>
        {req.equipment_items.length === 0 ? (
          <p className="text-xs text-gray-400">Aucun matériel spécifié.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {req.equipment_items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-800">{item.name}</span>
                <span className="text-sm font-semibold text-gray-500 tabular-nums">×{item.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message */}
      {req.message && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-400" />
            Message du client
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{req.message}</p>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
    <p className="text-sm font-medium text-gray-800">{value}</p>
  </div>
);

export default PortalRequests;
