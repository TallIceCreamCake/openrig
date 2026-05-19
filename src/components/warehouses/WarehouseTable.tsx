import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Warehouse } from '../../types/warehouse';
import EmptyTableRow from '../common/EmptyTableRow';
import Button from '../ui/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronDown, MapPin, Package } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTranslation } from '../../context/TranslationContext';

type SortKey = 'name' | 'address' | 'stock';

interface WarehouseTableProps {
  warehouses: Warehouse[];
  stockCounts: Record<string, number>;
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
}

const WarehouseTable: React.FC<WarehouseTableProps> = ({ warehouses, stockCounts, onBulkDelete }) => {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const navigate = useNavigate();

  const sorted = useMemo(() => {
    const data = [...warehouses];
    const dir = sortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'name':
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
          break;
        case 'address':
          av = (a.address || '').toLowerCase();
          bv = (b.address || '').toLowerCase();
          break;
        case 'stock':
          av = Number(stockCounts[a.id] || 0);
          bv = Number(stockCounts[b.id] || 0);
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
  }, [warehouses, stockCounts, sortKey, sortDir]);

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
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleAll = (checked: boolean) => {
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

  const formatItems = (count: number) =>
    count === 1
      ? t('warehouses.common.itemCount.one', { count })
      : t('warehouses.common.itemCount.other', { count });

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-700">
          {t('warehouses.table.title', { count: warehouses.length })}
        </p>
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSelection || bulkDeleting}
            onClick={() => hasSelection && !bulkDeleting && setMenuOpen((open) => !open)}
            className="px-3 py-2 text-sm"
          >
            {bulkDeleting && (
              <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {t('warehouses.table.actions')}
            <ChevronDown className="ml-2 h-4 w-4" />
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
                {t('warehouses.table.bulkDelete')}
              </button>
            </div>
          )}
        </div>
      </div>

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
            <TableHeaderCell className="w-14 px-4">{t('warehouses.table.columns.color')}</TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button
                type="button"
                onClick={() => toggleSort('name')}
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                title={t('warehouses.table.sortByName')}
              >
                {t('warehouses.table.columns.name')}
                <SortIcon active={sortKey === 'name'} />
              </button>
            </TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button
                type="button"
                onClick={() => toggleSort('address')}
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                title={t('warehouses.table.sortByAddress')}
              >
                {t('warehouses.table.columns.address')}
                <SortIcon active={sortKey === 'address'} />
              </button>
            </TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button
                type="button"
                onClick={() => toggleSort('stock')}
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                title={t('warehouses.table.sortByStock')}
              >
                {t('warehouses.table.columns.stock')}
                <SortIcon active={sortKey === 'stock'} />
              </button>
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {warehouses.length === 0 && (
            <EmptyTableRow colSpan={5} message={t('warehouses.table.empty')} />
          )}
          {sorted.map((warehouse) => {
            const isSelected = selectedIds.includes(warehouse.id);
            const totalStock = stockCounts[warehouse.id] || 0;
            const normalizedName = (warehouse.name || '').trim().toLowerCase();
            const isDefault = normalizedName === 'défaut' || normalizedName === 'default';
            const colorSwatch = isDefault ? '#cbd5f5' : (warehouse.color || '#c7d2fe');
            return (
              <TableRow
                key={warehouse.id}
                className={cn(
                  'transition-colors',
                  isSelected && 'bg-blue-50',
                  !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                )}
                onClick={() => {
                  if (hasSelection) return;
                  navigate(`/warehouses/${warehouse.id}`);
                }}
              >
                <TableCell className="px-4 py-2 align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRow(warehouse.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('warehouses.table.selectRow', {
                      name: warehouse.name || t('warehouses.common.unnamed'),
                    })}
                    disabled={bulkDeleting}
                  />
                </TableCell>
                <TableCell className="px-4 py-2">
                  <span
                    className="inline-block h-4 w-4 rounded-md border border-gray-300"
                    style={{ backgroundColor: colorSwatch }}
                    aria-hidden="true"
                  />
                </TableCell>
                <TableCell className="px-4 py-2 text-sm font-medium text-gray-900">{warehouse.name}</TableCell>
                <TableCell className="px-4 py-2">
                  <div className="text-sm text-gray-700 flex items-center">
                    <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                    {warehouse.address || t('warehouses.table.addressEmpty')}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2">
                  <div className="inline-flex items-center text-sm text-gray-900">
                    <Package className="h-4 w-4 mr-1 text-blue-500" />
                    {formatItems(totalStock)}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('warehouses.table.bulkDeleteTitle')}
        message={
          selectedIds.length > 1
            ? t('warehouses.table.bulkDeleteMessageMultiple', { count: selectedIds.length })
            : t('warehouses.table.bulkDeleteMessageSingle')
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        loading={bulkDeleting}
      />
    </div>
  );
};

export default WarehouseTable;
