import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Trash2, GripVertical, ChevronDown, ChevronRight, FolderPlus, Check, X, Wand2, Pencil, Copy } from 'lucide-react';
import ContextMenu, { ContextMenuItemDef } from '../common/ContextMenu';
import { RentalItem } from '../../types/rental';
import { Equipment } from '../../types/equipment';
import EquipmentSelectionModal from './EquipmentSelectionModal';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { useTranslation } from '../../context/TranslationContext';

export interface ExternalEquipmentInput {
  name: string;
  description?: string;
  type: string;
  subtype?: string;
  supplier?: string;
  price_per_day: number;
}

interface EquipmentGroup {
  id: string;
  name: string;
  position: number;
  color?: string | null;
}

interface MoveGroupPayload {
  groupId: string;
  beforeGroupId: string | null;
}

interface MoveItemPayload {
  itemId: string;
  targetGroupId: string | null;
  beforeItemId?: string | null;
}

interface RentalEquipmentListProps {
  items: RentalItem[];
  groups?: EquipmentGroup[];
  onQuantityChange?: (itemId: string, newQuantity: number) => void;
  onDiscountChange?: (itemId: string, newDiscount: number) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddItem?: (equipment: Equipment, quantity: number, groupId?: string | null) => void | Promise<void>;
  onAddExternalItem?: (payload: ExternalEquipmentInput, quantity: number, groupId?: string | null) => void | Promise<void>;
  /** Called with the group name (and optional color) when user confirms inline group creation */
  onAddGroup?: (name: string, color?: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onAutoGroup?: () => void | Promise<void>;
  onGroupColorChange?: (groupId: string, color: string) => void;
  onMoveGroup?: (payload: MoveGroupPayload) => void;
  onMoveItem?: (payload: MoveItemPayload) => void;
  onRemoveGroup?: (groupId: string) => void;
  readonly?: boolean;
  startDate?: string;
  endDate?: string;
  persisted?: boolean;
  /** @deprecated use onAddGroup with name param — kept for backward compat */
  enableGrouping?: boolean;
  /** @deprecated internal group selection now handled by component */
  selectedGroupId?: string | null;
  /** @deprecated internal group selection now handled by component */
  onSelectedGroupChange?: (groupId: string | null) => void;
  externalTabLabel?: string;
  skipAvailability?: boolean;
  coefficient?: number;
}

const GROUP_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
];

