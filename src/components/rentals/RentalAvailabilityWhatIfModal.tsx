import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarClock, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

type EquipmentOption = {
  id: string;
  name: string;
  type: string | null;
  inventory_category: string | null;
};

type DemandRow = {
  id: string;
  equipment_id: string;
  requested_qty: string;
};

type SimulationResult = {
  equipment_id: string;
  equipment_name: string;
  inventory_category: string;
  requested: number;
  available: number;
  projected_remaining: number;
  projected_shortage: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const makeRowId = () => `demand-${Math.random().toString(36).slice(2, 10)}`;

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toIsoDateTime = (date: string, endOfDay: boolean) => {
  const stamp = endOfDay ? `${date}T23:59:59` : `${date}T00:00:00`;
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const RentalAvailabilityWhatIfModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [runningSimulation, setRunningSimulation] = useState(false);
  const [periodStart, setPeriodStart] = useState<string>(() => toInputDate(new Date()));
  const [periodEnd, setPeriodEnd] = useState<string>(() => toInputDate(addDays(new Date(), 3)));
  const [rows, setRows] = useState<DemandRow[]>([{ id: makeRowId(), equipment_id: '', requested_qty: '1' }]);
  const [results, setResults] = useState<SimulationResult[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const loadEquipment = async () => {
      setLoadingOptions(true);
      try {
        const { data, error } = await supabase
          .from('equipment' as any)
          .select('id, name, type, inventory_category')
          .order('name', { ascending: true });

        if (error) throw error;

        const mapped = ((data ?? []) as any[]).map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type ?? null,
          inventory_category: row.inventory_category ?? null,
        })) as EquipmentOption[];

        setEquipmentOptions(mapped);
      } catch (error) {
        console.error('load equipment for what-if simulation error', error);
        toast.error('Impossible de charger la liste du matériel.');
      } finally {
        setLoadingOptions(false);
      }
    };

    void loadEquipment();
  }, [isOpen]);

  const hasValidDemands = useMemo(
    () => rows.some((row) => row.equipment_id && Number(row.requested_qty) > 0),
    [rows],
  );

  const addDemandRow = () => {
    setRows((prev) => [...prev, { id: makeRowId(), equipment_id: '', requested_qty: '1' }]);
  };

  const removeDemandRow = (rowId: string) => {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const runSimulation = async () => {
    if (!hasValidDemands) {
      toast.error('Ajoute au moins une demande valide.');
      return;
    }

    if (!periodStart || !periodEnd) {
      toast.error('Renseigne la période.');
      return;
    }

    if (periodStart > periodEnd) {
      toast.error('La date de fin doit être supérieure à la date de début.');
      return;
    }

    const demands = rows
      .filter((row) => row.equipment_id && Number(row.requested_qty) > 0)
      .map((row) => ({
        equipment_id: row.equipment_id,
        requested_qty: Math.max(0, Math.trunc(Number(row.requested_qty))),
      }));

    const startIso = toIsoDateTime(periodStart, false);
    const endIso = toIsoDateTime(periodEnd, true);

    if (!startIso || !endIso) {
      toast.error('La période est invalide.');
      return;
    }

    try {
      setRunningSimulation(true);
      const { data, error } = await supabase.rpc('simulate_equipment_availability' as any, {
        p_start: startIso,
        p_end: endIso,
        p_demands: demands,
      });

      if (error) throw error;

      const mapped = ((data ?? []) as any[]).map((row) => ({
        equipment_id: row.equipment_id,
        equipment_name: row.equipment_name,
        inventory_category: row.inventory_category,
        requested: Number(row.requested ?? 0),
        available: Number(row.available ?? 0),
        projected_remaining: Number(row.projected_remaining ?? 0),
        projected_shortage: Number(row.projected_shortage ?? 0),
      })) as SimulationResult[];

      setResults(mapped);
      if (mapped.length === 0) {
        toast('Aucun resultat pour cette simulation.', { icon: 'i' });
      }
    } catch (error) {
      console.error('run what-if simulation error', error);
      toast.error('Échec de la simulation de disponibilité.');
    } finally {
      setRunningSimulation(false);
    }
  };

  const summary = useMemo(() => {
    const requested = results.reduce((sum, row) => sum + row.requested, 0);
    const available = results.reduce((sum, row) => sum + row.available, 0);
    const shortage = results.reduce((sum, row) => sum + row.projected_shortage, 0);
    const coverageRate = requested <= 0 ? 100 : Math.max(0, Math.round(((requested - shortage) / requested) * 100));
    return { requested, available, shortage, coverageRate };
  }, [results]);

  const closeAndReset = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[12046] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={closeAndReset} />
      <div className="relative z-[81] w-full max-w-7xl max-h-[92vh] overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Simulation what-if de charge/disponibilité</h3>
              <p className="text-sm text-gray-500">Prévision rapide par période avec impact des demandes ajoutées.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid h-[calc(92vh-73px)] grid-cols-1 lg:grid-cols-[390px_minmax(0,1fr)]">
          <div className="border-r border-gray-200 bg-gray-50 p-5 overflow-y-auto space-y-5">
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                Période simulée
              </div>
              <div className="grid grid-cols-1 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  Début
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Fin
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Demandes additionnelles</p>
                <button
                  type="button"
                  onClick={addDemandRow}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter
                </button>
              </div>

              {loadingOptions ? (
                <div className="py-4 text-center text-sm text-gray-500">Chargement matériel...</div>
              ) : (
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div key={row.id} className="rounded-md border border-gray-200 p-3 space-y-2">
                      <select
                        value={row.equipment_id}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((entry) =>
                              entry.id === row.id ? { ...entry, equipment_id: e.target.value } : entry,
                            ),
                          )
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Sélectionner un matériel...</option>
                        {equipmentOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} {option.type ? `(${option.type})` : ''}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={row.requested_qty}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((entry) =>
                                entry.id === row.id ? { ...entry, requested_qty: e.target.value } : entry,
                              ),
                            )
                          }
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Quantité demandée"
                        />
                        <button
                          type="button"
                          onClick={() => removeDemandRow(row.id)}
                          disabled={rows.length === 1}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void runSimulation()}
              disabled={runningSimulation || loadingOptions}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {runningSimulation ? 'Simulation en cours...' : 'Lancer la simulation'}
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-4">
            {results.length === 0 ? (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">
                Configure ta période, ajoute des demandes, puis lance la simulation.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total demandé</p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.requested}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Capacité dispo</p>
                    <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.available}</p>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-red-600">Manque projeté</p>
                    <p className="mt-2 text-2xl font-semibold text-red-700">{summary.shortage}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Couverture</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-800">{summary.coverageRate}%</p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Matériel</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Catégorie</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-600">Demandé</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-600">Dispo</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-600">Reste</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-600">Manque</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {results.map((row) => (
                        <tr key={row.equipment_id} className={row.projected_shortage > 0 ? 'bg-red-50/50' : ''}>
                          <td className="px-4 py-3 font-medium text-gray-900">{row.equipment_name}</td>
                          <td className="px-4 py-3 text-gray-600">{row.inventory_category || '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.requested}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.available}</td>
                          <td className="px-4 py-3 text-right text-emerald-700 font-medium">{row.projected_remaining}</td>
                          <td className="px-4 py-3 text-right font-semibold text-red-700">{row.projected_shortage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentalAvailabilityWhatIfModal;
