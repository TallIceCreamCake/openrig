import React from 'react';
import { Box, Plus, X, Search, ChevronDown, Trash2, Truck, PackageOpen, Sparkles, Settings2, FileDown, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Loading3DView, { type LoadBox } from './Loading3DView';
import { supabase } from '../../lib/supabase';
import type { Rental } from '../../types/rental';
import { expandElements, packVehicles, vehicleMetrics } from '../../utils/truckPacking';
import {
  VEHICLE_PRESET_GROUPS,
  VEHICLE_PRESETS_BY_ID,
  presetVolume,
  type VehiclePreset,
} from '../../constants/truckPresets';

interface LoadedVehicle {
  uid: string;
  preset: VehiclePreset;
}

interface PlacedItem {
  uid: string;
  key?: string; // source element key (for live colour lookup)
  name: string;
  length: number; // metres
  width: number;
  height: number;
  weightKg: number;
  x: number; // centre on floor (metres)
  y: number; // base height (stacking), metres
  z: number;
  rotation: number; // yaw, radians
}

// First non-overlapping spot for a new box inside the vehicle footprint.
const findInitialPosition = (
  existing: PlacedItem[],
  dims: { length: number; width: number },
  preset: VehiclePreset,
): { x: number; z: number } => {
  const W = preset.width; const L = preset.length;
  const fw = dims.width; const fl = dims.length;
  const step = 0.15;
  // Wheel arches are floor obstacles: a box dropped on the floor must avoid them.
  const arches = (preset.wheelArches || []).map((a) => {
    const ax0 = a.side === 'left' ? -W / 2 : W / 2 - a.intrude;
    const ax1 = a.side === 'left' ? -W / 2 + a.intrude : W / 2;
    return { cx: (ax0 + ax1) / 2, cz: a.zCenter, w: ax1 - ax0, l: a.length };
  });
  const overlaps = (x: number, z: number) =>
    existing.some((e) => Math.abs(x - e.x) < (fw + e.width) / 2 - 1e-3 && Math.abs(z - e.z) < (fl + e.length) / 2 - 1e-3)
    || arches.some((a) => Math.abs(x - a.cx) < (fw + a.w) / 2 - 1e-3 && Math.abs(z - a.cz) < (fl + a.l) / 2 - 1e-3);
  for (let z = -L / 2 + fl / 2; z <= L / 2 - fl / 2 + 1e-9; z += step) {
    for (let x = -W / 2 + fw / 2; x <= W / 2 - fw / 2 + 1e-9; x += step) {
      if (!overlaps(x, z)) return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
    }
  }
  return { x: 0, z: 0 };
};

// Loadable element derived from a project line.
interface LoadableElement {
  key: string;
  equipmentId: string | null;
  name: string;
  quantity: number;
  length: number; // metres
  width: number;
  height: number;
  weightKg: number;
  hasDims: boolean;
  tippable: boolean;
  color?: string;
}

interface DimRow {
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  weightKg: number;
  tippable: boolean;
  color: string | null;
}

const DEFAULT = { length: 0.6, width: 0.4, height: 0.4 };

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const RentalLoadingTab: React.FC<{ rental: Rental; editable?: boolean }> = ({ rental, editable = false }) => {
  const [loaded, setLoaded] = React.useState<LoadedVehicle[]>([]);
  const [selectedUid, setSelectedUid] = React.useState<string | null>(null);
  const [placements, setPlacements] = React.useState<Record<string, PlacedItem[]>>({});
  const hydratedRef = React.useRef(false);

  // ── Load the saved plan ───────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('rental_load_plans')
          .select('plan')
          .eq('rental_id', rental.id)
          .maybeSingle();
        if (cancelled) return;
        const plan = data?.plan;
        if (plan && Array.isArray(plan.vehicles)) {
          const restored: LoadedVehicle[] = plan.vehicles
            .map((v: any) => {
              const preset = VEHICLE_PRESETS_BY_ID[v.presetId];
              return preset ? { uid: String(v.uid), preset } : null;
            })
            .filter(Boolean) as LoadedVehicle[];
          setLoaded(restored);
          setPlacements(plan.placements && typeof plan.placements === 'object' ? plan.placements : {});
          setSelectedUid(restored[0]?.uid ?? null);
        }
      } catch (err) {
        console.error('load plan', err);
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [rental.id]);

  // ── Persist the plan (edit mode only, debounced) ──────────────────────────
  React.useEffect(() => {
    if (!editable || !hydratedRef.current) return;
    const handle = setTimeout(() => {
      const plan = {
        vehicles: loaded.map((l) => ({ uid: l.uid, presetId: l.preset.id })),
        placements,
      };
      (supabase as any)
        .from('rental_load_plans')
        .upsert({ rental_id: rental.id, plan, updated_at: new Date().toISOString() })
        .then(({ error }: any) => { if (error) console.error('save plan', error); });
    }, 600);
    return () => clearTimeout(handle);
  }, [loaded, placements, editable, rental.id]);
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(VEHICLE_PRESET_GROUPS.map((g) => [g.id, false])),
  );
  const [dimsMap, setDimsMap] = React.useState<Record<string, DimRow>>({});
  const draggingRef = React.useRef<string | null>(null);

  // ── Vehicles (load plan) ──────────────────────────────────────────────────
  const addVehicle = (preset: VehiclePreset) => {
    const id = uid();
    setLoaded((prev) => [...prev, { uid: id, preset }]);
    setSelectedUid(id);
  };
  const removeVehicle = (id: string) => {
    setLoaded((prev) => prev.filter((v) => v.uid !== id));
    setPlacements((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };
  const clearAll = () => { setLoaded([]); setSelectedUid(null); setPlacements({}); };

  React.useEffect(() => {
    if (loaded.length === 0) {
      if (selectedUid !== null) setSelectedUid(null);
    } else if (!loaded.some((l) => l.uid === selectedUid)) {
      setSelectedUid(loaded[0].uid);
    }
  }, [loaded, selectedUid]);

  const selected = loaded.find((l) => l.uid === selectedUid) || null;

  // ── Project elements & their dimensions/weight ────────────────────────────
  React.useEffect(() => {
    const ids = Array.from(new Set((rental.items || []).map((i) => i.equipment_id).filter(Boolean))) as string[];
    if (ids.length === 0) { setDimsMap({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const db = supabase as any;
        const { data, error } = await db
          .from('equipment')
          .select('id, type, loading_color, unit_weight_kg, length_cm, width_cm, height_cm, equipment_flight_case_items!flight_case_id ( quantity, equipment:equipment_id ( unit_weight_kg ) )')
          .in('id', ids);
        if (error) throw error;
        if (cancelled) return;
        const map: Record<string, DimRow> = {};
        (data || []).forEach((r: any) => {
          const contentsWeight = (r.equipment_flight_case_items || []).reduce(
            (s: number, it: any) => s + (it.equipment?.unit_weight_kg || 0) * (it.quantity || 0), 0,
          );
          map[r.id] = {
            length_cm: r.length_cm,
            width_cm: r.width_cm,
            height_cm: r.height_cm,
            weightKg: (r.unit_weight_kg || 0) + contentsWeight,
            tippable: r.type === 'Flight',
            color: r.loading_color || null,
          };
        });
        setDimsMap(map);
      } catch (err) {
        console.error('load element dimensions', err);
      }
    })();
    return () => { cancelled = true; };
  }, [rental.items]);

  const elements: LoadableElement[] = React.useMemo(() => {
    return (rental.items || []).map((item) => {
      const dim = item.equipment_id ? dimsMap[item.equipment_id] : undefined;
      const hasDims = Boolean(dim && dim.length_cm && dim.width_cm && dim.height_cm);
      return {
        key: item.id,
        equipmentId: item.equipment_id || null,
        name: item.equipment_name || item.external_name || 'Élément',
        quantity: item.quantity || 1,
        length: hasDims ? (dim!.length_cm! / 100) : DEFAULT.length,
        width: hasDims ? (dim!.width_cm! / 100) : DEFAULT.width,
        height: hasDims ? (dim!.height_cm! / 100) : DEFAULT.height,
        weightKg: dim?.weightKg || 0,
        hasDims,
        tippable: dim?.tippable ?? false,
        color: dim?.color || undefined,
      };
    });
  }, [rental.items, dimsMap]);

  const addPlacement = (elementKey: string) => {
    if (!selectedUid) return;
    const el = elements.find((e) => e.key === elementKey);
    const selPreset = loaded.find((l) => l.uid === selectedUid)?.preset;
    if (!el || !selPreset) return;
    const existing = placements[selectedUid] || [];
    const pos = findInitialPosition(existing, el, selPreset);
    const item: PlacedItem = {
      uid: uid(), key: el.key, name: el.name, length: el.length, width: el.width, height: el.height, weightKg: el.weightKg,
      x: pos.x, y: 0, z: pos.z, rotation: 0,
    };
    setPlacements((prev) => ({ ...prev, [selectedUid]: [...(prev[selectedUid] || []), item] }));
  };
  const removePlacement = (vehicleUid: string, itemUid: string) => {
    setPlacements((prev) => ({ ...prev, [vehicleUid]: (prev[vehicleUid] || []).filter((i) => i.uid !== itemUid) }));
  };
  const handleItemTransform = (id: string, t: { x?: number; y?: number; z?: number; rotation?: number }) => {
    if (!selectedUid) return;
    setPlacements((prev) => ({
      ...prev,
      [selectedUid]: (prev[selectedUid] || []).map((it) => (it.uid === id ? { ...it, ...t } : it)),
    }));
  };

  const currentPlacements = selectedUid ? (placements[selectedUid] || []) : [];
  const loadBoxes: LoadBox[] = React.useMemo(
    () => currentPlacements.map((p) => ({
      id: p.uid, name: p.name, length: p.length, width: p.width, height: p.height,
      x: p.x, y: p.y, z: p.z, rotation: p.rotation,
      color: elements.find((e) => e.key === p.key)?.color,
    })),
    [currentPlacements, elements],
  );
  const loadedWeight = currentPlacements.reduce((s, p) => s + p.weightKg, 0);
  const payload = selected?.preset.payloadKg || 0;
  const overload = payload > 0 && loadedWeight > payload;
  const metrics = selected ? vehicleMetrics(selected.preset, currentPlacements) : null;

  // Auto-arrange every project element across all loaded vehicles (TruckPacker-style).
  const autoArrange = () => {
    if (loaded.length === 0) { toast.error('Ajoutez au moins un véhicule'); return; }
    const boxes = expandElements(elements);
    if (boxes.length === 0) { toast.error('Aucun élément à charger'); return; }
    const { placements: packed, overflow, placedCount } = packVehicles(boxes, loaded);
    setPlacements(packed as unknown as Record<string, PlacedItem[]>);
    if (overflow.length > 0) toast(`${placedCount} rangé(s) · ${overflow.length} non chargé(s) (place insuffisante)`, { icon: '⚠️' });
    else toast.success(`${placedCount} élément(s) rangé(s) automatiquement`);
  };

  // ── Per-equipment edit (colour + live size) ───────────────────────────────
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({ color: '#2563eb', length: '', width: '', height: '' });
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [showCatalog, setShowCatalog] = React.useState(false);

  const openEdit = (el: LoadableElement) => {
    if (!el.equipmentId) { toast.error('Élément non modifiable'); return; }
    setEditingKey(el.key);
    setEditForm({
      color: el.color || '#2563eb',
      length: String(Math.round(el.length * 100)),
      width: String(Math.round(el.width * 100)),
      height: String(Math.round(el.height * 100)),
    });
  };
  const saveElementEdit = async (el: LoadableElement) => {
    if (!el.equipmentId) return;
    const length_cm = Number(editForm.length) || null;
    const width_cm = Number(editForm.width) || null;
    const height_cm = Number(editForm.height) || null;
    try {
      const { error } = await (supabase as any).from('equipment').update({
        loading_color: editForm.color, length_cm, width_cm, height_cm,
      }).eq('id', el.equipmentId);
      if (error) throw error;
      setDimsMap((prev) => {
        const cur = prev[el.equipmentId!];
        return { ...prev, [el.equipmentId!]: {
          length_cm, width_cm, height_cm,
          weightKg: cur?.weightKg ?? 0, tippable: cur?.tippable ?? false, color: editForm.color,
        } };
      });
      setEditingKey(null);
      toast.success('Équipement mis à jour');
    } catch (err) {
      console.error('save equipment edit', err);
      toast.error('Échec de la mise à jour');
    }
  };

  const exportPdf = async () => {
    if (loaded.length === 0) { toast.error('Aucun chargement à exporter'); return; }
    setPdfBusy(true);
    try {
      const { generateLoadPlanPdf } = await import('./loadPlanPdf');
      await generateLoadPlanPdf({
        title: rental.reference_code || rental.title || 'Plan de chargement',
        vehicles: loaded.map((l) => ({
          name: l.preset.name,
          preset: l.preset,
          items: (placements[l.uid] || []).map((p) => ({
            name: p.name, length: p.length, width: p.width, height: p.height,
            x: p.x, y: p.y, z: p.z, rotation: p.rotation, weightKg: p.weightKg,
            color: elements.find((e) => e.key === p.key)?.color,
          })),
        })),
      });
    } catch (err) {
      console.error('export pdf', err);
      toast.error("Échec de l'export PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Drag & drop onto the 3D view ──────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const key = draggingRef.current || e.dataTransfer.getData('text/plain');
    if (key && selectedUid) addPlacement(key);
    draggingRef.current = null;
  };

  const q = query.trim().toLowerCase();
  const filteredGroups = VEHICLE_PRESET_GROUPS
    .map((g) => ({ ...g, presets: q ? g.presets.filter((p) => p.name.toLowerCase().includes(q)) : g.presets }))
    .filter((g) => g.presets.length > 0);

  return (
    <div className="space-y-3">
      {/* ── Header bar: title · vehicle tabs · metrics · actions ───────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-orange-50">
            <Box className="h-5 w-5 text-orange-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight text-gray-900">Chargement 3D</h3>
            <p className="text-[11px] leading-tight text-gray-400">{editable ? 'Mode édition' : 'Aperçu (lecture seule)'}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
          {loaded.length === 0 ? (
            <span className="text-xs text-gray-400">{editable ? 'Aucun véhicule — ajoutez-en un →' : 'Aucun chargement'}</span>
          ) : loaded.map((v, i) => {
            const isSel = selectedUid === v.uid;
            return (
              <button
                key={v.uid}
                onClick={() => setSelectedUid(v.uid)}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${isSel ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <Truck className="h-3.5 w-3.5" />
                Chargement {i + 1}
                <span className={`rounded-full px-1 text-[10px] ${isSel ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>{(placements[v.uid] || []).length}</span>
                {editable && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); removeVehicle(v.uid); }}
                    className={`-mr-1 ml-0.5 rounded-full p-0.5 ${isSel ? 'hover:bg-white/25' : 'hover:bg-gray-200'}`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
          {editable && (
            <button
              onClick={() => setShowCatalog(true)}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-orange-300 hover:text-orange-600"
            >
              <Plus className="h-3.5 w-3.5" /> Véhicule
            </button>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {selected && metrics && (
            <div className="hidden items-center gap-3 rounded-lg bg-gray-50 px-3 py-1 sm:flex">
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wide text-gray-400">Volume</div>
                <div className="text-xs font-semibold tabular-nums text-gray-800">{metrics.volumePct.toFixed(0)} %</div>
              </div>
              <div className="h-7 w-px bg-gray-200" />
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wide text-gray-400">Poids</div>
                <div className={`text-xs font-semibold tabular-nums ${overload ? 'text-rose-600' : 'text-gray-800'}`}>
                  {loadedWeight.toFixed(0)}{payload > 0 ? ` / ${payload.toLocaleString('fr-FR')}` : ''} kg
                </div>
              </div>
            </div>
          )}
          {loaded.length > 0 && (
            <button
              onClick={exportPdf}
              disabled={pdfBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              title="Exporter en PDF (vues dessus + côté)"
            >
              <FileDown className="h-3.5 w-3.5" /> {pdfBusy ? '…' : 'PDF'}
            </button>
          )}
          {editable && loaded.length > 0 && (
            <button
              onClick={autoArrange}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
              title="Ranger automatiquement tous les éléments"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ranger auto
            </button>
          )}
        </div>
      </div>

      {/* ── Body: 3D viewport + elements panel ────────────────────────────── */}
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div
            className="relative h-[64vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-slate-50 to-white shadow-sm"
            onDragOver={editable ? (e) => { if (selected) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } } : undefined}
            onDrop={editable ? onDrop : undefined}
          >
            <Loading3DView vehicles={selected ? [selected.preset] : []} items={loadBoxes} onItemTransform={handleItemTransform} readOnly={!editable} />
            {selected && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-white/85 px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm backdrop-blur">
                {selected.preset.name} · {selected.preset.length} × {selected.preset.width} × {selected.preset.height} m
              </div>
            )}
            {!selected && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-lg bg-white/85 px-4 py-2 text-center text-sm text-gray-500 shadow-sm">
                  {loaded.length === 0
                    ? (editable ? 'Ajoutez un véhicule pour commencer →' : 'Aucun chargement enregistré.')
                    : 'Choisissez un chargement ci-dessus.'}
                </div>
              </div>
            )}
          </div>

          {selected && currentPlacements.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Chargé ({currentPlacements.length})</span>
                {editable && (
                  <button onClick={() => setPlacements((prev) => ({ ...prev, [selected.uid]: [] }))} className="text-[11px] text-gray-400 hover:text-red-500">Tout retirer</button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentPlacements.map((p) => {
                  const col = elements.find((e) => e.key === p.key)?.color;
                  return (
                    <span key={p.uid} className="inline-flex items-center gap-1.5 rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: col || '#cbd5e1' }} />
                      {p.name}
                      {p.weightKg > 0 && <span className="text-gray-400">{p.weightKg.toFixed(0)}kg</span>}
                      {editable && (
                        <button onClick={() => removePlacement(selected.uid, p.uid)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="w-full flex-shrink-0 xl:w-80">
          <div className="flex flex-col rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-800">
              <PackageOpen className="h-4 w-4 text-orange-600" /> Éléments du projet
              <span className="ml-auto rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-500">{elements.length}</span>
            </div>
            {!editable ? (
              <p className="px-3 py-4 text-xs text-gray-400">Passez le projet en édition pour ajouter et agencer des éléments.</p>
            ) : elements.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400">Aucun matériel dans ce projet.</p>
            ) : (
              <ul className="divide-y divide-gray-50 overflow-y-auto" style={{ maxHeight: '62vh' }}>
                {elements.map((el) => (
                  <React.Fragment key={el.key}>
                    <li
                      draggable={Boolean(selected) && editingKey !== el.key}
                      onDragStart={(e) => { draggingRef.current = el.key; e.dataTransfer.setData('text/plain', el.key); e.dataTransfer.effectAllowed = 'copy'; }}
                      onDragEnd={() => { draggingRef.current = null; }}
                      className={`group flex items-center gap-2 px-3 py-2 ${selected ? 'cursor-grab active:cursor-grabbing hover:bg-orange-50' : 'opacity-60'}`}
                      title={selected ? 'Glissez dans la vue 3D' : 'Choisissez un véhicule'}
                    >
                      <span className="h-7 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: el.color || '#cbd5e1' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{el.name} <span className="font-normal text-gray-400">× {el.quantity}</span></span>
                        <span className="block text-[11px] text-gray-400">
                          {(el.length * 100).toFixed(0)}×{(el.width * 100).toFixed(0)}×{(el.height * 100).toFixed(0)} cm
                          {!el.hasDims && ' · déf.'}
                          {el.weightKg > 0 ? ` · ${el.weightKg.toFixed(0)}kg` : ''}
                          {el.tippable && ' · flight'}
                        </span>
                      </span>
                      {el.equipmentId && (
                        <button type="button" onClick={() => (editingKey === el.key ? setEditingKey(null) : openEdit(el))} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Modifier">
                          <Settings2 className="h-4 w-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => addPlacement(el.key)} disabled={!selected} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-gray-100 text-gray-500 transition-colors group-hover:bg-orange-500 group-hover:text-white disabled:opacity-40" aria-label="Charger">
                        <Plus className="h-4 w-4" />
                      </button>
                    </li>
                    {editingKey === el.key && (
                      <li className="space-y-2 bg-gray-50 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <input type="color" value={editForm.color} onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))} className="h-7 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5" />
                          <span className="text-xs text-gray-500">Couleur de l'équipement</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['length', 'width', 'height'] as const).map((dim) => (
                            <label key={dim} className="block">
                              <span className="text-[10px] uppercase text-gray-400">{dim === 'length' ? 'L' : dim === 'width' ? 'l' : 'h'} (cm)</span>
                              <input type="number" min="0" value={editForm[dim]} onChange={(e) => setEditForm((f) => ({ ...f, [dim]: e.target.value }))} className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-orange-400 focus:outline-none" />
                            </label>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingKey(null)} className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-white">Annuler</button>
                          <button onClick={() => saveElementEdit(el)} className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-700">
                            <Check className="h-3.5 w-3.5" /> Enregistrer
                          </button>
                        </div>
                      </li>
                    )}
                  </React.Fragment>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ── Vehicle catalog modal ─────────────────────────────────────────── */}
      {showCatalog && editable && (
        <div className="fixed inset-0 z-[11000] flex items-start justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setShowCatalog(false)} />
          <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Truck className="h-4 w-4 text-orange-600" /> Ajouter un véhicule</h3>
              <button onClick={() => setShowCatalog(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="border-b border-gray-100 p-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un véhicule…" className="w-full rounded-md border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm focus:border-orange-400 focus:outline-none" autoFocus />
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {filteredGroups.map((group) => {
                const open = (expanded[group.id] ?? true) || Boolean(q);
                return (
                  <div key={group.id} className="overflow-hidden rounded-lg border border-gray-100">
                    <button type="button" onClick={() => setExpanded((p) => ({ ...p, [group.id]: !(p[group.id] ?? true) }))} className="flex w-full items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100">
                      {group.label}
                      <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
                    </button>
                    {open && (
                      <ul className="divide-y divide-gray-50">
                        {group.presets.map((preset) => (
                          <li key={preset.id}>
                            <button type="button" onClick={() => { addVehicle(preset); setShowCatalog(false); }} className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-orange-50">
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-gray-800">{preset.name}</span>
                                <span className="block text-[11px] text-gray-400">{preset.length} × {preset.width} × {preset.height} m · {presetVolume(preset).toFixed(1)} m³{preset.payloadKg ? ` · ${preset.payloadKg.toLocaleString('fr-FR')} kg` : ''}</span>
                              </span>
                              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-gray-100 text-gray-500 transition-colors group-hover:bg-orange-500 group-hover:text-white"><Plus className="h-4 w-4" /></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {filteredGroups.length === 0 && <p className="px-2 py-6 text-center text-xs text-gray-400">Aucun véhicule ne correspond.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentalLoadingTab;
