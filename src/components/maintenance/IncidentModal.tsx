import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type IncidentType = 'damage' | 'theft' | 'accident' | 'loss' | 'vandalism' | 'other';
export type IncidentSeverity = 'minor' | 'moderate' | 'severe' | 'total_loss';

export interface IncidentFormData {
  equipment_id: string;
  equipment_name: string;
  serial_number: string;
  rental_id: string;
  client_id: string;
  client_name: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  incident_date: string;
  location: string;
  client_liability_percent: number;
  repair_estimate: string;
  insurance_status: string;
  insurance_provider: string;
  create_maintenance_task: boolean;
}

interface Props {
  onClose: () => void;
  onCreated: (incident: Record<string, unknown>) => void;
  prefill?: Partial<IncidentFormData>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: IncidentType; label: string }[] = [
  { value: 'damage',    label: 'Dégât / Casse' },
  { value: 'theft',     label: 'Vol' },
  { value: 'accident',  label: 'Accident' },
  { value: 'loss',      label: 'Perte' },
  { value: 'vandalism', label: 'Vandalisme' },
  { value: 'other',     label: 'Autre' },
];

const SEVERITY_OPTIONS: { value: IncidentSeverity; label: string; cls: string }[] = [
  { value: 'minor',      label: 'Mineur',       cls: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'moderate',   label: 'Modéré',       cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'severe',     label: 'Grave',        cls: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'total_loss', label: 'Perte totale', cls: 'bg-red-100 text-red-700 border-red-300' },
];

const INSURANCE_STATUS_OPTIONS = [
  { value: 'not_applicable', label: 'Non concerné' },
  { value: 'to_declare',     label: 'À déclarer' },
  { value: 'declared',       label: 'Déclaré' },
];

// ─── IncidentModal ────────────────────────────────────────────────────────────