const RentalEquipmentList: React.FC<RentalEquipmentListProps> = ({
  items,
  groups = [],
  onQuantityChange,
  onDiscountChange,
  onRemoveItem,
  onAddItem,
  onAddExternalItem,
  onAddGroup,
  onRenameGroup,
  onAutoGroup,
  onGroupColorChange,
  onMoveGroup,
  onMoveItem,
  onRemoveGroup,
  readonly = false,
  startDate,
  endDate,
  persisted = false,
  externalTabLabel,
  skipAvailability = false,
  coefficient,
}) => {
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [modalGroupId, setModalGroupId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [nextReturn, setNextReturn] = useState<Record<string, string | null>>({});
  const [baselineReady, setBaselineReady] = useState(false);
  const baselineRef = useRef<Record<string, number> | null>(null);
  const [dragData, setDragData] = useState<{ type: 'group' | 'item'; id: string } | null>(null);
  const dragDataRef = useRef<{ type: 'group' | 'item'; id: string } | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  // Equipment tooltip (hover delay, name cell only)

  // Inline group rename
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const editingGroupInputRef = useRef<HTMLInputElement>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItemDef[] } | null>(null);
  const [subrentDetail, setSubrentDetail] = useState<RentalItem | null>(null);
  const { language } = useTranslation();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const dateLocale = language === 'fr' ? fr : enUS;

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale],
  );
  const formatCurrency = useCallback((value: number) => currencyFormatter.format(value), [currencyFormatter]);

  const isPackType = useCallback((value?: string | null) => {
    const normalized = (value || '').trim().toLowerCase();
    return normalized === 'pack' || normalized === 'kit';
  }, []);

  const clampDiscount = useCallback((value?: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, parsed));
  }, []);

  const appliedCoefficient = useMemo(() => {
    const parsed = Number(coefficient);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [coefficient]);

  const getItemTotal = useCallback(
    (item: RentalItem) => {
      const base = (Number(item.price_per_day) || 0) * (Number(item.quantity) || 0) * appliedCoefficient;
      const discount = clampDiscount(item.discount_percent);
      return base * (1 - discount / 100);
    },
    [appliedCoefficient, clampDiscount],
  );

  const existingEquipmentIds = useMemo(
    () => new Set(items.map((item) => item.equipment_id).filter((id): id is string => !!id)),
    [items],
  );

  const orderedGroups = useMemo(
    () => [...groups].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [groups],
  );

  const ungroupedItems = useMemo(
    () => items.filter((it) => !it.group_id).sort((a, b) => (a.position || 0) - (b.position || 0)),
    [items],
  );

  const itemsByGroup = useMemo(
    () =>
      orderedGroups.map((group) => ({
        group,
        items: items
          .filter((it) => it.group_id === group.id)
          .sort((a, b) => (a.position || 0) - (b.position || 0)),
      })),
    [items, orderedGroups],
  );

  const grandTotal = useMemo(() => items.reduce((sum, item) => sum + getItemTotal(item), 0), [items, getItemTotal]);

  // Baseline for persisted mode
  useEffect(() => {
    if (persisted && !baselineRef.current) {
      const base: Record<string, number> = {};
      items.forEach((i) => {
        if (!i.equipment_id) return;
        base[i.equipment_id] = (base[i.equipment_id] || 0) + i.quantity;
      });
      baselineRef.current = base;
      setBaselineReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted, items.length]);

  // Availability
  useEffect(() => {
    const load = async () => {
      try {
        if (skipAvailability) { setAvailability({}); setNextReturn({}); return; }
        if (!startDate || !endDate || items.length === 0) return;
        const ids = items.map((i) => i.equipment_id).filter((id): id is string => !!id);
        if (ids.length === 0) { setAvailability({}); setNextReturn({}); return; }
        const { data, error } = await supabase.rpc('get_units_availability_for_equipment', {
          p_ids: ids, p_start: startDate, p_end: endDate,
        });
        if (error) throw error;
        const map: Record<string, number> = {};
        ((data || []) as any[]).forEach((row: any) => { map[row.equipment_id] = row.available; });
        setAvailability(map);
        const { data: nr, error: nrErr } = await supabase.rpc('get_next_return_for_equipment', {
          p_ids: ids, p_start: startDate,
        });
        if (nrErr) throw nrErr;
        const nrMap: Record<string, string | null> = {};
        ((nr || []) as any[]).forEach((row: any) => { nrMap[row.equipment_id] = row.next_return; });
        setNextReturn(nrMap);
      } catch (e) {
        console.warn('availability load failed', e);
        setAvailability({});
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, items.map((i) => `${i.equipment_id}:${i.group_id || 'null'}`).join('|'), skipAvailability]);

  const getMaxAddFor = (equipmentId: string | null) => {
    if (skipAvailability || !equipmentId) return undefined;
    const avail = availability[equipmentId];
    if (typeof avail !== 'number') return undefined;
    const selectedTotal = items.filter((i) => i.equipment_id === equipmentId).reduce((s, i) => s + i.quantity, 0);
    if (persisted) {
      const baseline = baselineRef.current?.[equipmentId] || 0;
      if (!baselineReady && baselineRef.current) return undefined;
      const delta = Math.max(0, selectedTotal - baseline);
      return Math.max(0, avail - delta);
    }
    return Math.max(0, avail - selectedTotal);
  };

  // Focus new group input when shown
  useEffect(() => {
    if (isAddingGroup) newGroupInputRef.current?.focus();
  }, [isAddingGroup]);

  // Focus rename input when shown
  useEffect(() => {
    if (editingGroupId) editingGroupInputRef.current?.focus();
  }, [editingGroupId]);

  const confirmRenameGroup = () => {
    const name = editingGroupName.trim();
    if (name && editingGroupId) onRenameGroup?.(editingGroupId, name);
    setEditingGroupId(null);
  };

  // ── Context menu builders ──────────────────────────────────────────────────

  const openContextMenu = (e: React.MouseEvent, items: ContextMenuItemDef[]) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const buildCopyItem = (): ContextMenuItemDef | null => {
    const sel = window.getSelection()?.toString().trim();
    if (!sel) return null;
    return { label: 'Copier', icon: <Copy className="h-4 w-4" />, action: () => navigator.clipboard.writeText(sel) };
  };

  const handleGroupContextMenu = (group: EquipmentGroup) => (e: React.MouseEvent) => {
    if (readonly) return;
    const items: ContextMenuItemDef[] = [];
    const copy = buildCopyItem();
    if (copy) { items.push(copy); items.push({ type: 'separator' }); }
    if (onRenameGroup) {
      items.push({ label: 'Renommer', icon: <Pencil className="h-4 w-4" />, action: () => { setEditingGroupId(group.id); setEditingGroupName(group.name); } });
    }
    if (onGroupColorChange) {
      items.push({ type: 'colors', label: 'Couleur', colors: GROUP_COLORS, current: group.color, onSelect: (c) => onGroupColorChange(group.id, c) });
    }
    if (onRemoveGroup) {
      items.push({ type: 'separator' });
      items.push({ label: 'Supprimer le groupe', icon: <Trash2 className="h-4 w-4" />, danger: true, action: () => onRemoveGroup(group.id) });
    }
    if (items.length === 0) return;
    openContextMenu(e, items);
  };

  const handleItemContextMenu = (item: RentalItem) => (e: React.MouseEvent) => {
    if (readonly) return;
    const menuItems: ContextMenuItemDef[] = [];
    const copy = buildCopyItem();
    if (copy) { menuItems.push(copy); menuItems.push({ type: 'separator' }); }
    if (onRemoveItem) {
      menuItems.push({ label: 'Supprimer l\'élément', icon: <Trash2 className="h-4 w-4" />, danger: true, action: () => onRemoveItem(item.id) });
    }
    if (menuItems.length === 0) return;
    openContextMenu(e, menuItems);
  };

  const handleGenericContextMenu = (e: React.MouseEvent) => {
    const items: ContextMenuItemDef[] = [];
    const copy = buildCopyItem();
    if (copy) items.push(copy);
    if (items.length === 0) return;
    openContextMenu(e, items);
  };

  const handleConfirmNewGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    onAddGroup?.(name, newGroupColor);
    setNewGroupName('');
    setNewGroupColor(GROUP_COLORS[0]);
    setIsAddingGroup(false);
  };

  const openModalForGroup = (groupId: string | null) => {
    setModalGroupId(groupId);
    setShowEquipmentModal(true);
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const CATALOG_DRAG_TYPE = 'catalog/equipment';

  /** Try to extract a catalog Equipment from a drag event. Returns null if not a catalog drag. */
  const parseCatalogDrop = useCallback((event: React.DragEvent): Equipment | null => {
    try {
      const raw = event.dataTransfer.getData(CATALOG_DRAG_TYPE);
      if (!raw) return null;
      return JSON.parse(raw) as Equipment;
    } catch {
      return null;
    }
  }, []);

  const [catalogDragOver, setCatalogDragOver] = useState<string | 'ungrouped' | null>(null);

  const handleDragStart = (payload: { type: 'group' | 'item'; id: string }) => (event: React.DragEvent) => {
    if (readonly) return;
    setDragData(payload);
    dragDataRef.current = payload;
    event.dataTransfer.effectAllowed = 'move';
    if (payload.type === 'item') {
      event.dataTransfer.setData('rental/item', payload.id);
    } else if (payload.type === 'group') {
      event.dataTransfer.setData('rental/group', payload.id);
    }
  };

  const handleDragEnd = () => {
    setDragData(null);
    dragDataRef.current = null;
    setDropTargetItemId(null);
    setDropTargetGroupId(null);
  };

  const isCatalogDrag = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(CATALOG_DRAG_TYPE) ||
    event.dataTransfer.types.includes('catalog/equipment');

  const isInternalDrag = (event: React.DragEvent) =>
    event.dataTransfer.types.includes('rental/item');

  const allowDrop = (event: React.DragEvent) => {
    if (readonly) return;
    if (!dragDataRef.current && !isCatalogDrag(event) && !isInternalDrag(event)) return;
    event.preventDefault();
  };

  const dropOnGroupHeader = (groupId: string) => (event: React.DragEvent) => {
    if (readonly) return;
    event.preventDefault();
    setCatalogDragOver(null);
    setDropTargetGroupId(null);
    const catalogEq = parseCatalogDrop(event);
    if (catalogEq) {
      onAddItem?.(catalogEq, 1, groupId);
      return;
    }
    const current = dragDataRef.current;
    if (!current) return;
    if (current.type === 'group') {
      if (current.id !== groupId) onMoveGroup?.({ groupId: current.id, beforeGroupId: groupId });
    } else {
      onMoveItem?.({ itemId: current.id, targetGroupId: groupId, beforeItemId: null });
    }
    handleDragEnd();
  };

  const dropOnItem = (targetItem: RentalItem) => (event: React.DragEvent) => {
    if (readonly) return;
    event.preventDefault();
    setCatalogDragOver(null);
    setDropTargetItemId(null);
    const catalogEq = parseCatalogDrop(event);
    if (catalogEq) {
      onAddItem?.(catalogEq, 1, targetItem.group_id || null);
      return;
    }
    const current = dragDataRef.current;
    if (!current) return;
    if (current.type === 'item' && current.id !== targetItem.id) {
      onMoveItem?.({ itemId: current.id, targetGroupId: targetItem.group_id || null, beforeItemId: targetItem.id });
    }
    handleDragEnd();
  };

  const dropIntoUngrouped = (event: React.DragEvent) => {
    if (readonly) return;
    event.preventDefault();
    setCatalogDragOver(null);
    const catalogEq = parseCatalogDrop(event);
    if (catalogEq) {
      onAddItem?.(catalogEq, 1, null);
      return;
    }
    const current = dragDataRef.current;
    if (!current) return;
    if (current.type === 'item') onMoveItem?.({ itemId: current.id, targetGroupId: null, beforeItemId: null });
    handleDragEnd();
  };

  const dropAfterGroups = (event: React.DragEvent) => {
    if (!dragDataRef.current || readonly) return;
    event.preventDefault();
    if (dragDataRef.current.type === 'group') onMoveGroup?.({ groupId: dragDataRef.current.id, beforeGroupId: null });
    handleDragEnd();
  };

  // ── Quantity change with availability check ────────────────────────────────

  const handleIncrementQuantity = (item: RentalItem) => {
    if (isPackType(item.equipment_type)) { onQuantityChange?.(item.id, item.quantity + 1); return; }
    const maxAdd = getMaxAddFor(item.equipment_id);
    if (typeof maxAdd === 'number' && maxAdd <= 0) {
      const nr = item.equipment_id ? nextReturn[item.equipment_id] : null;
      if (nr) {
        toast.error(`${item.equipment_name} — retour prévu le ${format(new Date(nr), 'Pp', { locale: dateLocale })}`);
      } else {
        toast.error(`${item.equipment_name} — stock insuffisant`);
      }
      return;
    }
    onQuantityChange?.(item.id, item.quantity + 1);
  };

  // ── Column count helpers ───────────────────────────────────────────────────

  const colCount = readonly ? 5 : 6;
  // columns: name | qty | type | discount | total | [actions]

  // ── Render item row ────────────────────────────────────────────────────────

  const renderItemRow = (item: RentalItem, inGroup: boolean) => {
    const isDragging = dragData?.type === 'item' && dragData.id === item.id;
    return (
      <tr
        key={item.id}
        className={`group/row border-b border-gray-100 dark:border-gray-700 transition-colors
          ${isDragging ? 'opacity-30' : 'hover:bg-blue-50/20 dark:hover:bg-blue-900/10'}
          ${dropTargetItemId === item.id ? 'border-t-2 border-t-blue-400' : ''}`}
        draggable={!readonly}
        onDoubleClick={() => {
          if (item.is_external) setSubrentDetail(item);
          else if (item.equipment_id) navigate(`/equipment/${item.equipment_id}`);
        }}
        onDragStart={handleDragStart({ type: 'item', id: item.id })}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          allowDrop(e);
          if (dragDataRef.current?.type === 'item' && dragDataRef.current.id !== item.id) {
            setDropTargetItemId(item.id);
          }
        }}
        onDragLeave={() => setDropTargetItemId(null)}
        onDrop={dropOnItem(item)}
        onContextMenu={handleItemContextMenu(item)}
      >
        {/* Name */}
        <td className={`py-1 pr-3 ${inGroup ? 'pl-8' : 'pl-4'}`}>
          <div className="flex items-center gap-1.5">
            {!readonly && (
              <GripVertical className="h-3 w-3 flex-shrink-0 cursor-grab text-gray-200 group-hover/row:text-gray-400 transition-colors" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
                {item.equipment_name}
                {item.is_external && (
                  <span className="ml-1 text-[10px] italic font-normal text-gray-400 dark:text-gray-500"> (sous-location)</span>
                )}
              </div>
              {item.is_external && item.external_supplier && (
                <div className="text-[10px] text-gray-400 truncate leading-tight">{item.external_supplier}</div>
              )}
            </div>
          </div>
        </td>

        {/* Quantity */}
        <td className="px-2 py-1">
          {readonly ? (
            <span className="text-xs text-gray-700 dark:text-gray-300 tabular-nums">{item.quantity}</span>
          ) : (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onQuantityChange?.(item.id, Math.max(1, item.quantity - 1))}
                className="h-4 w-4 flex items-center justify-center rounded border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold leading-none"
              >
                –
              </button>
              <span className="w-6 text-center text-xs font-medium tabular-nums text-gray-800 dark:text-gray-200">
                {item.quantity}
              </span>
              <button
                onClick={() => handleIncrementQuantity(item)}
                className="h-4 w-4 flex items-center justify-center rounded border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold leading-none"
              >
                +
              </button>
            </div>
          )}
        </td>

        {/* Type */}
        <td className="hidden sm:table-cell px-2 py-1">
          <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[120px] block leading-tight">
            {item.equipment_type}
          </span>
        </td>

        {/* Discount */}
        <td className="px-2 py-1">
          {readonly || !onDiscountChange ? (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
              {clampDiscount(item.discount_percent) ? `${clampDiscount(item.discount_percent)}%` : '—'}
            </span>
          ) : (
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={clampDiscount(item.discount_percent)}
                onChange={(e) => onDiscountChange(item.id, Number(e.target.value))}
                className="w-9 text-right text-xs bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:outline-none tabular-nums text-gray-700 dark:text-gray-300"
              />
              <span className="text-[11px] text-gray-400">%</span>
            </div>
          )}
        </td>

        {/* Total */}
        <td className="px-3 py-1 text-right">
          <span className="text-xs font-medium text-gray-900 dark:text-gray-100 tabular-nums">
            {formatCurrency(getItemTotal(item))}
          </span>
        </td>

        {/* Actions */}
        {!readonly && (
          <td className="pl-1 pr-2 py-1 text-right">
            <button
              onClick={() => onRemoveItem?.(item.id)}
              className="p-0.5 text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover/row:opacity-100"
              title="Retirer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </td>
        )}
      </tr>
    );
  };

  // ── Render group header row ────────────────────────────────────────────────

  const renderGroupHeader = (group: EquipmentGroup, groupItems: RentalItem[]) => {
    const isCollapsed = collapsedGroups.has(group.id);
    const groupTotal = groupItems.reduce((sum, it) => sum + getItemTotal(it), 0);
    const accent = group.color || '#6B7280';
    const isDragging = dragData?.type === 'group' && dragData.id === group.id;
    const isCatalogOver = catalogDragOver === group.id;

    return (
      <tr
        key={`gh-${group.id}`}
        className={`border-y border-gray-200 dark:border-gray-700 cursor-pointer select-none transition-colors
          ${isDragging ? 'opacity-40' : ''}
          ${isCatalogOver
            ? 'bg-blue-100/60 dark:bg-blue-900/30 outline outline-2 outline-blue-400 outline-offset-[-2px]'
            : dropTargetGroupId === group.id
            ? 'bg-blue-50/60 dark:bg-blue-900/20 outline outline-2 outline-blue-300 outline-offset-[-2px]'
            : 'bg-gray-50/70 dark:bg-gray-800/50 hover:bg-gray-100/60 dark:hover:bg-gray-800'
          }`}
        draggable={!readonly && editingGroupId !== group.id}
        onDragStart={handleDragStart({ type: 'group', id: group.id })}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          allowDrop(e);
          if (isCatalogDrag(e)) setCatalogDragOver(group.id);
          else if (dragDataRef.current?.type === 'item') setDropTargetGroupId(group.id);
        }}
        onDragLeave={() => { setCatalogDragOver(null); setDropTargetGroupId(null); }}
        onDrop={dropOnGroupHeader(group.id)}
        onClick={() => editingGroupId !== group.id && toggleGroup(group.id)}
        onContextMenu={handleGroupContextMenu(group)}
      >
        {/* Name cell — spans name + qty + type columns */}
        <td colSpan={3} className="pl-3 pr-2 py-1">
          <div className="flex items-center gap-1.5">
            {!readonly && (
              <div onClick={(e) => e.stopPropagation()}>
                <GripVertical className="h-3 w-3 text-gray-300 group-hover/row:text-gray-400 cursor-grab flex-shrink-0 transition-colors" />
              </div>
            )}
            <div className="flex items-center gap-0.5 text-gray-500 dark:text-gray-400">
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </div>
            {!readonly && onGroupColorChange ? (
              <label
                className="flex-shrink-0 h-3 w-3 rounded-sm cursor-pointer border border-white/50 shadow-sm"
                style={{ backgroundColor: accent }}
                title="Changer la couleur"
                onClick={(e) => e.stopPropagation()}
              >
                <input type="color" value={accent} className="sr-only" onChange={(e) => onGroupColorChange(group.id, e.target.value)} />
              </label>
            ) : (
              <div className="flex-shrink-0 h-3 w-3 rounded-sm" style={{ backgroundColor: accent }} />
            )}
            {editingGroupId === group.id ? (
              <form
                onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); confirmRenameGroup(); }}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1"
              >
                <input
                  ref={editingGroupInputRef}
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(e.target.value)}
                  onBlur={confirmRenameGroup}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingGroupId(null); }}
                  className="text-xs font-semibold bg-white dark:bg-gray-800 border border-blue-400 rounded px-1.5 py-0.5 outline-none text-gray-800 dark:text-gray-100 min-w-0 w-32"
                />
                <button type="submit" className="p-0.5 text-green-600 hover:text-green-700"><Check className="h-3 w-3" /></button>
                <button type="button" onClick={() => setEditingGroupId(null)} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
              </form>
            ) : (
              <>
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{group.name}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">({groupItems.length})</span>
              </>
            )}
          </div>
        </td>

        {/* Discount column — empty */}
        <td className="px-2 py-1" />

        {/* Total */}
        <td className="px-3 py-1 text-right">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
            {formatCurrency(groupTotal)}
          </span>
        </td>

        {/* Actions */}
        {!readonly && (
          <td className="pl-1 pr-2 py-1 text-right">
            <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
              {(onAddItem || onAddExternalItem) && (
                <button
                  onClick={() => openModalForGroup(group.id)}
                  className="p-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title="Ajouter une sous-location dans ce groupe"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
              {onRemoveGroup && (
                <button
                  onClick={() => { if (window.confirm(`Supprimer le groupe "${group.name}" ?`)) onRemoveGroup(group.id); }}
                  className="p-0.5 text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Supprimer le groupe"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────

  const hasItems = items.length > 0;
  const hasGroups = orderedGroups.length > 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full select-none">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Matériel</span>
          {hasItems && (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500 rounded-full px-2 py-0.5 tabular-nums">
              {items.length}
            </span>
          )}
        </div>

        {!readonly && (
          <div className="flex items-center gap-2">
            {onAutoGroup && items.length > 0 && (
              <button
                onClick={() => onAutoGroup()}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                title="Créer automatiquement des groupes par catégorie"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Auto-grouper
              </button>
            )}
            {onAddGroup && (
              <button
                onClick={() => setIsAddingGroup(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Groupe
              </button>
            )}
            {(onAddItem || onAddExternalItem) && (
              <button
                onClick={() => openModalForGroup(null)}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                Sous-location
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table header (fixed) ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr>
              <th className="pl-4 pr-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Nom
              </th>
              <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 w-20">
                Qté
              </th>
              <th className="hidden sm:table-cell px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 w-32">
                Type
              </th>
              <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 w-16">
                Remise
              </th>
              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 w-28">
                Prix total
              </th>
              {!readonly && <th className="w-10" />}
            </tr>
          </thead>
        </table>
      </div>

      {/* ── Scrollable tbody ─────────────────────────────────────────────────── */}
      <div
        className="overflow-auto flex-1 min-h-0"
        onContextMenu={handleGenericContextMenu}
        onDragOver={(e) => {
          if (hasGroups) {
            // Only allow catalog drops on the outer container (adds ungrouped)
            if (isCatalogDrag(e)) { allowDrop(e); setCatalogDragOver('ungrouped'); }
          } else {
            allowDrop(e);
            if (isCatalogDrag(e)) setCatalogDragOver('ungrouped');
          }
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the container entirely
          const related = e.relatedTarget as Node | null;
          if (!e.currentTarget.contains(related)) setCatalogDragOver(null);
        }}
        onDrop={(e) => {
          if (isCatalogDrag(e)) { dropIntoUngrouped(e); return; }
          if (!hasGroups) dropIntoUngrouped(e);
        }}
      >
        <table className="w-full min-w-[520px]">
          <tbody>
            {/* Empty state */}
            {!hasItems && !hasGroups && !isAddingGroup && (
              <tr>
                <td colSpan={colCount} className={`px-4 py-10 text-center transition-colors ${catalogDragOver === 'ungrouped' ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                    <Package className={`h-8 w-8 transition-opacity ${catalogDragOver === 'ungrouped' ? 'opacity-60 text-blue-400' : 'opacity-30'}`} />
                    <span className="text-sm">
                      {catalogDragOver === 'ungrouped' ? 'Déposer pour ajouter' : 'Aucun matériel sur ce projet'}
                    </span>
                    {!readonly && !catalogDragOver && (onAddItem || onAddExternalItem) && (
                      <button
                        onClick={() => openModalForGroup(null)}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Ajouter du matériel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {/* Ungrouped items */}
            {ungroupedItems.map((item) => renderItemRow(item, false))}

            {/* Groups */}
            {itemsByGroup.map(({ group, items: groupItems }) => {
              const isCollapsed = collapsedGroups.has(group.id);
              return (
                <React.Fragment key={group.id}>
                  {renderGroupHeader(group, groupItems)}
                  {!isCollapsed && groupItems.map((item) => renderItemRow(item, true))}
                  {!isCollapsed && groupItems.length === 0 && !readonly && (
                    <tr
                      className={`border-b border-dashed border-gray-100 dark:border-gray-800 transition-colors ${catalogDragOver === `empty-${group.id}` ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''}`}
                      onDragOver={(e) => { allowDrop(e); if (isCatalogDrag(e)) setCatalogDragOver(`empty-${group.id}`); }}
                      onDragLeave={() => setCatalogDragOver(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setCatalogDragOver(null);
                        const catalogEq = parseCatalogDrop(e);
                        if (catalogEq) { onAddItem?.(catalogEq, 1, group.id); return; }
                        if (!dragData || dragData.type !== 'item') return;
                        onMoveItem?.({ itemId: dragData.id, targetGroupId: group.id, beforeItemId: null });
                        setDragData(null);
                      }}
                    >
                      <td colSpan={colCount} className="pl-9 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                        Glissez du matériel ici ou cliquez <Plus className="h-3 w-3 inline" /> pour ajouter
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Drop zone after all groups — catalog drop adds ungrouped, internal drag reorders */}
            {hasGroups && !readonly && (
              <tr
                onDragOver={(e) => {
                  if (isCatalogDrag(e)) { allowDrop(e); setCatalogDragOver('ungrouped-bottom'); return; }
                  allowDrop(e);
                }}
                onDragLeave={() => setCatalogDragOver(null)}
                onDrop={(e) => {
                  setCatalogDragOver(null);
                  if (isCatalogDrag(e)) { dropIntoUngrouped(e); return; }
                  dropAfterGroups(e);
                }}
              >
                <td
                  colSpan={colCount}
                  className={`py-3 pl-4 text-[11px] italic select-none transition-colors ${
                    catalogDragOver === 'ungrouped-bottom'
                      ? 'text-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                      : 'text-gray-300 dark:text-gray-600'
                  }`}
                >
                  {catalogDragOver === 'ungrouped-bottom' ? 'Déposer pour ajouter sans groupe' : 'Déposer ici pour ajouter sans groupe'}
                </td>
              </tr>
            )}

            {/* Inline new group row */}
            {!readonly && isAddingGroup && (
              <tr className="border-t border-gray-200 dark:border-gray-700 bg-blue-50/40 dark:bg-blue-900/10">
                <td colSpan={colCount} className="px-4 py-2">
                  <form onSubmit={handleConfirmNewGroup} className="flex items-center gap-2.5">
                    <label className="flex-shrink-0 cursor-pointer" title="Couleur du groupe">
                      <div className="h-5 w-5 rounded border border-white shadow-sm" style={{ backgroundColor: newGroupColor }} />
                      <input type="color" value={newGroupColor} onChange={(e) => setNewGroupColor(e.target.value)} className="sr-only" />
                    </label>
                    <div className="flex gap-1">
                      {GROUP_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setNewGroupColor(c)}
                          className={`h-4 w-4 rounded-sm border-2 transition-transform hover:scale-110 ${newGroupColor === c ? 'border-gray-900 dark:border-gray-100' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <input
                      ref={newGroupInputRef}
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Nom du groupe…"
                      className="flex-1 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500"
                      autoComplete="off"
                    />
                    <button type="submit" disabled={!newGroupName.trim()} className="p-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                      <Check className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => { setIsAddingGroup(false); setNewGroupName(''); }} className="p-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </form>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Grand total (fixed at bottom) ────────────────────────────────────── */}
      {hasItems && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/50">
          <table className="w-full min-w-[520px]">
            <tfoot>
              <tr>
                <td className="pl-4 pr-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Total matériel
                </td>
                <td className="w-20" />
                <td className="hidden sm:table-cell w-32" />
                <td className="w-16" />
                <td className="px-3 py-2 text-right w-28">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatCurrency(grandTotal)}
                  </span>
                </td>
                {!readonly && <td className="w-10" />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Equipment selection modal */}
      {showEquipmentModal && (onAddItem || onAddExternalItem) && (
        <EquipmentSelectionModal
          isOpen={showEquipmentModal}
          onClose={() => { setShowEquipmentModal(false); setModalGroupId(null); }}
          onSelect={async (equipment, quantity) => {
            try {
              await onAddItem?.(equipment, quantity, modalGroupId);
              setShowEquipmentModal(false);
              setModalGroupId(null);
            } catch (err) {
              console.error('onAddItem error', err);
            }
          }}
          onSelectExternal={
            onAddExternalItem
              ? async (payload, quantity) => {
                  try {
                    await onAddExternalItem(payload, quantity, modalGroupId);
                    setShowEquipmentModal(false);
                    setModalGroupId(null);
                  } catch (err) {
                    console.error('onAddExternalItem error', err);
                  }
                }
              : undefined
          }
          externalTabLabel={externalTabLabel}
          skipAvailability={skipAvailability}
          existingEquipment={existingEquipmentIds}
          startDate={startDate}
          endDate={endDate}
          alreadySelected={items
            .filter((it) => !!it.equipment_id)
            .map((it) => ({ equipment_id: it.equipment_id as string, quantity: it.quantity }))}
        />
      )}

      {/* Subrent detail popup */}
      {subrentDetail && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSubrentDetail(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4 p-5">
            <button
              onClick={() => setSubrentDetail(null)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pr-6 leading-snug">
                {subrentDetail.equipment_name}
              </h3>
              <p className="text-[11px] italic text-gray-400 dark:text-gray-500 mt-0.5">Sous-location</p>
            </div>
            <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
              <div className="flex justify-between gap-4">
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">Prestataire</span>
                <span className="font-medium text-right">{subrentDetail.external_supplier || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">Quantité</span>
                <span className="font-medium">{subrentDetail.quantity}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">Prix / jour</span>
                <span className="font-medium tabular-nums">{subrentDetail.price_per_day.toFixed(2)} €</span>
              </div>
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <p className="text-gray-400 dark:text-gray-500 mb-1">Description</p>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{subrentDetail.external_description || '—'}</p>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default RentalEquipmentList;
