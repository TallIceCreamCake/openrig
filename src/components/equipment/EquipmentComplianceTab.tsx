import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

type EquipmentUnitSummary = {
  id: string;
  serial_number: string | null;
  status: string | null;
  warehouse_id: string | null;
};

type ComplianceRequirement = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_validity_days: number;
  blocking_on_expiry: boolean;
  document_required: boolean;
};

type EquipmentComplianceRequirement = {
  id: string;
  equipment_id: string;
  requirement_id: string;
  is_mandatory: boolean;
  validity_days_override: number | null;
  warning_days: number;
  active: boolean;
  requirement: ComplianceRequirement | null;
};

type ComplianceStatusRow = {
  equipment_unit_id: string;
  equipment_id: string;
  serial_number: string | null;
  requirement_id: string;
  requirement_name: string;
  requirement_code: string;
  is_mandatory: boolean;
  warning_days: number;
  compliance_state: string;
  is_blocking: boolean;
  issued_at: string | null;
  expires_at: string | null;
  days_until_expiry: number | null;
  document_url: string | null;
  document_name: string | null;
  record_status: string | null;
};

type ComplianceOverviewRow = {
  equipment_unit_id: string;
  equipment_id: string;
  serial_number: string | null;
  total_requirements: number;
  missing_count: number;
  expired_count: number;
  expiring_soon_count: number;
  blocking_requirement_count: number;
  has_compliance_block: boolean;
  next_expiry_at: string | null;
};

type RequirementDraft = {
  is_mandatory: boolean;
  warning_days: string;
  validity_days_override: string;
  active: boolean;
};

type RequirementCreateForm = {
  requirement_id: string;
  is_mandatory: boolean;
  warning_days: string;
  validity_days_override: string;
};

type ComplianceRecordForm = {
  equipment_unit_id: string;
  requirement_id: string;
  status: 'valid' | 'pending_review' | 'rejected' | 'waived';
  issued_at: string;
  expires_at: string;
  document_name: string;
  document_url: string;
  notes: string;
};

type Props = {
  equipmentId: string;
  units: EquipmentUnitSummary[];
};

const DEFAULT_REQUIREMENT_FORM: RequirementCreateForm = {
  requirement_id: '',
  is_mandatory: true,
  warning_days: '30',
  validity_days_override: '',
};

const buildDefaultRecordForm = (unitId: string, requirementId: string): ComplianceRecordForm => ({
  equipment_unit_id: unitId,
  requirement_id: requirementId,
  status: 'valid',
  issued_at: '',
  expires_at: '',
  document_name: '',
  document_url: '',
  notes: '',
});

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('fr-FR');
};

const formatStateLabel = (value: string) => {
  const labels: Record<string, string> = {
    valid: 'Valide',
    expiring_soon: 'Expire bientôt',
    expired: 'Expiré',
    missing: 'Manquant',
    optional_missing: 'Optionnel manquant',
    pending_review: 'En revue',
    rejected: 'Rejeté',
    waived: 'Dérogation',
  };
  return labels[value] || value;
};

const stateBadgeClass = (value: string) => {
  if (value === 'valid' || value === 'waived') return 'bg-green-100 text-green-800';
  if (value === 'expiring_soon' || value === 'pending_review') return 'bg-yellow-100 text-yellow-800';
  if (value === 'missing' || value === 'expired' || value === 'rejected') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
};

