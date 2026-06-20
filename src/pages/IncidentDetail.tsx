import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle, ChevronRight, Edit2,
  FileText, Loader2, Save, Shield, Trash2, Upload, Wrench, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

type IncidentStatus = 'reported' | 'assessed' | 'claimed' | 'in_repair' | 'resolved' | 'closed';
type InsuranceStatus = 'not_applicable' | 'to_declare' | 'declared' | 'accepted' | 'refused' | 'paid';

interface Incident {
  id: string;
  equipment_id: string | null;
  serial_number: string | null;
  equipment_name: string | null;
  rental_id: string | null;
  client_id: string | null;
  client_name: string | null;
  incident_type: string;
  severity: string;
  status: IncidentStatus;
  title: string;
  description: string | null;
  incident_date: string | null;
  location: string | null;
  client_liability_percent: number;
  repair_estimate: number | null;
  final_cost: number | null;
  client_charge_amount: number | null;
  insurance_status: InsuranceStatus;
  insurance_claim_number: string | null;
  insurance_provider: string | null;
  insurance_coverage_amount: number | null;
  maintenance_task_id: string | null;
  assessed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  equipment?: { id: string; name: string; reference: string } | null;
  rentals?: { id: string; reference_code: string; start_date: string; end_date: string; status: string } | null;
  clients?: { id: string; name: string; email: string; phone: string } | null;
  documents?: IncidentDoc[];
}

interface IncidentDoc {
  id: string;
  doc_type: string;
  title: string;
  file_url: string;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  damage: 'Dégât / Casse', theft: 'Vol', accident: 'Accident',
  loss: 'Perte', vandalism: 'Vandalisme', other: 'Autre',
};
const TYPE_EMOJI: Record<string, string> = {
  damage: '🔨', theft: '🔓', accident: '⚠️', loss: '🔍', vandalism: '🪨', other: '📋',
};

const SEVERITY_CFG: Record<string, { label: string; cls: string }> = {
  minor:      { label: 'Mineur',       cls: 'bg-green-100 text-green-700' },
  moderate:   { label: 'Modéré',       cls: 'bg-amber-100 text-amber-700' },
  severe:     { label: 'Grave',        cls: 'bg-orange-100 text-orange-700' },
  total_loss: { label: 'Perte totale', cls: 'bg-red-100 text-red-700' },
};

const STATUS_FLOW: { key: IncidentStatus; label: string; icon: React.ReactNode }[] = [
  { key: 'reported',  label: 'Déclaré',       icon: <AlertTriangle size={14} /> },
  { key: 'assessed',  label: 'Expertisé',     icon: <Edit2 size={14} /> },
  { key: 'claimed',   label: 'Décl. assur.',  icon: <Shield size={14} /> },
  { key: 'in_repair', label: 'En réparation', icon: <Wrench size={14} /> },
  { key: 'resolved',  label: 'Résolu',        icon: <CheckCircle size={14} /> },
  { key: 'closed',    label: 'Clôturé',       icon: <CheckCircle size={14} /> },
];

const STATUS_IDX: Record<IncidentStatus, number> = {
  reported: 0, assessed: 1, claimed: 2, in_repair: 3, resolved: 4, closed: 5,
};

