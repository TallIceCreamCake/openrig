import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, ClipboardList, Plus, RefreshCcw, ScanLine, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type WarehouseOption = {
  id: string;
  name: string;
};

type SessionRow = {
  id: string;
  session_code: string;
  session_type: 'cycle' | 'full';
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
  warehouse_id: string | null;
  cycle_index: number;
  period_start: string | null;
  period_end: string | null;
  expected_lines: number;
  counted_lines: number;
  expected_quantity: number;
  counted_quantity: number;
  discrepancy_quantity: number;
  created_at: string;
  completed_at: string | null;
};

type SessionLineRow = {
  id: string;
  session_id: string;
  line_type: 'stock' | 'unit';
  equipment_id: string;
  equipment_name: string;
  equipment_type: string | null;
  equipment_unit_id: string | null;
  serial_number: string | null;
  expected_warehouse_id: string | null;
  expected_warehouse_name: string | null;
  counted_warehouse_id: string | null;
  counted_warehouse_name: string | null;
  expected_quantity: number;
  counted_quantity: number;
  discrepancy_quantity: number;
  line_status: 'pending' | 'counted' | 'skipped';
  counted_at: string | null;
};

type PlanningRow = {
  period_days: number;
  full_every: number;
  anchor_date: string;
  current_cycle_index: number;
  current_cycle_start: string;
  current_cycle_end: string;
  next_cycle_start: string;
  next_cycle_index: number;
  next_full_cycle_index: number;
  next_full_cycle_start: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('fr-FR');
};

const statusBadge = (status: SessionRow['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'cancelled':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-amber-100 text-amber-700 border-amber-200';
  }
};

const lineBadge = (status: SessionLineRow['line_status']) => {
  switch (status) {
    case 'counted':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'skipped':
      return 'bg-slate-200 text-slate-700 border-slate-300';
    default:
      return 'bg-amber-100 text-amber-700 border-amber-200';
  }
};

const sessionStatusLabel = (status: SessionRow['status']) => {
  switch (status) {
    case 'completed':
      return 'Terminé';
    case 'in_progress':
      return 'En cours';
    case 'cancelled':
      return 'Annulé';
    default:
      return 'Brouillon';
  }
};

const lineStatusLabel = (status: SessionLineRow['line_status']) => {
  switch (status) {
    case 'counted':
      return 'Compté';
    case 'skipped':
      return 'Ignoré';
    default:
      return 'À compter';
  }
};

const CycleInventoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [planning, setPlanning] = useState<PlanningRow | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [lines, setLines] = useState<SessionLineRow[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [createWarehouseId, setCreateWarehouseId] = useState<string>('');
  const [createForceFull, setCreateForceFull] = useState(false);
  const [createNotes, setCreateNotes] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [finalizingSession, setFinalizingSession] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanningCode, setScanningCode] = useState(false);
  const [pendingStockValues, setPendingStockValues] = useState<Record<string, string>>({});

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );

  const loadBaseData = async () => {
    setLoading(true);
    try {
      const [{ data: sessionsData, error: sessionsError }, { data: warehousesData, error: warehousesError }, { data: planningData, error: planningError }] = await Promise.all([
        supabase
          .from('inventory_count_sessions' as any)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('warehouses')
          .select('id, name')
          .order('name', { ascending: true }),
        supabase
          .from('inventory_cycle_planning' as any)
          .select('*')
          .limit(1)
          .maybeSingle(),
      ]);

      if (sessionsError) throw sessionsError;
      if (warehousesError) throw warehousesError;
      if (planningError) throw planningError;

      const mappedSessions = ((sessionsData || []) as any[]).map((row) => ({
        id: row.id,
        session_code: row.session_code,
        session_type: row.session_type,
        status: row.status,
        warehouse_id: row.warehouse_id,
        cycle_index: Number(row.cycle_index || 0),
        period_start: row.period_start || null,
        period_end: row.period_end || null,
        expected_lines: Number(row.expected_lines || 0),
        counted_lines: Number(row.counted_lines || 0),
        expected_quantity: Number(row.expected_quantity || 0),
        counted_quantity: Number(row.counted_quantity || 0),
        discrepancy_quantity: Number(row.discrepancy_quantity || 0),
        created_at: row.created_at,
        completed_at: row.completed_at || null,
      })) as SessionRow[];

      const mappedWarehouses = ((warehousesData || []) as any[]).map((row) => ({ id: row.id, name: row.name })) as WarehouseOption[];

      setSessions(mappedSessions);
      setWarehouses(mappedWarehouses);
      setPlanning((planningData as PlanningRow | null) || null);

      if (!selectedSessionId || !mappedSessions.some((row) => row.id === selectedSessionId)) {
        setSelectedSessionId(mappedSessions[0]?.id || '');
      }
    } catch (error) {
      console.error('load cycle inventory data', error);
      toast.error('Impossible de charger les inventaires tournants.');
    } finally {
      setLoading(false);
    }
  };

  const loadLines = async (sessionId: string) => {
    if (!sessionId) {
      setLines([]);
      return;
    }

    setLinesLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_count_session_lines_view' as any)
        .select('*')
        .eq('session_id', sessionId)
        .order('line_type', { ascending: true })
        .order('equipment_name', { ascending: true })
        .limit(2000);

      if (error) throw error;

      const mapped = ((data || []) as any[]).map((row) => ({
        id: row.id,
        session_id: row.session_id,
        line_type: row.line_type,
        equipment_id: row.equipment_id,
        equipment_name: row.equipment_name || 'Matériel',
        equipment_type: row.equipment_type || null,
        equipment_unit_id: row.equipment_unit_id || null,
        serial_number: row.serial_number || null,
        expected_warehouse_id: row.expected_warehouse_id || null,
        expected_warehouse_name: row.expected_warehouse_name || null,
        counted_warehouse_id: row.counted_warehouse_id || null,
        counted_warehouse_name: row.counted_warehouse_name || null,
        expected_quantity: Number(row.expected_quantity || 0),
        counted_quantity: Number(row.counted_quantity || 0),
        discrepancy_quantity: Number(row.discrepancy_quantity || 0),
        line_status: row.line_status,
        counted_at: row.counted_at || null,
      })) as SessionLineRow[];

      setLines(mapped);
      setPendingStockValues({});
    } catch (error) {
      console.error('load cycle inventory lines', error);
      toast.error('Impossible de charger les lignes de comptage.');
    } finally {
      setLinesLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedSessionId) return;
    void loadLines(selectedSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedSessionId]);

  const createSession = async () => {
    setCreatingSession(true);
    try {
      const { data, error } = await supabase.rpc('create_inventory_count_session' as any, {
        p_warehouse_id: createWarehouseId || null,
        p_force_full: createForceFull,
        p_notes: createNotes.trim() || null,
        p_started_by: user?.id || null,
      });

      if (error) throw error;

      const nextId = (data as any)?.id as string | undefined;
      await loadBaseData();
      if (nextId) {
        setSelectedSessionId(nextId);
      }
      setCreateNotes('');
      toast.success('Session d’inventaire créée.');
    } catch (error) {
      console.error('create cycle inventory session', error);
      toast.error('Impossible de créer la session d’inventaire.');
    } finally {
      setCreatingSession(false);
    }
  };

  const refreshSessionLines = async () => {
    if (!selectedSessionId) return;
    try {
      const { error } = await supabase.rpc('populate_inventory_count_session_lines' as any, {
        p_session_id: selectedSessionId,
      });
      if (error) throw error;
      await loadBaseData();
      await loadLines(selectedSessionId);
      toast.success('Lignes de comptage recalculées.');
    } catch (error) {
      console.error('refresh cycle inventory session lines', error);
      toast.error('Impossible de recalculer les lignes de comptage.');
    }
  };

  const saveStockLine = async (line: SessionLineRow) => {
    const raw = pendingStockValues[line.id];
    const parsed = Number.parseInt(raw ?? `${line.counted_quantity}`, 10);
    const nextQty = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

    try {
      const { error } = await supabase.rpc('set_inventory_count_stock_line' as any, {
        p_line_id: line.id,
        p_counted_quantity: nextQty,
        p_counted_by: user?.id || null,
        p_notes: null,
        p_counted_warehouse_id: line.expected_warehouse_id,
      });

      if (error) throw error;

      await loadBaseData();
      await loadLines(selectedSessionId);
      toast.success('Ligne stock comptabilisée.');
    } catch (error) {
      console.error('set stock inventory line', error);
      toast.error('Impossible d’enregistrer cette ligne stock.');
    }
  };

  const saveUnitLine = async (line: SessionLineRow, present: boolean) => {
    try {
      const { error } = await supabase.rpc('set_inventory_count_unit_line' as any, {
        p_line_id: line.id,
        p_present: present,
        p_counted_by: user?.id || null,
        p_counted_warehouse_id: line.expected_warehouse_id,
        p_notes: null,
      });

      if (error) throw error;

      await loadBaseData();
      await loadLines(selectedSessionId);
      toast.success(present ? 'Unité marquée présente.' : 'Unité marquée absente.');
    } catch (error) {
      console.error('set unit inventory line', error);
      toast.error('Impossible de mettre à jour cette unité.');
    }
  };

  const scanUnit = async () => {
    if (!selectedSessionId) return;
    const code = scanCode.trim();
    if (!code) {
      toast.error('Saisissez un QR/numéro pour scanner.');
      return;
    }

    setScanningCode(true);
    try {
      const { data, error } = await supabase.rpc('scan_inventory_count_unit' as any, {
        p_session_id: selectedSessionId,
        p_scanned_code: code,
        p_scanned_by: user?.id || null,
        p_counted_warehouse_id: null,
      });

      if (error) throw error;

      const payload = (data || {}) as any;
      if (payload.ok) {
        toast.success(`Numéro comptabilisé${payload.serial_number ? ` (${payload.serial_number})` : ''}.`);
      } else {
        toast.error(payload.message || 'Scan non comptabilisé.');
      }

      setScanCode('');
      await loadBaseData();
      await loadLines(selectedSessionId);
    } catch (error) {
      console.error('scan inventory unit', error);
      toast.error('Impossible de scanner ce numéro.');
    } finally {
      setScanningCode(false);
    }
  };

  const finalizeSession = async () => {
    if (!selectedSessionId || !selectedSession) return;
    if (!window.confirm('Finaliser cet inventaire ? Les ajustements de stock seront appliqués.')) return;

    setFinalizingSession(true);
    try {
      const { error } = await supabase.rpc('finalize_inventory_count_session' as any, {
        p_session_id: selectedSessionId,
        p_completed_by: user?.id || null,
        p_mark_pending_as_zero: true,
      });

      if (error) throw error;

      await loadBaseData();
      await loadLines(selectedSessionId);
      toast.success('Inventaire finalisé et stock ajusté.');
    } catch (error) {
      console.error('finalize inventory session', error);
      toast.error('Impossible de finaliser cet inventaire.');
    } finally {
      setFinalizingSession(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[12048] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative z-[91] w-full max-w-[1450px] max-h-[94vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <Boxes className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Inventaires tournants</h2>
              <p className="text-sm text-gray-500">Cycles partiels + inventaire total périodique du matériel.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid h-[calc(94vh-74px)] grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-900">Créer une session</div>

              <label className="block text-xs font-medium text-gray-600">
                Entrepôt (optionnel)
                <select
                  value={createWarehouseId}
                  onChange={(event) => setCreateWarehouseId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Tous les entrepôts</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={createForceFull}
                  onChange={(event) => setCreateForceFull(event.target.checked)}
                  className="rounded border-gray-300"
                />
                Forcer un inventaire total
              </label>

              <label className="block text-xs font-medium text-gray-600">
                Notes
                <textarea
                  rows={3}
                  value={createNotes}
                  onChange={(event) => setCreateNotes(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Commentaire sur ce cycle..."
                />
              </label>

              <button
                type="button"
                onClick={createSession}
                disabled={creatingSession}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creatingSession ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Nouvelle session
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <div className="text-sm font-semibold text-gray-900">Cadence active</div>
              {planning ? (
                <>
                  <p className="text-xs text-gray-600">Cycle: {planning.period_days} jour(s)</p>
                  <p className="text-xs text-gray-600">Inventaire total: tous les {planning.full_every} cycle(s)</p>
                  <p className="text-xs text-gray-600">Cycle actuel: #{planning.current_cycle_index} ({formatDate(planning.current_cycle_start)} - {formatDate(planning.current_cycle_end)})</p>
                  <p className="text-xs text-gray-600">Prochain inventaire total: cycle #{planning.next_full_cycle_index} ({formatDate(planning.next_full_cycle_start)})</p>
                </>
              ) : (
                <p className="text-xs text-gray-500">Aucune planification disponible.</p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="text-sm font-semibold text-gray-900">Sessions récentes</div>
                <button
                  type="button"
                  onClick={loadBaseData}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                  title="Actualiser"
                >
                  <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100">
                {sessions.map((session) => {
                  const selected = session.id === selectedSessionId;
                  const warehouseName = session.warehouse_id
                    ? (warehouses.find((warehouse) => warehouse.id === session.warehouse_id)?.name || 'Entrepôt')
                    : 'Tous entrepôts';
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className={`w-full px-4 py-3 text-left transition ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{session.session_code}</p>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge(session.status)}`}>
                          {sessionStatusLabel(session.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        {session.session_type === 'full' ? 'Inventaire total' : `Cycle #${session.cycle_index}`} • {warehouseName}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">{formatDate(session.period_start)} - {formatDate(session.period_end)}</p>
                    </button>
                  );
                })}
                {!sessions.length && (
                  <div className="px-4 py-6 text-sm text-gray-500">Aucune session d’inventaire.</div>
                )}
              </div>
            </div>
          </aside>

          <section className="p-4 overflow-y-auto space-y-4">
            {!selectedSession ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
                Sélectionnez une session d’inventaire.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Lignes comptées</p>
                    <p className="text-lg font-semibold text-gray-900">{selectedSession.counted_lines}/{selectedSession.expected_lines}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Quantité attendue</p>
                    <p className="text-lg font-semibold text-gray-900">{selectedSession.expected_quantity}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Quantité comptée</p>
                    <p className="text-lg font-semibold text-gray-900">{selectedSession.counted_quantity}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Écart global</p>
                    <p className={`text-lg font-semibold ${selectedSession.discrepancy_quantity === 0 ? 'text-emerald-600' : selectedSession.discrepancy_quantity > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                      {selectedSession.discrepancy_quantity > 0 ? '+' : ''}{selectedSession.discrepancy_quantity}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={refreshSessionLines}
                    disabled={selectedSession.status === 'completed' || selectedSession.status === 'cancelled'}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Recalculer les lignes
                  </button>

                  <div className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-2 py-1.5">
                    <ScanLine className="h-4 w-4 text-gray-500" />
                    <input
                      value={scanCode}
                      onChange={(event) => setScanCode(event.target.value)}
                      className="w-56 border-0 p-0 text-sm focus:ring-0"
                      placeholder="Scanner QR / numéro de série"
                    />
                    <button
                      type="button"
                      onClick={scanUnit}
                      disabled={scanningCode || selectedSession.status === 'completed' || selectedSession.status === 'cancelled'}
                      className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      Scanner
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={finalizeSession}
                    disabled={finalizingSession || selectedSession.status === 'completed' || selectedSession.status === 'cancelled'}
                    className="ml-auto inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {finalizingSession ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Finaliser et ajuster
                  </button>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <ClipboardList className="h-4 w-4 text-blue-600" />
                      Lignes de comptage ({lines.length})
                    </div>
                    {linesLoading && <span className="text-xs text-gray-500">Chargement...</span>}
                  </div>

                  <div className="overflow-auto max-h-[58vh]">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Matériel</th>
                          <th className="px-3 py-2 text-left">Numéro</th>
                          <th className="px-3 py-2 text-left">Entrepôt</th>
                          <th className="px-3 py-2 text-right">Attendu</th>
                          <th className="px-3 py-2 text-right">Compté</th>
                          <th className="px-3 py-2 text-right">Écart</th>
                          <th className="px-3 py-2 text-center">État</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {lines.map((line) => {
                          const stockInputValue = pendingStockValues[line.id] ?? `${line.counted_quantity}`;
                          return (
                            <tr key={line.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-700">{line.line_type === 'unit' ? 'Unité' : 'Stock'}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-900">{line.equipment_name}</div>
                                <div className="text-xs text-gray-500">{line.equipment_type || 'Type non renseigné'}</div>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{line.serial_number || '—'}</td>
                              <td className="px-3 py-2 text-gray-600">{line.expected_warehouse_name || '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-900">{line.expected_quantity}</td>
                              <td className="px-3 py-2 text-right text-gray-900">{line.counted_quantity}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${line.discrepancy_quantity === 0 ? 'text-emerald-600' : line.discrepancy_quantity > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                                {line.discrepancy_quantity > 0 ? '+' : ''}{line.discrepancy_quantity}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${lineBadge(line.line_status)}`}>
                                  {lineStatusLabel(line.line_status)}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {line.line_type === 'stock' ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <input
                                      type="number"
                                      min={0}
                                      value={stockInputValue}
                                      onChange={(event) => {
                                        setPendingStockValues((prev) => ({ ...prev, [line.id]: event.target.value }));
                                      }}
                                      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => saveStockLine(line)}
                                      disabled={selectedSession.status === 'completed' || selectedSession.status === 'cancelled'}
                                      className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                    >
                                      Valider
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => saveUnitLine(line, true)}
                                      disabled={selectedSession.status === 'completed' || selectedSession.status === 'cancelled'}
                                      className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                    >
                                      Présent
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => saveUnitLine(line, false)}
                                      disabled={selectedSession.status === 'completed' || selectedSession.status === 'cancelled'}
                                      className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                    >
                                      Absent
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {!lines.length && !linesLoading && (
                          <tr>
                            <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                              Cette session ne contient aucune ligne.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default CycleInventoryModal;
