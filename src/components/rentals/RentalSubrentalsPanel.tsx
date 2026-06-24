import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Building2, Check, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubrentalLine {
  id: string;
  rental_id: string;
  subrental_item_id: string | null;
  name: string;
  supplier_name: string;
  quantity: number;
  days: number;
  unit_cost: number;
  sell_price: number | null;
  status: 'planned' | 'ordered' | 'confirmed' | 'delivered' | 'returned';
  notes: string | null;
}

interface CatalogItem {
  id: string;
  name: string;
  category: string | null;
  supplier_name: string;
  day_rate: number | null;
}

const STATUS_CFG: Record<SubrentalLine['status'], { label: string; cls: string }> = {
  planned:   { label: 'Planifié',  cls: 'bg-gray-100 text-gray-600' },
  ordered:   { label: 'Commandé', cls: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Confirmé', cls: 'bg-green-100 text-green-700' },
  delivered: { label: 'Livré',    cls: 'bg-amber-100 text-amber-700' },
  returned:  { label: 'Rendu',    cls: 'bg-purple-100 text-purple-700' },
};

const STATUSES = Object.keys(STATUS_CFG) as SubrentalLine['status'][];

const fmt = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// ─── Catalog picker modal ─────────────────────────────────────────────────────

const CatalogPicker: React.FC<{
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
}> = ({ onPick, onClose }) => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    supabase.from('subrental_items')
      .select('id, name, category, supplier_name, day_rate')
      .eq('is_active', true)
      .order('supplier_name').order('name')
      .then(({ data }) => setItems(data ?? []));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || i.supplier_name.toLowerCase().includes(q)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    filtered.forEach(i => {
      if (!map.has(i.supplier_name)) map.set(i.supplier_name, []);
      map.get(i.supplier_name)!.push(i);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Choisir depuis le catalogue</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher..."
              className="pl-9 w-full rounded-lg border border-gray-300 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 py-2">
          {grouped.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Aucun article dans le catalogue</p>
          ) : grouped.map(([supplier, citems]) => (
            <div key={supplier}>
              <div className="px-4 py-1.5 bg-amber-50 text-xs font-semibold text-amber-700 flex items-center gap-1.5 sticky top-0">
                <Building2 className="h-3 w-3" />{supplier}
              </div>
              {citems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { onPick(item); onClose(); }}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.category && <p className="text-xs text-gray-400">{item.category}</p>}
                  </div>
                  {item.day_rate != null && (
                    <span className="text-xs text-gray-500 shrink-0 ml-3">{fmt(item.day_rate)}/j</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  rentalId: string;
  rentalDays: number;
  isEditing: boolean;
}

const RentalSubrentalsPanel: React.FC<Props> = ({ rentalId, rentalDays, isEditing }) => {
  const [lines, setLines] = useState<SubrentalLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchLines = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rental_subrental_lines')
      .select('*')
      .eq('rental_id', rentalId)
      .order('created_at');
    if (error) toast.error('Erreur de chargement');
    else setLines((data ?? []) as SubrentalLine[]);
    setLoading(false);
  };

  useEffect(() => { fetchLines(); }, [rentalId]);

  const addFromCatalog = async (item: CatalogItem) => {
    const { data, error } = await supabase.from('rental_subrental_lines').insert({
      rental_id: rentalId,
      subrental_item_id: item.id,
      name: item.name,
      supplier_name: item.supplier_name,
      quantity: 1,
      days: rentalDays || 1,
      unit_cost: item.day_rate ?? 0,
      status: 'planned',
    }).select().single();
    if (error) { toast.error('Erreur'); return; }
    setLines(prev => [...prev, data as SubrentalLine]);
  };

  const addManual = async () => {
    const { data, error } = await supabase.from('rental_subrental_lines').insert({
      rental_id: rentalId,
      name: 'Nouvel article',
      supplier_name: 'Fournisseur',
      quantity: 1,
      days: rentalDays || 1,
      unit_cost: 0,
      status: 'planned',
    }).select().single();
    if (error) { toast.error('Erreur'); return; }
    setLines(prev => [...prev, data as SubrentalLine]);
  };

  const updateLine = async (id: string, changes: Partial<SubrentalLine>) => {
    setSaving(id);
    const updated = { ...changes };
    const { error } = await supabase.from('rental_subrental_lines').update(updated).eq('id', id);
    if (error) toast.error('Erreur mise à jour');
    else setLines(prev => prev.map(l => l.id === id ? { ...l, ...changes } : l));
    setSaving(null);
  };

  const deleteLine = async (id: string) => {
    if (!confirm('Supprimer cette ligne ?')) return;
    const { error } = await supabase.from('rental_subrental_lines').delete().eq('id', id);
    if (error) toast.error('Erreur suppression');
    else setLines(prev => prev.filter(l => l.id !== id));
  };

  const totalCost = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.days * l.unit_cost, 0),
    [lines]
  );

  const inp = 'rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-full';

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">Matériel sous-loué</p>
            <p className="text-xs text-gray-500 mt-0.5">Matériel loué auprès de fournisseurs tiers pour ce projet.</p>
          </div>
          {isEditing && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                <Package className="h-3.5 w-3.5" />
                Depuis catalogue
              </button>
              <button
                onClick={addManual}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Manuel
              </button>
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="text-center py-12">
            <ArrowLeftRight className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucun matériel sous-loué pour ce projet.</p>
            {isEditing && (
              <button
                onClick={() => setShowPicker(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter depuis le catalogue
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Article</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Fournisseur</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-16">Qté</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-16">Jours</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-24">Coût/j</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-24">Total</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-28">Statut</th>
                  {isEditing && <th className="px-4 py-2.5 w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map(line => {
                  const total = line.quantity * line.days * line.unit_cost;
                  const cfg = STATUS_CFG[line.status];
                  const isSaving = saving === line.id;
                  return (
                    <tr key={line.id} className={isSaving ? 'opacity-60' : ''}>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            value={line.name}
                            onChange={e => setLines(prev => prev.map(l => l.id === line.id ? { ...l, name: e.target.value } : l))}
                            onBlur={e => updateLine(line.id, { name: e.target.value })}
                            className={inp}
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-900">{line.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <input
                            value={line.supplier_name}
                            onChange={e => setLines(prev => prev.map(l => l.id === line.id ? { ...l, supplier_name: e.target.value } : l))}
                            onBlur={e => updateLine(line.id, { supplier_name: e.target.value })}
                            className={inp}
                          />
                        ) : (
                          <span className="text-sm text-gray-600">{line.supplier_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isEditing ? (
                          <input
                            type="number" min="1"
                            value={line.quantity}
                            onChange={e => setLines(prev => prev.map(l => l.id === line.id ? { ...l, quantity: parseInt(e.target.value) || 1 } : l))}
                            onBlur={e => updateLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                            className={inp + ' text-center'}
                          />
                        ) : (
                          <span className="text-sm text-gray-700">{line.quantity}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isEditing ? (
                          <input
                            type="number" min="1"
                            value={line.days}
                            onChange={e => setLines(prev => prev.map(l => l.id === line.id ? { ...l, days: parseInt(e.target.value) || 1 } : l))}
                            onBlur={e => updateLine(line.id, { days: parseInt(e.target.value) || 1 })}
                            className={inp + ' text-center'}
                          />
                        ) : (
                          <span className="text-sm text-gray-700">{line.days}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isEditing ? (
                          <input
                            type="number" min="0" step="0.01"
                            value={line.unit_cost}
                            onChange={e => setLines(prev => prev.map(l => l.id === line.id ? { ...l, unit_cost: parseFloat(e.target.value) || 0 } : l))}
                            onBlur={e => updateLine(line.id, { unit_cost: parseFloat(e.target.value) || 0 })}
                            className={inp + ' text-right'}
                          />
                        ) : (
                          <span className="text-sm text-gray-700">{fmt(line.unit_cost)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-sm font-semibold text-gray-900">{fmt(total)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isEditing ? (
                          <select
                            value={line.status}
                            onChange={e => updateLine(line.id, { status: e.target.value as SubrentalLine['status'] })}
                            className="rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-blue-500 outline-none"
                          >
                            {STATUSES.map(s => (
                              <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                        )}
                      </td>
                      {isEditing && (
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => deleteLine(line.id)}
                            className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {lines.length > 0 && (
          <div className="flex justify-end items-center gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">Coût total sous-location :</span>
            <span className="text-sm font-bold text-gray-900">{fmt(totalCost)}</span>
          </div>
        )}
      </div>

      {showPicker && (
        <CatalogPicker
          onPick={addFromCatalog}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

export default RentalSubrentalsPanel;
