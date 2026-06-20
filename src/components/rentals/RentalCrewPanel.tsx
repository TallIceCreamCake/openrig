import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, Loader2, Plus, Search, Trash2, UserCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Rental } from '../../types/rental';

// ─── Types ───────────────────────────────────────────────────────────────────

type CrewRole = {
  id: string;
  name: string;
  code: string;
  color: string;
  default_payment_model: string | null;
  sort_order: number;
};

type PersonnelUser = {
  id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  avatar_url: string | null;
  app_user_hr?: {
    employment_type: string | null;
    payment_model: string | null;
    default_hourly_rate: number | null;
    default_day_rate: number | null;
    default_cachet_rate: number | null;
  } | null;
};

type CrewAssignment = {
  id: string;
  rental_id: string;
  personnel_id: string;
  crew_role_id: string | null;
  assignment_status: 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
  planned_start_at: string | null;
  planned_end_at: string | null;
  expected_payment_model: string | null;
  expected_hourly_rate: number | null;
  expected_day_rate: number | null;
  expected_days: number | null;
  expected_hours: number | null;
  expected_gross_amount: number | null;
  notes: string | null;
  personnel: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
  crew_role: { id: string; name: string; code: string; color: string } | null;
};

type ConflictEntry = {
  id: string;
  rental_id: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  assignment_status: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:       { label: 'Brouillon',   cls: 'bg-gray-100 text-gray-600' },
  confirmed:   { label: 'Confirmé',    cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'En cours',    cls: 'bg-amber-100 text-amber-700' },
  done:        { label: 'Terminé',     cls: 'bg-green-100 text-green-700' },
};

const STATUSES = ['draft', 'confirmed', 'in_progress', 'done'] as const;