const parsePositiveInt = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const toDateIso = (value: string, endOfDay: boolean) => {
  if (!value) return null;
  const stamp = endOfDay ? `${value}T23:59:59` : `${value}T00:00:00`;
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const EquipmentComplianceTab: React.FC<Props> = ({ equipmentId, units }) => {
  const [loading, setLoading] = useState(false);
  const [savingRequirementId, setSavingRequirementId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ComplianceRequirement[]>([]);
  const [equipmentRequirements, setEquipmentRequirements] = useState<EquipmentComplianceRequirement[]>([]);
  const [statusRows, setStatusRows] = useState<ComplianceStatusRow[]>([]);
  const [overviewRows, setOverviewRows] = useState<ComplianceOverviewRow[]>([]);
  const [requirementDrafts, setRequirementDrafts] = useState<Record<string, RequirementDraft>>({});
  const [requirementForm, setRequirementForm] = useState<RequirementCreateForm>(DEFAULT_REQUIREMENT_FORM);
  const [recordForm, setRecordForm] = useState<ComplianceRecordForm>(() => buildDefaultRecordForm('', ''));
  const [recordSaving, setRecordSaving] = useState(false);

  const loadComplianceData = useCallback(async () => {
    if (!equipmentId) return;
    setLoading(true);
    try {
      const [catalogRes, requirementsRes, statusRes, overviewRes] = await Promise.all([
        supabase
          .from('compliance_requirements' as any)
          .select('*')
          .order('name', { ascending: true }),
        supabase
          .from('equipment_compliance_requirements' as any)
          .select('id, equipment_id, requirement_id, is_mandatory, validity_days_override, warning_days, active, compliance_requirements(id, code, name, description, default_validity_days, blocking_on_expiry, document_required)')
          .eq('equipment_id', equipmentId)
          .order('created_at', { ascending: true }),
        supabase
          .from('equipment_unit_compliance_status' as any)
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('serial_number', { ascending: true })
          .order('requirement_name', { ascending: true }),
        supabase
          .from('equipment_unit_compliance_overview' as any)
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('serial_number', { ascending: true }),
      ]);

      if (catalogRes.error) throw catalogRes.error;
      if (requirementsRes.error) throw requirementsRes.error;
      if (statusRes.error) throw statusRes.error;
      if (overviewRes.error) throw overviewRes.error;

      const nextCatalog = ((catalogRes.data ?? []) as any[]).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description ?? null,
        default_validity_days: Number(row.default_validity_days ?? 0),
        blocking_on_expiry: Boolean(row.blocking_on_expiry),
        document_required: Boolean(row.document_required),
      })) as ComplianceRequirement[];

      const nextEquipmentRequirements = ((requirementsRes.data ?? []) as any[]).map((row) => {
        const relation = Array.isArray(row.compliance_requirements)
          ? row.compliance_requirements[0]
          : row.compliance_requirements;
        return {
          id: row.id,
          equipment_id: row.equipment_id,
          requirement_id: row.requirement_id,
          is_mandatory: Boolean(row.is_mandatory),
          validity_days_override: row.validity_days_override === null ? null : Number(row.validity_days_override),
          warning_days: Number(row.warning_days ?? 30),
          active: Boolean(row.active),
          requirement: relation
            ? {
                id: relation.id,
                code: relation.code,
                name: relation.name,
                description: relation.description ?? null,
                default_validity_days: Number(relation.default_validity_days ?? 0),
                blocking_on_expiry: Boolean(relation.blocking_on_expiry),
                document_required: Boolean(relation.document_required),
              }
            : null,
        } as EquipmentComplianceRequirement;
      });

      const nextStatusRows = ((statusRes.data ?? []) as any[]).map((row) => ({
        equipment_unit_id: row.equipment_unit_id,
        equipment_id: row.equipment_id,
        serial_number: row.serial_number ?? null,
        requirement_id: row.requirement_id,
        requirement_name: row.requirement_name,
        requirement_code: row.requirement_code,
        is_mandatory: Boolean(row.is_mandatory),
        warning_days: Number(row.warning_days ?? 30),
        compliance_state: row.compliance_state,
        is_blocking: Boolean(row.is_blocking),
        issued_at: row.issued_at ?? null,
        expires_at: row.expires_at ?? null,
        days_until_expiry: row.days_until_expiry === null ? null : Number(row.days_until_expiry),
        document_url: row.document_url ?? null,
        document_name: row.document_name ?? null,
        record_status: row.record_status ?? null,
      })) as ComplianceStatusRow[];

      const nextOverviewRows = ((overviewRes.data ?? []) as any[]).map((row) => ({
        equipment_unit_id: row.equipment_unit_id,
        equipment_id: row.equipment_id,
        serial_number: row.serial_number ?? null,
        total_requirements: Number(row.total_requirements ?? 0),
        missing_count: Number(row.missing_count ?? 0),
        expired_count: Number(row.expired_count ?? 0),
        expiring_soon_count: Number(row.expiring_soon_count ?? 0),
        blocking_requirement_count: Number(row.blocking_requirement_count ?? 0),
        has_compliance_block: Boolean(row.has_compliance_block),
        next_expiry_at: row.next_expiry_at ?? null,
      })) as ComplianceOverviewRow[];

      const nextDrafts = nextEquipmentRequirements.reduce<Record<string, RequirementDraft>>((acc, row) => {
        acc[row.id] = {
          is_mandatory: row.is_mandatory,
          warning_days: String(row.warning_days),
          validity_days_override: row.validity_days_override == null ? '' : String(row.validity_days_override),
          active: row.active,
        };
        return acc;
      }, {});

      setCatalog(nextCatalog);
      setEquipmentRequirements(nextEquipmentRequirements);
      setStatusRows(nextStatusRows);
      setOverviewRows(nextOverviewRows);
      setRequirementDrafts(nextDrafts);
    } catch (error) {
      console.error('load compliance data error', error);
      toast.error('Impossible de charger la conformité.');
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    void loadComplianceData();
  }, [loadComplianceData]);

  const activeRequirementIds = useMemo(
    () => equipmentRequirements.filter((row) => row.active).map((row) => row.requirement_id),
    [equipmentRequirements],
  );

  useEffect(() => {
    if (!requirementForm.requirement_id) {
      const existingIds = new Set(equipmentRequirements.map((row) => row.requirement_id));
      const firstAvailable = catalog.find((row) => !existingIds.has(row.id));
      if (firstAvailable) {
        setRequirementForm((prev) => ({ ...prev, requirement_id: firstAvailable.id }));
      }
    }
  }, [catalog, equipmentRequirements, requirementForm.requirement_id]);

  useEffect(() => {
    if (!recordForm.equipment_unit_id && units.length > 0) {
      setRecordForm((prev) => ({ ...prev, equipment_unit_id: units[0].id }));
    }
  }, [recordForm.equipment_unit_id, units]);

  useEffect(() => {
    if (activeRequirementIds.length === 0) {
      setRecordForm((prev) => ({ ...prev, requirement_id: '' }));
      return;
    }
    if (!recordForm.requirement_id || !activeRequirementIds.includes(recordForm.requirement_id)) {
      setRecordForm((prev) => ({ ...prev, requirement_id: activeRequirementIds[0] }));
    }
  }, [activeRequirementIds, recordForm.requirement_id]);

  const blockedUnitsCount = useMemo(
    () => overviewRows.filter((row) => row.has_compliance_block).length,
    [overviewRows],
  );

  const expiringSoonCount = useMemo(
    () => statusRows.filter((row) => row.compliance_state === 'expiring_soon').length,
    [statusRows],
  );

  const expiredCount = useMemo(
    () => statusRows.filter((row) => row.compliance_state === 'expired').length,
    [statusRows],
  );

  const nextGlobalExpiry = useMemo(() => {
    const values = overviewRows
      .map((row) => row.next_expiry_at)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));
    if (values.length === 0) return null;
    const minValue = values.reduce((min, current) => (current.getTime() < min.getTime() ? current : min), values[0]);
    return minValue.toISOString();
  }, [overviewRows]);

  const addRequirement = async () => {
    if (!requirementForm.requirement_id) {
      toast.error('Sélectionne une exigence.');
      return;
    }
    try {
      setSavingRequirementId('new');
      const warningDays = parsePositiveInt(requirementForm.warning_days, 30);
      const validityOverride = requirementForm.validity_days_override.trim();
      const validityDays = validityOverride.length > 0 ? parsePositiveInt(validityOverride, 0) : null;

      const { error } = await supabase
        .from('equipment_compliance_requirements' as any)
        .upsert(
          [{
            equipment_id: equipmentId,
            requirement_id: requirementForm.requirement_id,
            is_mandatory: requirementForm.is_mandatory,
            warning_days: warningDays,
            validity_days_override: validityDays,
            active: true,
          }],
          { onConflict: 'equipment_id,requirement_id' },
        );

      if (error) throw error;

      toast.success('Exigence ajoutée.');
      setRequirementForm((prev) => ({ ...prev, validity_days_override: '', warning_days: '30' }));
      await loadComplianceData();
    } catch (error) {
      console.error('add requirement error', error);
      toast.error('Impossible d\'ajouter l\'exigence.');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const saveRequirement = async (row: EquipmentComplianceRequirement) => {
    const draft = requirementDrafts[row.id];
    if (!draft) return;

    try {
      setSavingRequirementId(row.id);
      const warningDays = parsePositiveInt(draft.warning_days, 30);
      const validityOverride = draft.validity_days_override.trim();
      const validityDays = validityOverride.length > 0 ? parsePositiveInt(validityOverride, 0) : null;

      const { error } = await supabase
        .from('equipment_compliance_requirements' as any)
        .update({
          is_mandatory: draft.is_mandatory,
          warning_days: warningDays,
          validity_days_override: validityDays,
          active: draft.active,
        })
        .eq('id', row.id);

      if (error) throw error;

      toast.success('Règle mise à jour.');
      await loadComplianceData();
    } catch (error) {
      console.error('save requirement error', error);
      toast.error('Impossible de sauvegarder la règle.');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const removeRequirement = async (row: EquipmentComplianceRequirement) => {
    const confirmed = window.confirm(`Supprimer l'exigence "${row.requirement?.name || row.requirement_id}" ?`);
    if (!confirmed) return;

    try {
      setSavingRequirementId(row.id);
      const { error } = await supabase
        .from('equipment_compliance_requirements' as any)
        .delete()
        .eq('id', row.id);

      if (error) throw error;

      toast.success('Exigence supprimée.');
      await loadComplianceData();
    } catch (error) {
      console.error('remove requirement error', error);
      toast.error('Impossible de supprimer l\'exigence.');
    } finally {
      setSavingRequirementId(null);
    }
  };

  const createComplianceRecord = async () => {
    if (!recordForm.equipment_unit_id) {
      toast.error('Sélectionne un numéro de série.');
      return;
    }
    if (!recordForm.requirement_id) {
      toast.error('Sélectionne une exigence active.');
      return;
    }

    try {
      setRecordSaving(true);
      const { error } = await supabase
        .from('equipment_unit_compliance_records' as any)
        .insert([{
          equipment_unit_id: recordForm.equipment_unit_id,
          equipment_id: equipmentId,
          requirement_id: recordForm.requirement_id,
          status: recordForm.status,
          issued_at: toDateIso(recordForm.issued_at, false),
          expires_at: toDateIso(recordForm.expires_at, true),
          document_name: recordForm.document_name.trim() || null,
          document_url: recordForm.document_url.trim() || null,
          notes: recordForm.notes.trim() || null,
        }]);

      if (error) throw error;

      toast.success('Enregistrement conformité ajouté.');
      setRecordForm((prev) => ({
        ...buildDefaultRecordForm(prev.equipment_unit_id, prev.requirement_id),
        status: prev.status,
      }));
      await loadComplianceData();
    } catch (error) {
      console.error('create compliance record error', error);
      toast.error('Impossible d\'ajouter cet enregistrement.');
    } finally {
      setRecordSaving(false);
    }
  };

  const requirementsNotYetAssigned = useMemo(() => {
    const used = new Set(equipmentRequirements.map((row) => row.requirement_id));
    return catalog.filter((row) => !used.has(row.id));
  }, [catalog, equipmentRequirements]);

  const activeRequirementOptions = useMemo(() => {
    return equipmentRequirements
      .filter((row) => row.active)
      .map((row) => ({ id: row.requirement_id, name: row.requirement?.name || row.requirement_id }));
  }, [equipmentRequirements]);

  return (
    <div className="space-y-6 bg-gray-100 p-6">
      <div className="bg-white rounded-lg p-6 shadow-sm flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Conformité & certifications</h3>
          <p className="text-sm text-gray-500">VGP, calibrations, documents obligatoires et blocage automatique à échéance.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadComplianceData()}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Numéros suivis</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{units.length}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Séries bloquées</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{blockedUnitsCount}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Exigences expirées</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{expiredCount}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Expire bientôt</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{expiringSoonCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <div className="bg-white rounded-lg p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-4">
            <h4 className="text-base font-semibold text-gray-900">Exigences actives sur ce matériel</h4>
            <span className="text-sm text-gray-500">{equipmentRequirements.length} règle(s)</span>
          </div>

          {equipmentRequirements.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              Aucune exigence configurée pour ce matériel.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Exigence</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Obligatoire</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Alerte J-</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Validité (jours)</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Actif</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {equipmentRequirements.map((row) => {
                    const draft = requirementDrafts[row.id];
                    const saving = savingRequirementId === row.id;
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium text-gray-900">{row.requirement?.name || row.requirement_id}</div>
                          <div className="text-xs text-gray-500 uppercase">{row.requirement?.code || '—'}</div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={Boolean(draft?.is_mandatory)}
                            onChange={(e) =>
                              setRequirementDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...(prev[row.id] || {
                                    is_mandatory: row.is_mandatory,
                                    warning_days: String(row.warning_days),
                                    validity_days_override: row.validity_days_override == null ? '' : String(row.validity_days_override),
                                    active: row.active,
                                  }),
                                  is_mandatory: e.target.checked,
                                },
                              }))
                            }
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min={0}
                            value={draft?.warning_days ?? String(row.warning_days)}
                            onChange={(e) =>
                              setRequirementDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...(prev[row.id] || {
                                    is_mandatory: row.is_mandatory,
                                    warning_days: String(row.warning_days),
                                    validity_days_override: row.validity_days_override == null ? '' : String(row.validity_days_override),
                                    active: row.active,
                                  }),
                                  warning_days: e.target.value,
                                },
                              }))
                            }
                            className="w-20 rounded-md border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min={0}
                            placeholder={row.requirement ? String(row.requirement.default_validity_days) : '—'}
                            value={draft?.validity_days_override ?? (row.validity_days_override == null ? '' : String(row.validity_days_override))}
                            onChange={(e) =>
                              setRequirementDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...(prev[row.id] || {
                                    is_mandatory: row.is_mandatory,
                                    warning_days: String(row.warning_days),
                                    validity_days_override: row.validity_days_override == null ? '' : String(row.validity_days_override),
                                    active: row.active,
                                  }),
                                  validity_days_override: e.target.value,
                                },
                              }))
                            }
                            className="w-24 rounded-md border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={Boolean(draft?.active)}
                            onChange={(e) =>
                              setRequirementDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...(prev[row.id] || {
                                    is_mandatory: row.is_mandatory,
                                    warning_days: String(row.warning_days),
                                    validity_days_override: row.validity_days_override == null ? '' : String(row.validity_days_override),
                                    active: row.active,
                                  }),
                                  active: e.target.checked,
                                },
                              }))
                            }
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void saveRequirement(row)}
                              disabled={saving}
                              className="rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                            >
                              {saving ? '...' : 'Sauver'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeRequirement(row)}
                              disabled={saving}
                              className="inline-flex items-center rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900">Ajouter une exigence</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Type</label>
                <select
                  value={requirementForm.requirement_id}
                  onChange={(e) => setRequirementForm((prev) => ({ ...prev, requirement_id: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner...</option>
                  {requirementsNotYetAssigned.map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Alerte J-</label>
                <input
                  type="number"
                  min={0}
                  value={requirementForm.warning_days}
                  onChange={(e) => setRequirementForm((prev) => ({ ...prev, warning_days: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Validité override (jours)</label>
                <input
                  type="number"
                  min={0}
                  value={requirementForm.validity_days_override}
                  onChange={(e) => setRequirementForm((prev) => ({ ...prev, validity_days_override: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={requirementForm.is_mandatory}
                    onChange={(e) => setRequirementForm((prev) => ({ ...prev, is_mandatory: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Obligatoire
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void addRequirement()}
              disabled={savingRequirementId === 'new' || requirementsNotYetAssigned.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Ajouter l'exigence
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
          <h4 className="text-base font-semibold text-gray-900">Enregistrer un contrôle / certificat</h4>
          {units.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              Ce matériel n'a pas encore de numéro de série.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Numéro de série</label>
                  <select
                    value={recordForm.equipment_unit_id}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, equipment_unit_id: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner...</option>
                    {units.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.serial_number || row.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Exigence</label>
                  <select
                    value={recordForm.requirement_id}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, requirement_id: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner...</option>
                    {activeRequirementOptions.map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Statut</label>
                  <select
                    value={recordForm.status}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, status: e.target.value as ComplianceRecordForm['status'] }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="valid">Valide</option>
                    <option value="pending_review">En revue</option>
                    <option value="rejected">Rejeté</option>
                    <option value="waived">Dérogation</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Date d'émission</label>
                  <input
                    type="date"
                    value={recordForm.issued_at}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, issued_at: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Date d'expiration</label>
                  <input
                    type="date"
                    value={recordForm.expires_at}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, expires_at: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Nom du document</label>
                  <input
                    value={recordForm.document_name}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, document_name: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Certificat VGP #2026..."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-600">URL du document</label>
                  <input
                    value={recordForm.document_url}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, document_url: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-600">Notes</label>
                  <textarea
                    value={recordForm.notes}
                    onChange={(e) => setRecordForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Observation, organisme de contrôle, etc."
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void createComplianceRecord()}
                disabled={recordSaving || activeRequirementOptions.length === 0}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                Enregistrer la conformité
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-base font-semibold text-gray-900">État conformité par numéro de série</h4>
          <div className="text-xs text-gray-500">{statusRows.length} ligne(s)</div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Chargement...</div>
        ) : statusRows.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
            Aucun état de conformité disponible pour ce matériel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Série</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Exigence</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">État</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Échéance</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Blocage</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {statusRows.map((row, index) => (
                  <tr key={`${row.equipment_unit_id}-${row.requirement_id}-${index}`}>
                    <td className="px-3 py-3 align-top font-medium text-gray-900">{row.serial_number || row.equipment_unit_id}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-gray-900">{row.requirement_name}</div>
                      <div className="text-xs uppercase text-gray-500">{row.requirement_code}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${stateBadgeClass(row.compliance_state)}`}>
                        {formatStateLabel(row.compliance_state)}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-gray-700">
                      <div>{formatDate(row.expires_at)}</div>
                      {row.days_until_expiry != null && (
                        <div className="text-xs text-gray-500">J-{row.days_until_expiry}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {row.is_blocking ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Bloquant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {row.document_url ? (
                        <a
                          href={row.document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {row.document_name || 'Voir'}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Aucun</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            Les lignes bloquantes passent automatiquement le matériel en indisponible opérationnel.
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Prochaine échéance globale : {nextGlobalExpiry ? formatDate(nextGlobalExpiry) : '—'}
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Les alertes automatiques "compliance_expired" et "compliance_due_soon" sont alimentées depuis cette vue.
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentComplianceTab;