export default function IncidentModal({ onClose, onCreated, prefill }: Props) {
  const [submitting, setSubmitting] = useState(false);

  // Equipment search
  const [equipSearch, setEquipSearch] = useState('');
  const [equipResults, setEquipResults] = useState<{ id: string; name: string; reference: string }[]>([]);
  const [equipLoading, setEquipLoading] = useState(false);
  const equipAbort = useRef<AbortController | null>(null);

  // Rental search (optional)
  const [rentalSearch, setRentalSearch] = useState('');
  const [rentalResults, setRentalResults] = useState<{ id: string; reference_code: string; client_name: string; start_date: string }[]>([]);
  const [rentalLoading, setRentalLoading] = useState(false);

  const [form, setForm] = useState<IncidentFormData>({
    equipment_id: prefill?.equipment_id ?? '',
    equipment_name: prefill?.equipment_name ?? '',
    serial_number: prefill?.serial_number ?? '',
    rental_id: prefill?.rental_id ?? '',
    client_id: prefill?.client_id ?? '',
    client_name: prefill?.client_name ?? '',
    incident_type: prefill?.incident_type ?? 'damage',
    severity: prefill?.severity ?? 'moderate',
    title: prefill?.title ?? '',
    description: prefill?.description ?? '',
    incident_date: prefill?.incident_date ?? new Date().toISOString().split('T')[0],
    location: prefill?.location ?? '',
    client_liability_percent: prefill?.client_liability_percent ?? 100,
    repair_estimate: prefill?.repair_estimate ?? '',
    insurance_status: prefill?.insurance_status ?? 'not_applicable',
    insurance_provider: prefill?.insurance_provider ?? '',
    create_maintenance_task: prefill?.create_maintenance_task ?? true,
  });

  const set = <K extends keyof IncidentFormData>(key: K, val: IncidentFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  // Equipment search
  useEffect(() => {
    if (equipSearch.length < 2) { setEquipResults([]); return; }
    equipAbort.current?.abort();
    const ctrl = new AbortController();
    equipAbort.current = ctrl;
    setEquipLoading(true);
    supabase.from('equipment').select('id, name, reference')
      .ilike('name', `%${equipSearch}%`)
      .limit(10)
      .then(({ data }) => {
        if (!ctrl.signal.aborted) {
          setEquipResults(data || []);
          setEquipLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [equipSearch]);

  // Rental search
  useEffect(() => {
    if (rentalSearch.length < 2) { setRentalResults([]); return; }
    supabase.from('rentals').select('id, reference_code, start_date, clients(name)')
      .or(`reference_code.ilike.%${rentalSearch}%`)
      .not('status', 'in', '("cancelled","archived")')
      .limit(8)
      .then(({ data }) => {
        setRentalResults((data || []).map((r: any) => ({
          id: r.id,
          reference_code: r.reference_code,
          client_name: r.clients?.name ?? '',
          start_date: r.start_date,
        })));
        setRentalLoading(false);
      });
  }, [rentalSearch]);

  // Escape to close
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose, submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipment_id) { toast.error('Sélectionnez un équipement'); return; }
    if (!form.title.trim()) { toast.error('Titre requis'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          repair_estimate: form.repair_estimate ? Number(form.repair_estimate) : null,
          client_liability_percent: Number(form.client_liability_percent),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur');
      toast.success('Sinistre déclaré');
      onCreated(data);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedCharge = form.repair_estimate
    ? (Number(form.repair_estimate) * form.client_liability_percent) / 100
    : null;

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ fontFamily: 'inherit' }}>
      <div className="absolute inset-0 bg-black/40" onClick={!submitting ? onClose : undefined} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Déclarer un sinistre</h2>
            <p className="text-xs text-gray-500 mt-0.5">Constat, responsabilité, assurance</p>
          </div>
          <button onClick={!submitting ? onClose : undefined} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">

            {/* ── Équipement ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Équipement concerné</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Équipement *</label>
                {form.equipment_id ? (
                  <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-sm font-medium text-gray-900 flex-1">{form.equipment_name}</span>
                    <button type="button" onClick={() => { set('equipment_id', ''); set('equipment_name', ''); }}
                      className="p-0.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={equipSearch} onChange={e => setEquipSearch(e.target.value)}
                        placeholder="Rechercher un équipement…"
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                    </div>
                    {(equipLoading || equipResults.length > 0) && (
                      <div className="mt-1 border border-gray-200 rounded-lg max-h-40 overflow-y-auto bg-white shadow-sm">
                        {equipLoading ? (
                          <div className="p-3 flex items-center gap-2 text-xs text-gray-400">
                            <Loader2 size={12} className="animate-spin" /> Recherche…
                          </div>
                        ) : equipResults.map(eq => (
                          <button key={eq.id} type="button"
                            onClick={() => { set('equipment_id', eq.id); set('equipment_name', eq.name); setEquipSearch(''); setEquipResults([]); }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                            <div className="text-sm font-medium text-gray-900">{eq.name}</div>
                            {eq.reference && <div className="text-xs text-gray-400">{eq.reference}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° de série</label>
                  <input value={form.serial_number} onChange={e => set('serial_number', e.target.value)}
                    placeholder="ex: SN-00123"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location liée (optionnel)</label>
                  {form.rental_id ? (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                      <span className="flex-1 truncate">{form.client_name}</span>
                      <button type="button" onClick={() => { set('rental_id', ''); set('client_id', ''); set('client_name', ''); }}
                        className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                    </div>
                  ) : (
                    <div>
                      <input value={rentalSearch} onChange={e => setRentalSearch(e.target.value)}
                        placeholder="Réf. projet…"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                      {rentalResults.length > 0 && (
                        <div className="mt-1 border border-gray-200 rounded-lg max-h-36 overflow-y-auto bg-white shadow-sm absolute z-20 w-64">
                          {rentalResults.map(r => (
                            <button key={r.id} type="button"
                              onClick={() => { set('rental_id', r.id); set('client_name', r.client_name); setRentalSearch(''); setRentalResults([]); }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0">
                              <span className="font-medium">{r.reference_code}</span>
                              {r.client_name && <span className="text-gray-500"> — {r.client_name}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Type & Sévérité ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Nature du sinistre</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => set('incident_type', opt.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.incident_type === opt.value
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Sévérité *</label>
                <div className="flex gap-2">
                  {SEVERITY_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => set('severity', opt.value)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        form.severity === opt.value ? opt.cls : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
                <input value={form.title} onChange={e => set('title', e.target.value)} required
                  placeholder="ex: Écran LED endommagé lors du retour…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date du sinistre</label>
                  <input type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Lieu</label>
                  <input value={form.location} onChange={e => set('location', e.target.value)}
                    placeholder="ex: Chantier Saint-Lazare"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                  placeholder="Décrivez les circonstances, l'étendue des dommages…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
              </div>
            </section>

            {/* ── Responsabilité & Finance ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Responsabilité & Coût</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Estimation réparation (€)</label>
                  <input type="number" min="0" step="0.01" value={form.repair_estimate} onChange={e => set('repair_estimate', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Part client : <span className="text-red-600 font-semibold">{form.client_liability_percent}%</span>
                  </label>
                  <input type="range" min="0" max="100" step="5" value={form.client_liability_percent}
                    onChange={e => set('client_liability_percent', Number(e.target.value))}
                    className="w-full accent-red-600" />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>0% (interne)</span><span>100% (client)</span>
                  </div>
                </div>
              </div>
              {estimatedCharge !== null && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-100">
                  <span className="text-xs text-gray-600">Montant à imputer au client :</span>
                  <span className="text-sm font-bold text-red-700">
                    {estimatedCharge.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              )}
            </section>

            {/* ── Assurance ── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Assurance</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Statut déclaration</label>
                  <select value={form.insurance_status} onChange={e => set('insurance_status', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white">
                    {INSURANCE_STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Assureur</label>
                  <input value={form.insurance_provider} onChange={e => set('insurance_provider', e.target.value)}
                    placeholder="ex: AXA Pro, Allianz…"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
            </section>

            {/* ── Options ── */}
            <section>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.create_maintenance_task}
                  onChange={e => set('create_maintenance_task', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                <span className="text-sm text-gray-700">
                  Créer automatiquement une tâche de maintenance corrective liée
                </span>
              </label>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl shrink-0">
            <button type="button" onClick={!submitting ? onClose : undefined}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={submitting || !form.equipment_id}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Déclarer le sinistre
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