const PAYMENT_LABELS: Record<string, string> = {
  daily:  'Jour',
  hourly: 'Heure',
  cachet: 'Cachet',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDatetime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rentalDefaultStart(rental: Rental): string {
  const base = rental.start_date?.split('T')[0] ?? new Date().toISOString().split('T')[0];
  return `${base}T08:00`;
}

function rentalDefaultEnd(rental: Rental): string {
  const base = (rental.end_date ?? rental.start_date)?.split('T')[0] ?? new Date().toISOString().split('T')[0];
  return `${base}T18:00`;
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ user }: { user: { first_name: string; last_name: string; avatar_url?: string | null } }) {
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();
  if (user.avatar_url) {
    return <img src={user.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
      {initials}
    </div>
  );
}

// ─── StatusDropdown ──────────────────────────────────────────────────────────

function StatusDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setMenuStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, zIndex: 9999 });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onOut = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [open]);

  const cfg = STATUS_CFG[value] ?? STATUS_CFG.draft;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openMenu}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${cfg.cls}`}
      >
        {cfg.label}
        <ChevronDown size={10} />
      </button>
      {open && createPortal(
        <div style={menuStyle} className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
          {STATUSES.map(s => (
            <button
              key={s}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${value === s ? 'font-semibold' : ''}`}
            >
              {STATUS_CFG[s].label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── AssignmentModal ─────────────────────────────────────────────────────────

type ModalProps = {
  rental: Rental;
  roles: CrewRole[];
  personnel: PersonnelUser[];
  onClose: () => void;
  onSaved: (a: CrewAssignment) => void;
};

function AssignmentModal({ rental, roles, personnel, onClose, onSaved }: ModalProps) {
  const [search, setSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<PersonnelUser | null>(null);
  const [roleId, setRoleId] = useState('');
  const [startAt, setStartAt] = useState(rentalDefaultStart(rental));
  const [endAt, setEndAt] = useState(rentalDefaultEnd(rental));
  const [paymentModel, setPaymentModel] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [days, setDays] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const conflictAbort = useRef<AbortController | null>(null);

  const filtered = personnel.filter(p => {
    const q = search.toLowerCase();
    return !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || (p.role ?? '').toLowerCase().includes(q);
  });

  // When person changes, auto-fill rates from HR profile
  const selectPerson = (p: PersonnelUser) => {
    setSelectedPerson(p);
    setSearch('');
    const hr = p.app_user_hr;
    if (!hr) return;
    const model = hr.payment_model ?? '';
    setPaymentModel(model);
    if (model === 'daily' && hr.default_day_rate) setDayRate(String(hr.default_day_rate));
    else if (model === 'hourly' && hr.default_hourly_rate) setHourlyRate(String(hr.default_hourly_rate));
  };

  // Conflict check when person + dates are set
  useEffect(() => {
    if (!selectedPerson || !startAt || !endAt) { setConflicts([]); return; }
    conflictAbort.current?.abort();
    const ctrl = new AbortController();
    conflictAbort.current = ctrl;
    setConflictLoading(true);
    const params = new URLSearchParams({
      personnel_id: selectedPerson.id,
      start: new Date(startAt).toISOString(),
      end: new Date(endAt).toISOString(),
      exclude_rental: rental.id,
    });
    fetch(`/api/crew-conflicts?${params}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => { setConflicts(Array.isArray(d) ? d : []); setConflictLoading(false); })
      .catch(() => { if (!ctrl.signal.aborted) setConflictLoading(false); });
    return () => ctrl.abort();
  }, [selectedPerson, startAt, endAt, rental.id]);

  // Compute estimated cost
  const estimatedCost = React.useMemo(() => {
    if (paymentModel === 'daily' && dayRate && days) return Number(dayRate) * Number(days);
    if (paymentModel === 'hourly' && hourlyRate && hours) return Number(hourlyRate) * Number(hours);
    return null;
  }, [paymentModel, dayRate, days, hourlyRate, hours]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson) { toast.error('Sélectionnez un technicien'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rentals/${rental.id}/crew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personnel_id: selectedPerson.id,
          crew_role_id: roleId || null,
          planned_start_at: startAt ? new Date(startAt).toISOString() : null,
          planned_end_at: endAt ? new Date(endAt).toISOString() : null,
          expected_payment_model: paymentModel || null,
          expected_day_rate: dayRate ? Number(dayRate) : null,
          expected_days: days ? Number(days) : null,
          expected_hourly_rate: hourlyRate ? Number(hourlyRate) : null,
          expected_hours: hours ? Number(hours) : null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'already_assigned') toast.error('Cette personne est déjà affectée à ce projet');
        else toast.error('Erreur lors de l\'ajout');
        return;
      }
      onSaved(data);
      toast.success('Membre ajouté à l\'équipe');
      onClose();
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  };

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!submitting ? onClose : undefined} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Ajouter un membre à l'équipe</h2>
          <button onClick={!submitting ? onClose : undefined} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">

            {/* Person picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Technicien / Personnel</label>
              {selectedPerson ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <Avatar user={selectedPerson} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{selectedPerson.first_name} {selectedPerson.last_name}</div>
                    {selectedPerson.role && <div className="text-xs text-gray-500">{selectedPerson.role}</div>}
                  </div>
                  <button type="button" onClick={() => setSelectedPerson(null)} className="p-1 hover:bg-gray-200 rounded text-gray-400">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher par nom ou rôle…"
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                  </div>
                  {/* Résultats inline — évite le clipping par overflow-y-auto du formulaire */}
                  {filtered.length > 0 && (
                    <div className="mt-1 border border-gray-200 rounded-lg max-h-44 overflow-y-auto bg-white shadow-sm">
                      {filtered.slice(0, 20).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPerson(p)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0"
                        >
                          <Avatar user={p} />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{p.first_name} {p.last_name}</div>
                            {p.role && <div className="text-xs text-gray-500">{p.role}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {search && filtered.length === 0 && (
                    <div className="mt-1 p-3 text-sm text-gray-400 text-center border border-gray-200 rounded-lg bg-white">
                      Aucun résultat
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Conflict warning */}
            {selectedPerson && (
              conflictLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 size={12} className="animate-spin" />
                  Vérification des conflits…
                </div>
              ) : conflicts.length > 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{conflicts.length} conflit{conflicts.length > 1 ? 's' : ''} détecté{conflicts.length > 1 ? 's' : ''}</span>
                    {' '}— cette personne est déjà affectée sur d'autres projets aux mêmes dates.
                  </div>
                </div>
              ) : null
            )}

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Rôle sur le projet</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRoleId('')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!roleId ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}
                >
                  Non défini
                </button>
                {roles.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoleId(r.id)}
                    style={roleId === r.id ? { backgroundColor: r.color, borderColor: r.color, color: '#fff' } : { borderColor: r.color, color: r.color }}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${roleId !== r.id ? 'bg-white hover:opacity-80' : ''}`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Début prévu</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={e => setStartAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fin prévue</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={e => setEndAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Payment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Rémunération estimée</label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {(['daily', 'hourly', 'cachet'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentModel(paymentModel === m ? '' : m)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${paymentModel === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                  >
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
              {paymentModel === 'daily' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Taux journalier (€)</label>
                    <input type="number" min="0" step="0.01" value={dayRate} onChange={e => setDayRate(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nombre de jours</label>
                    <input type="number" min="0" step="0.5" value={days} onChange={e => setDays(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              )}
              {paymentModel === 'hourly' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Taux horaire (€)</label>
                    <input type="number" min="0" step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nombre d'heures</label>
                    <input type="number" min="0" step="0.5" value={hours} onChange={e => setHours(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              )}
              {estimatedCost !== null && (
                <div className="mt-2 text-sm font-semibold text-indigo-700">
                  Coût estimé : {estimatedCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Instructions particulières, matériel à prévoir…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <button
              type="button"
              onClick={!submitting ? onClose : undefined}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!selectedPerson || submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Ajouter à l'équipe
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── RentalCrewPanel ─────────────────────────────────────────────────────────

type Props = {
  rental: Rental;
};

export default function RentalCrewPanel({ rental }: Props) {
  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);
  const [roles, setRoles] = useState<CrewRole[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [personnelLoaded, setPersonnelLoaded] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [crewRes, rolesRes] = await Promise.all([
        fetch(`/api/rentals/${rental.id}/crew`),
        fetch('/api/crew-roles'),
      ]);
      if (crewRes.ok) setAssignments(await crewRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());
    } finally {
      setLoading(false);
    }
  }, [rental.id]);

  useEffect(() => { load(); }, [load]);

  const openModal = async () => {
    if (!personnelLoaded) {
      const res = await fetch('/api/personnel-list');
      if (res.ok) setPersonnel(await res.json());
      setPersonnelLoaded(true);
    }
    setShowModal(true);
  };

  const handleSaved = (a: CrewAssignment) => {
    setAssignments(prev => [...prev, a]);
  };

  const handleStatusChange = async (id: string, status: string) => {
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, assignment_status: status as CrewAssignment['assignment_status'] } : a));
    try {
      await fetch(`/api/crew-assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_status: status }),
      });
    } catch {
      toast.error('Impossible de mettre à jour le statut');
      load();
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!window.confirm(`Retirer ${name} de l'équipe ?`)) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/crew-assignments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAssignments(prev => prev.filter(a => a.id !== id));
        toast.success('Membre retiré de l\'équipe');
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setRemovingId(null);
    }
  };

  const totalCost = assignments.reduce((sum, a) => sum + (a.expected_gross_amount ?? 0), 0);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Équipe projet</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {assignments.length === 0
              ? 'Aucun membre affecté'
              : `${assignments.length} membre${assignments.length > 1 ? 's' : ''} • Coût estimé : ${totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`
            }
          </p>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <Plus size={15} />
          Ajouter
        </button>
      </div>

      {/* Empty state */}
      {assignments.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <UserCheck size={22} className="text-gray-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-700">Aucun membre dans l'équipe</div>
            <div className="text-xs text-gray-400 mt-0.5">Affectez des techniciens, régisseurs et intermittents à ce projet.</div>
          </div>
          <button onClick={openModal} className="mt-1 text-sm text-indigo-600 hover:underline font-medium">
            Ajouter un premier membre →
          </button>
        </div>
      )}

      {/* Assignment list */}
      {assignments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {assignments.map(a => {
              const fullName = a.personnel
                ? `${a.personnel.first_name} ${a.personnel.last_name}`
                : 'Personnel inconnu';
              const costStr = a.expected_gross_amount != null
                ? a.expected_gross_amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
                : null;

              return (
                <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
                  {/* Avatar */}
                  {a.personnel ? (
                    <Avatar user={a.personnel} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <UserCheck size={14} className="text-gray-400" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{fullName}</span>
                      {a.crew_role && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: hexToRgba(a.crew_role.color, 0.12),
                            color: a.crew_role.color,
                          }}
                        >
                          {a.crew_role.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      {(a.planned_start_at || a.planned_end_at) && (
                        <span>
                          {fmtDate(a.planned_start_at)}
                          {a.planned_end_at && a.planned_end_at !== a.planned_start_at && ` → ${fmtDate(a.planned_end_at)}`}
                        </span>
                      )}
                      {costStr && (
                        <span className="font-medium text-gray-700">{costStr}</span>
                      )}
                      {a.notes && (
                        <span className="italic text-gray-400 truncate max-w-[200px]">{a.notes}</span>
                      )}
                    </div>
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusDropdown
                      value={a.assignment_status}
                      onChange={s => handleStatusChange(a.id, s)}
                    />
                    <button
                      onClick={() => handleRemove(a.id, fullName)}
                      disabled={removingId === a.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {removingId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cost summary */}
          {totalCost > 0 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <span className="text-sm font-semibold text-gray-700">
                Total estimé : {totalCost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Role legend */}
      {roles.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {roles.map(r => (
            <span
              key={r.id}
              className="px-2 py-0.5 rounded-full text-xs"
              style={{ backgroundColor: hexToRgba(r.color, 0.1), color: r.color }}
            >
              {r.name}
            </span>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AssignmentModal
          rental={rental}
          roles={roles}
          personnel={personnel}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
