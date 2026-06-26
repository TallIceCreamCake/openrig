import React from 'react';
import { Plus, Trash2, Package, Boxes, X, Save, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import PackEquipmentSelectionModal from '../packs/PackEquipmentSelectionModal';
import type { Equipment } from '../../types/equipment';

interface FlightRow {
  id: string;
  name: string;
  unit_weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  items: { id: string; equipment_id: string; quantity: number; equipment_name: string; unit_weight_kg: number | null }[];
}

interface ContentDraft {
  equipment_id: string;
  name: string;
  quantity: number;
  unit_weight_kg: number | null;
}

const num = (v: string) => {
  const n = Number((v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const loadedWeight = (f: { unit_weight_kg: number | null; items: { quantity: number; unit_weight_kg: number | null }[] }) =>
  (f.unit_weight_kg || 0) + f.items.reduce((s, it) => s + (it.unit_weight_kg || 0) * it.quantity, 0);

const FlightCaseManager: React.FC = () => {
  const [flights, setFlights] = React.useState<FlightRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selectionOpen, setSelectionOpen] = React.useState(false);

  // Create form state
  const [name, setName] = React.useState('');
  const [emptyWeight, setEmptyWeight] = React.useState('');
  const [length, setLength] = React.useState('');
  const [width, setWidth] = React.useState('');
  const [height, setHeight] = React.useState('');
  const [contents, setContents] = React.useState<ContentDraft[]>([]);

  const fetchFlights = React.useCallback(async () => {
    setLoading(true);
    try {
      const db = supabase as any;
      const { data, error } = await db
        .from('equipment')
        .select('id, name, unit_weight_kg, length_cm, width_cm, height_cm, equipment_flight_case_items!flight_case_id ( id, equipment_id, quantity, sort_order, equipment:equipment_id ( name, unit_weight_kg ) )')
        .eq('type', 'Flight')
        .order('name');
      if (error) throw error;
      const rows: FlightRow[] = (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        unit_weight_kg: r.unit_weight_kg,
        length_cm: r.length_cm,
        width_cm: r.width_cm,
        height_cm: r.height_cm,
        items: (r.equipment_flight_case_items || [])
          .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((it: any) => ({
            id: it.id,
            equipment_id: it.equipment_id,
            quantity: it.quantity,
            equipment_name: it.equipment?.name || 'Équipement',
            unit_weight_kg: it.equipment?.unit_weight_kg ?? null,
          })),
      }));
      setFlights(rows);
    } catch (err) {
      console.error('load flight cases', err);
      toast.error('Impossible de charger les flight cases');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchFlights(); }, [fetchFlights]);

  const resetForm = () => {
    setName(''); setEmptyWeight(''); setLength(''); setWidth(''); setHeight(''); setContents([]);
  };

  const addContent = (equipment: Equipment, quantity: number) => {
    setContents((prev) => [
      ...prev,
      { equipment_id: equipment.id, name: equipment.name, quantity, unit_weight_kg: equipment.unit_weight_kg ?? null },
    ]);
    setSelectionOpen(false);
  };
  const removeContent = (equipmentId: string) => setContents((prev) => prev.filter((c) => c.equipment_id !== equipmentId));

  const draftWeight = num(emptyWeight) + contents.reduce((s, c) => s + (c.unit_weight_kg || 0) * c.quantity, 0);

  const save = async () => {
    if (!name.trim()) { toast.error('Nom requis'); return; }
    setSaving(true);
    try {
      const db = supabase as any;
      const { data: eq, error: eqErr } = await db
        .from('equipment')
        .insert({
          name: name.trim(),
          type: 'Flight',
          rental_price_ht: 0,
          rental_price_ttc: 0,
          status: 'available',
          inventory_category: 'vrac',
          unit_weight_kg: num(emptyWeight) || null,
          length_cm: num(length) || null,
          width_cm: num(width) || null,
          height_cm: num(height) || null,
        })
        .select()
        .single();
      if (eqErr) throw eqErr;

      const { error: fcErr } = await db.from('equipment_flight_cases').insert({ equipment_id: eq.id });
      if (fcErr) throw fcErr;

      if (contents.length) {
        const items = contents.map((c, i) => ({
          flight_case_id: eq.id,
          equipment_id: c.equipment_id,
          quantity: Math.max(1, Math.floor(c.quantity || 1)),
          sort_order: i,
        }));
        const { error: itErr } = await db.from('equipment_flight_case_items').insert(items);
        if (itErr) throw itErr;
      }

      toast.success('Flight case créé');
      resetForm();
      setCreating(false);
      await fetchFlights();
    } catch (err) {
      console.error('save flight case', err);
      toast.error('Erreur lors de la création du flight case');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await (supabase as any).from('equipment').delete().eq('id', id);
      if (error) throw error;
      setFlights((prev) => prev.filter((f) => f.id !== id));
      toast.success('Flight case supprimé');
    } catch (err) {
      console.error('delete flight case', err);
      toast.error('Suppression impossible');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Boxes className="h-5 w-5 text-orange-600" /> Flight cases
        </h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            <Plus className="h-4 w-4" /> Nouveau flight
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Nouveau flight case</h3>
            <button onClick={() => { setCreating(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <label className="col-span-2 block">
              <span className="text-xs font-medium text-gray-500">Nom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Flight 4 projecteurs" className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-orange-400 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Poids à vide (kg)</span>
              <input type="number" min="0" step="0.1" value={emptyWeight} onChange={(e) => setEmptyWeight(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-orange-400 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">L × l × h (cm)</span>
              <div className="mt-1 flex gap-1">
                <input type="number" min="0" placeholder="L" value={length} onChange={(e) => setLength(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none" />
                <input type="number" min="0" placeholder="l" value={width} onChange={(e) => setWidth(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none" />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">&nbsp;</span>
              <input type="number" min="0" placeholder="h" value={height} onChange={(e) => setHeight(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none" />
            </label>
          </div>

          {/* Contents */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">Contenu</span>
              <button onClick={() => setSelectionOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-white px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50">
                <Plus className="h-3.5 w-3.5" /> Ajouter du matériel
              </button>
            </div>
            {contents.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">Aucun matériel. Un flight de 4 projecteurs comptera comme 1 flight de 4.</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
                {contents.map((c) => (
                  <li key={c.equipment_id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate text-gray-800">{c.name} <span className="text-gray-400">× {c.quantity}</span></span>
                    <span className="flex items-center gap-3">
                      {c.unit_weight_kg != null && <span className="text-xs text-gray-400">{(c.unit_weight_kg * c.quantity).toFixed(1)} kg</span>}
                      <button onClick={() => removeContent(c.equipment_id)} className="text-gray-300 hover:text-red-500"><X className="h-4 w-4" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Poids chargé estimé : <span className="font-semibold text-gray-900">{draftWeight.toFixed(1)} kg</span></span>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Enregistrement…' : 'Créer le flight'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-orange-600" /></div>
      ) : flights.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-8 text-center text-sm text-gray-500">
          Aucun flight case. Créez-en un pour regrouper du matériel (compté comme 1 flight de N).
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {flights.map((f) => (
            <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-orange-600 flex-shrink-0" /> {f.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {f.length_cm && f.width_cm && f.height_cm ? `${f.length_cm} × ${f.width_cm} × ${f.height_cm} cm · ` : ''}
                    vide {(f.unit_weight_kg || 0).toFixed(1)} kg
                  </div>
                </div>
                <button onClick={() => remove(f.id)} className="flex-shrink-0 text-gray-300 hover:text-red-500" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
              </div>
              {f.items.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                  {f.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-1.5 truncate">
                      <Package className="h-3 w-3 text-gray-300 flex-shrink-0" /> {it.equipment_name} <span className="text-gray-400">× {it.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 border-t border-gray-100 pt-2 text-xs flex justify-between">
                <span className="text-gray-500">{f.items.reduce((s, it) => s + it.quantity, 0)} élément(s)</span>
                <span className="font-semibold text-gray-800">{loadedWeight(f).toFixed(1)} kg chargé</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <PackEquipmentSelectionModal
        isOpen={selectionOpen}
        onClose={() => setSelectionOpen(false)}
        existingEquipment={new Set(contents.map((c) => c.equipment_id))}
        alreadySelected={contents.map((c) => ({ equipment_id: c.equipment_id, quantity: c.quantity }))}
        onSelect={addContent}
      />
    </div>
  );
};

export default FlightCaseManager;
