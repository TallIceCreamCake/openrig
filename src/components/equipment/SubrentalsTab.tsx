import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Building2, Euro, Mail, Phone, Plus, Search, User, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubrentalItem {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  supplier_name: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  day_rate: number | null;
  week_rate: number | null;
  notes: string | null;
  is_active: boolean;
}

const EMPTY: Omit<SubrentalItem, 'id' | 'is_active'> = {
  name: '', category: '', description: '',
  supplier_name: '', supplier_contact: '', supplier_email: '', supplier_phone: '',
  day_rate: null, week_rate: null, notes: '',
};

const CATEGORIES = [
  'Son', 'Lumière', 'Vidéo', 'Structure', 'Scène', 'Transport',
  'Electricité', 'Effets spéciaux', 'Communication', 'Autre',
];

// ─── Modal ───────────────────────────────────────────────────────────────────

const Modal: React.FC<{ item: SubrentalItem | null; onClose: () => void; onSaved: () => void }> = ({ item, onClose, onSaved }) => {
  const isEdit = item !== null;
  const [form, setForm] = useState<Omit<SubrentalItem, 'id' | 'is_active'>>(
    item ? { name: item.name, category: item.category ?? '', description: item.description ?? '',
              supplier_name: item.supplier_name, supplier_contact: item.supplier_contact ?? '',
              supplier_email: item.supplier_email ?? '', supplier_phone: item.supplier_phone ?? '',
              day_rate: item.day_rate, week_rate: item.week_rate, notes: item.notes ?? '' }
         : { ...EMPTY }
  );
  const [saving, setSaving] = useState(false);
  const set = (field: string, value: string | number | null) => setForm(p => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    if (!form.supplier_name.trim()) { toast.error('Fournisseur requis'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category?.trim() || null,
        description: form.description?.trim() || null,
        supplier_name: form.supplier_name.trim(),
        supplier_contact: form.supplier_contact?.trim() || null,
        supplier_email: form.supplier_email?.trim() || null,
        supplier_phone: form.supplier_phone?.trim() || null,
        day_rate: form.day_rate ?? null,
        week_rate: form.week_rate ?? null,
        notes: form.notes?.trim() || null,
      };
      const { error } = isEdit
        ? await supabase.from('subrental_items').update(payload).eq('id', item!.id)
        : await supabase.from('subrental_items').insert(payload);
      if (error) throw error;
      toast.success(isEdit ? 'Article mis à jour' : 'Article ajouté');
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const inp = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Modifier l'article" : 'Ajouter un article sous-loué'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Matériel</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={lbl}>Nom <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="ex : Midas M32 Live" className={inp} required />
              </div>
              <div>
                <label className={lbl}>Catégorie</label>
                <select value={form.category ?? ''} onChange={e => set('category', e.target.value)} className={inp}>
                  <option value="">— Aucune —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Description courte</label>
                <input value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="ex : Console 32 entrées" className={inp} />
              </div>
            </div>
          </section>

          <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">Fournisseur (provenance)</h3>
            </div>
            <div>
              <label className={lbl + ' text-amber-700'}>Nom du fournisseur <span className="text-red-500">*</span></label>
              <input value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} placeholder="ex : SoundCo Paris" className={inp} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl + ' text-amber-700'}>Contact</label>
                <input value={form.supplier_contact ?? ''} onChange={e => set('supplier_contact', e.target.value)} placeholder="Prénom Nom" className={inp} />
              </div>
              <div>
                <label className={lbl + ' text-amber-700'}>Téléphone</label>
                <input value={form.supplier_phone ?? ''} onChange={e => set('supplier_phone', e.target.value)} placeholder="+33 6 ..." className={inp} />
              </div>
              <div className="col-span-2">
                <label className={lbl + ' text-amber-700'}>Email</label>
                <input type="email" value={form.supplier_email ?? ''} onChange={e => set('supplier_email', e.target.value)} placeholder="contact@fournisseur.fr" className={inp} />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Tarifs que vous payez</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Tarif / jour (€)</label>
                <input type="number" min="0" step="0.01" value={form.day_rate ?? ''} onChange={e => set('day_rate', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="0.00" className={inp} />
              </div>
              <div>
                <label className={lbl}>Tarif / semaine (€)</label>
                <input type="number" min="0" step="0.01" value={form.week_rate ?? ''} onChange={e => set('week_rate', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="0.00" className={inp} />
              </div>
            </div>
          </section>

          <div>
            <label className={lbl}>Notes internes</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Conditions, délai de commande..." className={inp + ' resize-none'} />
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100">Annuler</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Row ─────────────────────────────────────────────────────────────────────

const fmt = (n: number | null) =>
  n != null ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—';

const ItemRow: React.FC<{ item: SubrentalItem; onEdit: (i: SubrentalItem) => void; onDelete: (id: string) => void }> = ({ item, onEdit, onDelete }) => (
  <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl group transition-colors">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
        {item.category && <span className="shrink-0 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{item.category}</span>}
        {!item.is_active && <span className="shrink-0 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">Inactif</span>}
      </div>
      {item.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>}
    </div>
    <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500">
      {item.day_rate != null && <span className="flex items-center gap-1"><Euro className="h-3 w-3" />{fmt(item.day_rate)}/j</span>}
      {item.week_rate != null && <span className="hidden sm:flex items-center gap-1 text-gray-400">{fmt(item.week_rate)}/sem</span>}
    </div>
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
      <button onClick={() => onEdit(item)} className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg font-medium">Modifier</button>
      <button onClick={() => onDelete(item.id)} className="px-3 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium">Supprimer</button>
    </div>
  </div>
);

// ─── Tab component ────────────────────────────────────────────────────────────

const SubrentalsTab: React.FC = () => {
  const [items, setItems] = useState<SubrentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item: SubrentalItem | null }>({ open: false, item: null });

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('subrental_items').select('*').order('supplier_name').order('name');
    if (error) toast.error('Erreur de chargement');
    else setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet article ?')) return;
    const { error } = await supabase.from('subrental_items').delete().eq('id', id);
    if (error) toast.error('Erreur suppression');
    else { toast.success('Article supprimé'); fetchItems(); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.supplier_name.toLowerCase().includes(q) ||
      (i.category?.toLowerCase().includes(q) ?? false)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SubrentalItem[]>();
    filtered.forEach(item => {
      if (!map.has(item.supplier_name)) map.set(item.supplier_name, []);
      map.get(item.supplier_name)!.push(item);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher (article, fournisseur...)"
            className="pl-9 pr-8 py-2 w-full rounded-lg border border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setModal({ open: true, item: null })}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <ArrowLeftRight className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun article sous-loué</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">Ajoutez le matériel que vous louez auprès de fournisseurs tiers.</p>
          <button onClick={() => setModal({ open: true, item: null })} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Ajouter un premier article
          </button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Aucun résultat pour « {query} »</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([supplierName, supplierItems]) => {
            const first = supplierItems[0];
            return (
              <div key={supplierName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border-b border-amber-100">
                  <Building2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900">{supplierName}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5">
                      {first.supplier_contact && <span className="flex items-center gap-1 text-xs text-amber-700"><User className="h-3 w-3" />{first.supplier_contact}</span>}
                      {first.supplier_phone && <span className="flex items-center gap-1 text-xs text-amber-700"><Phone className="h-3 w-3" />{first.supplier_phone}</span>}
                      {first.supplier_email && <a href={`mailto:${first.supplier_email}`} className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"><Mail className="h-3 w-3" />{first.supplier_email}</a>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-amber-600 font-medium">{supplierItems.length} article{supplierItems.length > 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {supplierItems.map(item => (
                    <ItemRow key={item.id} item={item} onEdit={i => setModal({ open: true, item: i })} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && (
        <Modal item={modal.item} onClose={() => setModal({ open: false, item: null })} onSaved={() => { setModal({ open: false, item: null }); fetchItems(); }} />
      )}
    </div>
  );
};

export default SubrentalsTab;