const INSURANCE_STATUS_CFG: Record<InsuranceStatus, { label: string; cls: string }> = {
  not_applicable: { label: 'Non concerné', cls: 'bg-gray-100 text-gray-600' },
  to_declare:     { label: 'À déclarer',   cls: 'bg-amber-100 text-amber-700' },
  declared:       { label: 'Déclaré',      cls: 'bg-blue-100 text-blue-700' },
  accepted:       { label: 'Accepté',      cls: 'bg-teal-100 text-teal-700' },
  refused:        { label: 'Refusé',       cls: 'bg-red-100 text-red-700' },
  paid:           { label: 'Remboursé',    cls: 'bg-emerald-100 text-emerald-700' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  photo: 'Photo', assessment: 'Expertise', quote: 'Devis réparation',
  insurance_claim: 'Déclaration assurance', invoice: 'Facture', other: 'Autre',
};

const fmt = (amount: number | null | undefined) =>
  amount != null ? amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—';
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

// ─── IncidentDetailPage ───────────────────────────────────────────────────────

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editStatus, setEditStatus] = useState<IncidentStatus>('reported');
  const [editFinalCost, setEditFinalCost] = useState('');
  const [editInsuranceStatus, setEditInsuranceStatus] = useState<InsuranceStatus>('not_applicable');
  const [editClaimNumber, setEditClaimNumber] = useState('');
  const [editCoverageAmount, setEditCoverageAmount] = useState('');
  const [editLiability, setEditLiability] = useState(100);
  const [editDescription, setEditDescription] = useState('');
  const [editEstimate, setEditEstimate] = useState('');

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('photo');
  const [docFile, setDocFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/incidents/${id}`);
      if (!res.ok) { navigate('/maintenance'); return; }
      const data: Incident = await res.json();
      setIncident(data);
      setEditStatus(data.status);
      setEditFinalCost(data.final_cost != null ? String(data.final_cost) : '');
      setEditInsuranceStatus(data.insurance_status);
      setEditClaimNumber(data.insurance_claim_number ?? '');
      setEditCoverageAmount(data.insurance_coverage_amount != null ? String(data.insurance_coverage_amount) : '');
      setEditLiability(data.client_liability_percent);
      setEditDescription(data.description ?? '');
      setEditEstimate(data.repair_estimate != null ? String(data.repair_estimate) : '');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!incident) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          final_cost: editFinalCost ? Number(editFinalCost) : null,
          insurance_status: editInsuranceStatus,
          insurance_claim_number: editClaimNumber || null,
          insurance_coverage_amount: editCoverageAmount ? Number(editCoverageAmount) : null,
          client_liability_percent: editLiability,
          description: editDescription || null,
          repair_estimate: editEstimate ? Number(editEstimate) : null,
        }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Sinistre mis à jour');
      setEditing(false);
      load();
    } catch {
      toast.error('Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  const uploadDoc = async () => {
    if (!incident || !docFile || !docTitle.trim()) return;
    setUploadingDoc(true);
    try {
      const path = `incidents/${incident.id}/${Date.now()}_${docFile.name}`;
      const { error: upErr } = await supabase.storage.from('rental-documents').upload(path, docFile, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('rental-documents').getPublicUrl(path);
      const res = await fetch(`/api/incidents/${incident.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, title: docTitle, file_url: publicUrl }),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success('Document ajouté');
      setDocTitle(''); setDocFile(null); setDocType('photo');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur upload');
    } finally {
      setUploadingDoc(false);
    }
  };

  const deleteDoc = async (docId: string) => {
    if (!incident) return;
    if (!window.confirm('Supprimer ce document ?')) return;
    await fetch(`/api/incidents/${incident.id}/documents/${docId}`, { method: 'DELETE' });
    load();
  };

  const handleDelete = async () => {
    if (!incident) return;
    if (!window.confirm(`Supprimer le sinistre "${incident.title}" ? Cette action est irréversible.`)) return;
    await fetch(`/api/incidents/${incident.id}`, { method: 'DELETE' });
    toast.success('Sinistre supprimé');
    navigate('/maintenance?tab=incidents');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }
  if (!incident) return null;

  const currentIdx = STATUS_IDX[incident.status];
  const sev = SEVERITY_CFG[incident.severity] ?? { label: incident.severity, cls: 'bg-gray-100 text-gray-600' };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/maintenance?tab=incidents" className="hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft size={14} /> Sinistres
        </Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium truncate">{incident.title}</span>
      </div>

      {/* ── Header card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-5 border-b border-red-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-2xl shrink-0">
                {TYPE_EMOJI[incident.incident_type] ?? '📋'}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{incident.title}</h1>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sev.cls}`}>
                    {sev.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 flex-wrap">
                  <span>{TYPE_LABELS[incident.incident_type] ?? incident.incident_type}</span>
                  {incident.equipment_name && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="font-medium">{incident.equipment_name}</span>
                    </>
                  )}
                  {incident.serial_number && (
                    <span className="text-gray-400 font-mono text-xs">{incident.serial_number}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Déclaré le {fmtDate(incident.created_at)}
                  {incident.incident_date && ` · Sinistre le ${fmtDate(incident.incident_date)}`}
                  {incident.location && ` · ${incident.location}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!editing ? (
                <button onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  <Edit2 size={14} /> Modifier
                </button>
              ) : (
                <>
                  <button onClick={() => setEditing(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Annuler
                  </button>
                  <button onClick={save} disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Sauvegarder
                  </button>
                </>
              )}
              <button onClick={handleDelete}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Status timeline ── */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-0">
            {STATUS_FLOW.map((step, i) => {
              const done = currentIdx > i;
              const active = currentIdx === i;
              const isLast = i === STATUS_FLOW.length - 1;
              return (
                <React.Fragment key={step.key}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                      done ? 'bg-red-500 border-red-500 text-white'
                           : active ? 'bg-white border-red-500 text-red-600'
                                    : 'bg-white border-gray-200 text-gray-400'
                    }`}>
                      {step.icon}
                    </div>
                    <span className={`text-[10px] font-medium whitespace-nowrap ${
                      done ? 'text-red-600' : active ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 ${done ? 'bg-red-400' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {editing && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUS_FLOW.map(s => (
                <button key={s.key} type="button"
                  onClick={() => setEditStatus(s.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border ${
                    editStatus === s.key ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Body cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          {/* Description */}
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Description</div>
            {editing ? (
              <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={4}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {incident.description || <span className="text-gray-400 italic">Aucune description</span>}
              </p>
            )}
          </div>

          {/* Context (rental / client) */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Contexte</div>
            {incident.rentals && (
              <Link to={`/rentals/${incident.rentals.id}`}
                className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                <FileText size={16} className="text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{incident.rentals.reference_code}</div>
                  <div className="text-xs text-gray-500">
                    {fmtDate(incident.rentals.start_date)} → {fmtDate(incident.rentals.end_date)}
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600" />
              </Link>
            )}
            {incident.client_name && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500">Client :</span>
                <span className="text-sm font-medium text-gray-900">{incident.client_name}</span>
              </div>
            )}
            {incident.maintenance_task_id && (
              <Link to={`/maintenance/${incident.maintenance_task_id}`}
                className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors group">
                <Wrench size={16} className="text-orange-500" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-orange-800">Tâche de maintenance liée</div>
                </div>
                <ChevronRight size={14} className="text-orange-400" />
              </Link>
            )}
          </div>

          {/* Financial */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Financier</div>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Estimation réparation (€)</label>
                  <input type="number" min="0" step="0.01" value={editEstimate}
                    onChange={e => setEditEstimate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Coût final (€)</label>
                  <input type="number" min="0" step="0.01" value={editFinalCost}
                    onChange={e => setEditFinalCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    Part client : <strong className="text-red-600">{editLiability}%</strong>
                  </label>
                  <input type="range" min="0" max="100" step="5" value={editLiability}
                    onChange={e => setEditLiability(Number(e.target.value))}
                    className="w-full accent-red-600" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  { label: 'Estimation', val: fmt(incident.repair_estimate) },
                  { label: 'Coût final', val: fmt(incident.final_cost) },
                  { label: 'Part client', val: `${incident.client_liability_percent}%` },
                  { label: 'À facturer client', val: fmt(incident.client_charge_amount) },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-500">{row.label}</span>
                    <span className={`text-sm font-semibold ${row.label === 'À facturer client' ? 'text-red-700' : 'text-gray-900'}`}>
                      {row.val}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Insurance */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Assurance</div>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Statut</label>
                  <select value={editInsuranceStatus} onChange={e => setEditInsuranceStatus(e.target.value as InsuranceStatus)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white">
                    {Object.entries(INSURANCE_STATUS_CFG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">N° de sinistre assurance</label>
                  <input value={editClaimNumber} onChange={e => setEditClaimNumber(e.target.value)}
                    placeholder="Référence dossier assureur"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Montant pris en charge assurance (€)</label>
                  <input type="number" min="0" step="0.01" value={editCoverageAmount}
                    onChange={e => setEditCoverageAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-gray-400" />
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${INSURANCE_STATUS_CFG[incident.insurance_status]?.cls}`}>
                    {INSURANCE_STATUS_CFG[incident.insurance_status]?.label}
                  </span>
                  {incident.insurance_provider && (
                    <span className="text-xs text-gray-500">{incident.insurance_provider}</span>
                  )}
                </div>
                {incident.insurance_claim_number && (
                  <div className="text-xs text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded">
                    Dossier : {incident.insurance_claim_number}
                  </div>
                )}
                {incident.insurance_coverage_amount != null && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-xs text-gray-500">Remboursement</span>
                    <span className="text-sm font-semibold text-teal-700">{fmt(incident.insurance_coverage_amount)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Documents ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Documents & Photos</h2>
          <span className="text-xs text-gray-400">{incident.documents?.length ?? 0} fichier(s)</span>
        </div>

        <div className="divide-y divide-gray-50">
          {(!incident.documents || incident.documents.length === 0) && (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              Aucun document joint — ajoutez photos, constats, devis de réparation…
            </div>
          )}
          {incident.documents?.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50">
              <FileText size={16} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{doc.title}</div>
                <div className="text-xs text-gray-400">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</div>
              </div>
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline shrink-0">
                Ouvrir
              </a>
              <button onClick={() => deleteDoc(doc.id)}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Upload form */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-100">
          <div className="grid grid-cols-3 gap-3">
            <input value={docTitle} onChange={e => setDocTitle(e.target.value)}
              placeholder="Titre du document"
              className="col-span-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white">
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer ${
              docFile ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}>
              <Upload size={14} />
              {docFile ? docFile.name.substring(0, 20) + '…' : 'Choisir un fichier'}
              <input type="file" className="hidden" onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <button onClick={uploadDoc} disabled={!docFile || !docTitle.trim() || uploadingDoc}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {uploadingDoc ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Ajouter le document
          </button>
        </div>
      </div>
    </div>
  );
}
