import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus, Check, ChevronDown, ChevronRight, Lightbulb, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Equipment } from '../../types/equipment';
import { RentalItem } from '../../types/rental';
import { supabase } from '../../lib/supabase';
import ConfirmDialog from '../common/ConfirmDialog';
import EquipmentTooltip, { useEquipmentTooltip } from '../common/EquipmentTooltip';

interface Props {
  existingItems: RentalItem[];
  onAdd: (equipment: Equipment) => void;
  onRemoveItem?: (itemId: string) => void;
  onRemoveGroup?: (groupId: string) => void;
  groups?: Array<{ id: string; name: string }>;
  startDate?: string;
  endDate?: string;
  skipAvailability?: boolean;
}

const UNAVAIL_REASON: Record<string, string> = {
  maintenance: 'maintenance',
  in_use: 'en location',
  broken: 'HS',
};

const EquipmentCatalogPanel: React.FC<Props> = ({
  existingItems,
  onAdd,
  onRemoveItem,
  onRemoveGroup,
  groups = [],
  startDate,
  endDate,
  skipAvailability = false,
}) => {
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState<Set<string>>(new Set());

  // Filter panel
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterAvail, setFilterAvail] = useState<'all' | 'available' | 'unavailable'>('all');
  const filterRef = useRef<HTMLDivElement>(null);

  // Equipment tooltip (3s hover delay)
  const { tooltip: eqTooltip, trigger: triggerTooltip, clear: clearTooltip } = useEquipmentTooltip();

  // Trash overlay (drop from right list)
  const [draggingType, setDraggingType] = useState<'item' | 'group' | null>(null);
  const [trashDragOver, setTrashDragOver] = useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<{ id: string; name: string } | null>(null);
  const RENTAL_ITEM_DRAG_TYPE = 'rental/item';
  const RENTAL_GROUP_DRAG_TYPE = 'rental/group';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('equipment')
        .select('id, name, type, subtype, inventory_category, status, rental_price_ht, rental_price_ttc, image_url')
        .not('status', 'eq', 'broken')
        .order('name');
      setAllEquipment((data || []) as Equipment[]);
      setLoading(false);
    };
    load();
  }, []);

  // Stable key representing current rental item quantities — used to retrigger availability on add/remove
  const existingItemsKey = existingItems.map((i) => `${i.equipment_id}:${i.quantity}`).sort().join('|');

  // Availability — re-fetched whenever rental items change (add/remove triggers fresh DB query)
  useEffect(() => {
    if (skipAvailability || !startDate || !endDate || allEquipment.length === 0) return;
    const ids = allEquipment.map((e) => e.id).filter(Boolean);
    if (ids.length === 0) return;
    (async () => {
      const { data } = await supabase.rpc('get_units_availability_for_equipment', {
        p_ids: ids, p_start: startDate, p_end: endDate,
      });
      const map: Record<string, number> = {};
      ((data || []) as any[]).forEach((row: any) => { map[row.equipment_id] = row.available; });
      setAvailability(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEquipment, startDate, endDate, skipAvailability, existingItemsKey]);

  // Detect rental item/group drag globally
  useEffect(() => {
    if (!onRemoveItem && !onRemoveGroup) return;
    const onStart = (e: DragEvent) => {
      clearTooltip();
      if (onRemoveItem && e.dataTransfer?.types.includes(RENTAL_ITEM_DRAG_TYPE)) {
        setDraggingType('item');
      } else if (onRemoveGroup && e.dataTransfer?.types.includes(RENTAL_GROUP_DRAG_TYPE)) {
        setDraggingType('group');
      }
    };
    const onEnd = () => {
      setDraggingType(null);
      setTrashDragOver(false);
    };
    document.addEventListener('dragstart', onStart);
    document.addEventListener('dragend', onEnd);
    return () => {
      document.removeEventListener('dragstart', onStart);
      document.removeEventListener('dragend', onEnd);
    };
  }, [onRemoveItem, onRemoveGroup]);

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  const existingEquipmentIds = useMemo(
    () => new Set(existingItems.map((i) => i.equipment_id).filter((id): id is string => !!id)),
    [existingItems],
  );

  // Total quantity per equipment already in the rental (across all rows, including splits)
  const quantityInRental = useMemo(() => {
    const map: Record<string, number> = {};
    existingItems.forEach((i) => {
      if (i.equipment_id) map[i.equipment_id] = (map[i.equipment_id] || 0) + i.quantity;
    });
    return map;
  }, [existingItems]);

  const allTypes = useMemo(
    () => Array.from(new Set(allEquipment.map((e) => e.type || 'Autre').filter(Boolean))).sort(),
    [allEquipment],
  );

  const filtered = useMemo(() => {
    let list = allEquipment;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (eq) =>
          eq.name.toLowerCase().includes(q) ||
          (eq.type || '').toLowerCase().includes(q) ||
          (eq.subtype || '').toLowerCase().includes(q),
      );
    }
    if (filterType) {
      list = list.filter((eq) => (eq.type || 'Autre') === filterType);
    }
    if (filterAvail === 'available') {
      list = list.filter((eq) => {
        const raw = availability[eq.id];
        const eff = typeof raw === 'number' ? Math.max(0, raw - (quantityInRental[eq.id] || 0)) : raw;
        return skipAvailability || typeof eff !== 'number' || eff > 0;
      });
    } else if (filterAvail === 'unavailable') {
      list = list.filter((eq) => {
        const raw = availability[eq.id];
        const eff = typeof raw === 'number' ? Math.max(0, raw - (quantityInRental[eq.id] || 0)) : raw;
        return !skipAvailability && typeof eff === 'number' && eff <= 0;
      });
    }
    return list;
  }, [allEquipment, search, filterType, filterAvail, availability, skipAvailability]);

  const grouped = useMemo(() => {
    const map = new Map<string, Equipment[]>();
    filtered.forEach((eq) => {
      const key = eq.type || 'Autre';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(eq);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const suggestions = useMemo(() => {
    if (existingItems.length === 0) return [];
    const usedTypes = new Set(existingItems.map((i) => i.equipment_type));
    return allEquipment
      .filter((eq) => usedTypes.has(eq.type || '') && !existingEquipmentIds.has(eq.id))
      .slice(0, 5);
  }, [allEquipment, existingItems, existingEquipmentIds]);

  const toggleType = (type: string) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleAdd = async (equipment: Equipment) => {
    if (adding.has(equipment.id)) return;
    setAdding((prev) => new Set(prev).add(equipment.id));
    try {
      await onAdd(equipment);
    } finally {
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(equipment.id);
        return next;
      });
    }
  };

  const getUnavailReason = (eq: Equipment, effectiveAvail: number | undefined): string | null => {
    if (skipAvailability || typeof effectiveAvail !== 'number' || effectiveAvail > 0) return null;
    if (eq.status === 'maintenance') return 'maintenance';
    return 'en location';
  };

  const hasActiveFilters = filterType !== '' || filterAvail !== 'all';

  const DRAG_TYPE = 'catalog/equipment';

  const renderEquipmentItem = (eq: Equipment) => {
    const rawAvail = availability[eq.id];
    // Subtract what's already in the rental (RPC excludes the current rental from its count)
    const alreadyInRental = quantityInRental[eq.id] || 0;
    const avail = typeof rawAvail === 'number' ? Math.max(0, rawAvail - alreadyInRental) : rawAvail;
    const isUnavailable = !skipAvailability && typeof avail === 'number' && avail <= 0;
    const unavailReason = getUnavailReason(eq, avail);
    const draggable = !isUnavailable;
    const price = eq.rental_price_ttc || eq.rental_price_ht || 0;

    return (
      <div
        key={eq.id}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) { e.preventDefault(); return; }
          clearTooltip();
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({
            id: eq.id,
            name: eq.name,
            type: eq.type || '',
            subtype: eq.subtype || null,
            rental_price_ht: eq.rental_price_ht || 0,
            rental_price_ttc: eq.rental_price_ttc || 0,
            status: eq.status,
            inventory_category: eq.inventory_category,
            image_url: null,
          }));
          e.dataTransfer.setData('text/plain', JSON.stringify({ __catalog: true, id: eq.id }));
        }}
        onMouseEnter={draggingType === null ? (e) => triggerTooltip(e, {
          name: eq.name,
          type: eq.type || null,
          subtype: eq.subtype || null,
          price: eq.rental_price_ttc || eq.rental_price_ht || null,
          imageUrl: (eq as any).image_url || null,
        }) : undefined}
        onMouseLeave={clearTooltip}
        className={`group/item flex items-center gap-2 px-3 py-1 border-b border-gray-50 dark:border-gray-800 transition-colors
          ${isUnavailable ? 'opacity-50 cursor-not-allowed' : 'cursor-grab hover:bg-blue-50/50 dark:hover:bg-blue-900/10 active:cursor-grabbing'}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate leading-snug">
              {eq.name}
            </span>
            {unavailReason && (
              <span className="text-[10px] text-red-400 whitespace-nowrap flex-shrink-0">({unavailReason})</span>
            )}
          </div>
          {typeof avail === 'number' && !skipAvailability && (
            <div className={`text-[10px] leading-none mt-0.5 font-medium ${avail > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {avail > 0 ? `${avail} dispo` : 'Indisponible'}
            </div>
          )}
        </div>

        {/* Price */}
        {price > 0 && (
          <span className="flex-shrink-0 text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
            {price.toFixed(0)}€/j
          </span>
        )}

        <button
          onClick={() => !isUnavailable && handleAdd(eq)}
          disabled={isUnavailable || adding.has(eq.id)}
          className={`flex-shrink-0 p-0.5 rounded transition-colors
            ${isUnavailable
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 opacity-0 group-hover/item:opacity-100'
            }`}
          title="Ajouter (qté 1)"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    );
  };

  // Trash overlay drag handlers
  const isTrashDrag = (e: React.DragEvent) =>
    (onRemoveItem && e.dataTransfer.types.includes(RENTAL_ITEM_DRAG_TYPE)) ||
    (onRemoveGroup && e.dataTransfer.types.includes(RENTAL_GROUP_DRAG_TYPE));

  const handlePanelDragOver = (e: React.DragEvent) => {
    if (!isTrashDrag(e)) return;
    e.preventDefault();
    setTrashDragOver(true);
  };

  const handlePanelDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) return;
    setTrashDragOver(false);
  };

  const handlePanelDrop = (e: React.DragEvent) => {
    if (!isTrashDrag(e)) return;
    e.preventDefault();
    setTrashDragOver(false);
    setDraggingType(null);

    if (onRemoveGroup && e.dataTransfer.types.includes(RENTAL_GROUP_DRAG_TYPE)) {
      const groupId = e.dataTransfer.getData(RENTAL_GROUP_DRAG_TYPE);
      if (!groupId) return;
      const group = groups.find((g) => g.id === groupId);
      setPendingDeleteGroup({ id: groupId, name: group?.name || 'ce groupe' });
      return;
    }

    if (onRemoveItem && e.dataTransfer.types.includes(RENTAL_ITEM_DRAG_TYPE)) {
      const itemId = e.dataTransfer.getData(RENTAL_ITEM_DRAG_TYPE);
      if (itemId) onRemoveItem(itemId);
    }
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
    >
      {/* Search + filter */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full pl-6 pr-6 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-blue-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex-shrink-0 p-1.5 rounded-md border transition-colors ${
                hasActiveFilters
                  ? 'border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              title="Filtrer"
            >
              <SlidersHorizontal className="h-3 w-3" />
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </button>

            {showFilters && (
              <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-3">
                {/* Type filter */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Type</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-400"
                  >
                    <option value="">Tous</option>
                    {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Availability filter */}
                {!skipAvailability && (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Disponibilité</label>
                    <div className="flex flex-col gap-1">
                      {(['all', 'available', 'unavailable'] as const).map((v) => (
                        <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="filterAvail"
                            value={v}
                            checked={filterAvail === v}
                            onChange={() => setFilterAvail(v)}
                            className="accent-blue-500"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-300">
                            {v === 'all' ? 'Tous' : v === 'available' ? 'Disponibles' : 'Indisponibles'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {hasActiveFilters && (
                  <button
                    onClick={() => { setFilterType(''); setFilterAvail('all'); }}
                    className="w-full text-xs text-blue-600 dark:text-blue-400 hover:underline text-left"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Equipment list */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="p-4 text-center text-xs text-gray-400">Chargement…</div>
        ) : grouped.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">Aucun résultat</div>
        ) : (
          grouped.map(([type, items]) => {
            const isCollapsed = collapsedTypes.has(type);
            return (
              <div key={type}>
                <button
                  onClick={() => toggleType(type)}
                  className="w-full flex items-center justify-between px-3 py-1 bg-gray-50/80 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left sticky top-0 z-10"
                >
                  <div className="flex items-center gap-1.5">
                    {isCollapsed
                      ? <ChevronRight className="h-3 w-3 text-gray-400" />
                      : <ChevronDown className="h-3 w-3 text-gray-400" />
                    }
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {type}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 tabular-nums">{items.length}</span>
                </button>
                {!isCollapsed && items.map(renderEquipmentItem)}
              </div>
            );
          })
        )}
      </div>

      {/* Smart suggestions */}
      {suggestions.length > 0 && !search && !filterType && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-amber-50/60 dark:bg-amber-900/10 flex-shrink-0">
          <div className="px-3 py-1.5 flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3 text-amber-500 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Suggestions
            </span>
          </div>
          {suggestions.map(renderEquipmentItem)}
        </div>
      )}

      {/* Trash drop overlay — neutral when dragging, red when hovering */}
      {draggingType !== null && (
        <div className={`absolute inset-0 z-40 transition-colors duration-100 ${trashDragOver ? 'bg-red-50/90 dark:bg-red-950/80' : 'bg-white/90 dark:bg-gray-900/90'}`}>
          <div className={`absolute inset-3 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors duration-100 ${trashDragOver ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}>
            <Trash2 className={`h-10 w-10 transition-colors duration-100 ${trashDragOver ? 'text-red-500' : 'text-gray-300 dark:text-gray-600'}`} />
            <span className={`text-sm font-semibold transition-colors duration-100 ${trashDragOver ? 'text-red-600' : 'text-gray-400 dark:text-gray-500'}`}>
              {draggingType === 'group' ? 'Supprimer le groupe' : 'Supprimer l\'élément'}
            </span>
          </div>
        </div>
      )}

      {/* Equipment tooltip */}
      {eqTooltip && <EquipmentTooltip data={eqTooltip} anchorX={eqTooltip.x} anchorY={eqTooltip.y} />}

      {/* Group delete confirmation */}
      <ConfirmDialog
        isOpen={pendingDeleteGroup !== null}
        title="Supprimer le groupe"
        message={`Supprimer le groupe "${pendingDeleteGroup?.name}" et tout son contenu ?`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={() => {
          if (pendingDeleteGroup) onRemoveGroup?.(pendingDeleteGroup.id);
          setPendingDeleteGroup(null);
        }}
        onCancel={() => setPendingDeleteGroup(null)}
      />
    </div>
  );
};

export default EquipmentCatalogPanel;
