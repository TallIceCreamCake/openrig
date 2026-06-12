import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Equipment } from '../../types/equipment';
import EmptyTableRow from '../common/EmptyTableRow';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/perm';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import Button from '../ui/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTranslation } from '../../context/TranslationContext';
import { formatEquipmentStatusLabelForItem } from '../../utils/equipmentStatus';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { isAutoEntrepreneurMode } from '../../utils/accountingMode';
import { StatusBadge, type BadgeTone } from '../ui-kit';

type SortKey = 'name' | 'price' | 'status';

interface EquipmentTableProps {
  equipment: Equipment[];
  onBulkDelete?: (ids: string[]) => void | Promise<void>;
  onHover?: (equipment: Equipment | null) => void;
  footer?: React.ReactNode;
  onDelete?: (id: string) => void | Promise<void>;
  onDuplicate?: (equipment: Equipment) => void | Promise<void>;
  title?: string;
  emptyMessage?: string;
  bulkDeleteTitle?: string;
  singleDeleteTitle?: string;
  singleDeleteMessageUnnamed?: string;
}

const EquipmentTable: React.FC<EquipmentTableProps> = ({
  equipment,
  onBulkDelete,
  onHover,
  footer,
  onDelete,
  onDuplicate,
  title,
  emptyMessage,
  bulkDeleteTitle,
  singleDeleteTitle,
  singleDeleteMessageUnnamed,
}) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale]
  );
  const inventoryLabels = useMemo<Record<Equipment['inventory_category'], string>>(
    () => ({
      series: t('equipment.common.inventoryCategory.series'),
      vrac: t('equipment.common.inventoryCategory.bulk'),
      consommable: t('equipment.common.inventoryCategory.consumable'),
    }),
    [t]
  );
  const statusMeta = useMemo<Record<Equipment['status'], { label: string; tone: BadgeTone }>>(
    () => ({
      available: {
        label: t('equipment.common.status.available'),
        tone: 'emerald',
      },
      in_use: {
        label: t('equipment.common.status.in_use'),
        tone: 'blue',
      },
      maintenance: {
        label: t('equipment.common.status.maintenance'),
        tone: 'amber',
      },
      broken: {
        label: t('equipment.common.status.broken'),
        tone: 'rose',
      },
    }),
    [t]
  );
  const maintenanceDetailedLabel = useMemo(
    () => t('equipment.common.status.maintenanceDetailed'),
    [t]
  );
  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(companySettings);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextTarget, setContextTarget] = useState<Equipment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null);
  const [singleDeleting, setSingleDeleting] = useState(false);
  const { user } = useAuth();
  const canViewDetail = hasPerm(user, 'eq_view_detail');

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setContextTarget(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleGlobalClick = () => closeContextMenu();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalClick, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalClick, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !onDelete) {
      setDeleteTarget(null);
      return;
    }
    setSingleDeleting(true);
    try {
      await onDelete(deleteTarget.id);
    } catch (error) {
      console.error(error);
    } finally {
      setSingleDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleRowContextMenu = (event: React.MouseEvent<HTMLTableRowElement>, item: Equipment) => {
    if (!onDelete && !onDuplicate && !canViewDetail) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    if (bulkDeleting) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const viewportPadding = 12;
    const menuWidth = 208;
    const menuHeight = 148;
    const computedX = Math.max(
      viewportPadding,
      Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding)
    );
    const computedY = Math.max(
      viewportPadding,
      Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding)
    );
    setContextTarget(item);
    setContextMenu({ x: computedX, y: computedY });
  };

  const sorted = useMemo(() => {
    const data = [...equipment];
    const dir = sortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case 'name':
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
          break;
        case 'status':
          av = (a.status || '').toString().toLowerCase();
          bv = (b.status || '').toString().toLowerCase();
          break;
        case 'price':
          av = Number(autoEntrepreneurMode ? (a.rental_price_ttc ?? 0) : (a.rental_price_ht ?? 0));
          bv = Number(autoEntrepreneurMode ? (b.rental_price_ttc ?? 0) : (b.rental_price_ht ?? 0));
          break;
        default:
          av = 0;
          bv = 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return data;
  }, [autoEntrepreneurMode, equipment, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ active }: { active: boolean }) => {
    if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-gray-500" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-gray-500" />
    );
  };

  const hasSelection = selectedIds.length > 0;

  const toggleRow = (id: string) => {
    closeContextMenu();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleAll = (checked: boolean) => {
    closeContextMenu();
    setSelectedIds(checked ? sorted.map((item) => item.id) : []);
  };

  const handleBulkDelete = async () => {
    if (!onBulkDelete) {
      setConfirmOpen(false);
      return;
    }
    setBulkDeleting(true);
    try {
      await onBulkDelete(selectedIds);
      setSelectedIds([]);
      setConfirmOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setBulkDeleting(false);
    }
  };

  useEffect(() => {
    if (!hasSelection) {
      setMenuOpen(false);
    }
  }, [hasSelection]);

  const handleHover = (item: Equipment | null) => {
    if (item) {
      setHoveredId(item.id);
      onHover?.(item);
    } else {
      setHoveredId(null);
      onHover?.(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-700">
          {title ?? t('equipment.list.table.title', { count: equipment.length })}
        </p>
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSelection || bulkDeleting}
            onClick={() => hasSelection && !bulkDeleting && setMenuOpen((open) => !open)}
            className="px-3 py-2 text-sm"
          >
            {bulkDeleting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {t('equipment.list.table.actions')}
            <ChevronDown className="h-4 w-4" />
          </Button>
          {menuOpen && hasSelection && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
              <button
                type="button"
                className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
              >
                {t('equipment.list.table.bulkDelete')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-12 px-4">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                  checked={hasSelection && selectedIds.length === sorted.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label={t('common.selectAll')}
                  disabled={bulkDeleting}
                />
              </TableHeaderCell>
              <TableHeaderCell className="px-4">
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                  title={t('equipment.list.table.sortByName')}
                >
                  {t('equipment.list.table.columns.name')}
                  <SortIcon active={sortKey === 'name'} />
                </button>
              </TableHeaderCell>
              <TableHeaderCell className="px-4">{t('equipment.list.table.columns.category')}</TableHeaderCell>
              <TableHeaderCell className="px-4">
                <button
                  type="button"
                  onClick={() => toggleSort('price')}
                  className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                  title={t('equipment.list.table.sortByPrice')}
                >
                  {t('equipment.list.table.columns.price')}
                  <SortIcon active={sortKey === 'price'} />
                </button>
              </TableHeaderCell>
              <TableHeaderCell className="px-4">
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                  title={t('equipment.list.table.sortByStatus')}
                >
                  {t('equipment.list.table.columns.status')}
                  <SortIcon active={sortKey === 'status'} />
                </button>
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody onMouseLeave={() => handleHover(null)}>
            {equipment.length === 0 && (
              <EmptyTableRow colSpan={5} message={emptyMessage ?? t('equipment.list.table.empty')} />
            )}
            {sorted.map((item) => {
              const checked = selectedIds.includes(item.id);
              const statusInfo = statusMeta[item.status];
              const statusLabel = formatEquipmentStatusLabelForItem(
                item,
                item.status === 'maintenance'
                  ? maintenanceDetailedLabel
                  : (statusInfo?.label ?? item.status),
              );
              return (
                <TableRow
                  key={item.id}
                  className={cn(
                    'transition-colors',
                    checked && 'bg-blue-50/80',
                    !checked && hoveredId === item.id && 'bg-blue-50/40',
                    canViewDetail && !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                  )}
                  onMouseEnter={() => handleHover(item)}
                  onContextMenu={(event) => handleRowContextMenu(event, item)}
                  onClick={() => {
                    closeContextMenu();
                    if (!canViewDetail || hasSelection) return;
                    window.location.href = `/equipment/${item.id}`;
                  }}
                >
                  <TableCell className="px-4 py-2 align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                      checked={selectedIds.includes(item.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleRow(item.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('equipment.list.table.selectRow', { name: item.name })}
                      disabled={bulkDeleting}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    {item.type && <div className="text-xs text-gray-500">{item.type}</div>}
                  </TableCell>
              <TableCell className="px-4 py-2 text-sm text-gray-600">
                {item.type === 'Pack' ? t('equipment.list.packLabel') : (inventoryLabels[item.inventory_category] || '—')}
              </TableCell>
                  <TableCell className="px-4 py-2">
                    <div className="text-sm text-gray-900">
                      {currencyFormatter.format(autoEntrepreneurMode ? (item.rental_price_ttc ?? 0) : (item.rental_price_ht ?? 0))}{' '}
                      {autoEntrepreneurMode ? t('equipment.common.price.ttcSuffix') : t('equipment.common.price.htSuffix')}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <StatusBadge tone={statusInfo?.tone || 'gray'} variant="outline" className="font-semibold">
                      {statusLabel}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {contextMenu && contextTarget && (
        <div
          className="fixed z-50 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          {canViewDetail && (
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                const target = contextTarget;
                closeContextMenu();
                if (!target) return;
                window.location.href = `/equipment/${target.id}`;
              }}
              role="menuitem"
            >
              {t('equipment.list.table.contextMenu.view')}
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={async () => {
                const target = contextTarget;
                closeContextMenu();
                if (!target) return;
                try {
                  await onDuplicate(target);
                } catch (error) {
                  console.error(error);
                }
              }}
              role="menuitem"
            >
              {t('equipment.list.table.contextMenu.duplicate')}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                const target = contextTarget;
                closeContextMenu();
                if (target) {
                  setDeleteTarget(target);
                }
              }}
              role="menuitem"
            >
              {t('equipment.list.table.contextMenu.delete')}
            </button>
          )}
        </div>
      )}

      {footer ? (
        <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          {footer}
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirmOpen}
        title={bulkDeleteTitle ?? t('equipment.list.table.bulkDeleteTitle')}
        message={
          selectedIds.length > 1
            ? t('equipment.list.table.bulkDeleteMessageMultiple', { count: selectedIds.length })
            : t('equipment.list.table.bulkDeleteMessageSingle')
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        loading={bulkDeleting}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={singleDeleteTitle ?? t('equipment.list.table.singleDeleteTitle')}
        message={
          deleteTarget?.name
            ? t('equipment.list.table.singleDeleteMessageNamed', { name: deleteTarget.name })
            : (singleDeleteMessageUnnamed ?? t('equipment.list.table.singleDeleteMessageUnnamed'))
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        loading={singleDeleting}
      />
    </div>
  );
};

export default EquipmentTable;
