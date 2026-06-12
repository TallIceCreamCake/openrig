import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronDown, FileText } from 'lucide-react';
import { ServiceCategory, ServiceRecord, ServiceStatus } from '../../types/service';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import Button from '../ui/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyTableRow from '../common/EmptyTableRow';
import { cn } from '../../utils/cn';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';
import { StatusBadge, type BadgeTone } from '../ui-kit';

type SortKey = 'name' | 'amount' | 'status';

type ServiceTableProps = {
  services: ServiceRecord[];
  category: ServiceCategory;
  onBulkDelete?: (ids: string[]) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  footer?: React.ReactNode;
};

const statusMeta: Record<ServiceStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Actif', tone: 'emerald' },
  pending: { label: 'En attente', tone: 'amber' },
  expired: { label: 'Expire', tone: 'slate' },
  cancelled: { label: 'Annule', tone: 'rose' },
};

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-FR');
};

const formatDateRange = (start: string | null, end: string | null) => {
  if (!start && !end) return '-';
  if (start && end) return `${formatDate(start)} -> ${formatDate(end)}`;
  if (start) return `Des ${formatDate(start)}`;
  return `Jusqu'au ${formatDate(end)}`;
};

const ServiceTable: React.FC<ServiceTableProps> = ({
  services,
  category,
  onBulkDelete,
  onDelete,
  footer,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextTarget, setContextTarget] = useState<ServiceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceRecord | null>(null);
  const [singleDeleting, setSingleDeleting] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { categories } = useEquipmentCategories();

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }),
    []
  );
  const categoryMap = useMemo(() => new Map(
    categories.map((cat) => [cat.id, cat.name])
  ), [categories]);
  const subcategoryMap = useMemo(() => new Map(
    categories.flatMap((cat) => cat.subcategories.map((sub) => [sub.id, sub.name]))
  ), [categories]);

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

  const amountValue = useCallback(
    (service: ServiceRecord) => {
      if (category === 'insurance') {
        return Number(service.amount_per_day ?? 0);
      }
      if (category === 'other') {
        return Number(service.price ?? 0);
      }
      return Number(service.cost_per_person ?? 0);
    },
    [category]
  );

  const sorted = useMemo(() => {
    const data = [...services];
    const dir = sortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (sortKey) {
        case 'name':
          av = (a.title || '').toLowerCase();
          bv = (b.title || '').toLowerCase();
          break;
        case 'amount':
          av = amountValue(a);
          bv = amountValue(b);
          break;
        case 'status':
          av = (a.status || '').toString().toLowerCase();
          bv = (b.status || '').toString().toLowerCase();
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
  }, [services, sortKey, sortDir, amountValue]);

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

  useEffect(() => {
    if (!hasSelection) {
      setMenuOpen(false);
    }
  }, [hasSelection]);

  const handleRowContextMenu = (event: React.MouseEvent<HTMLTableRowElement>, item: ServiceRecord) => {
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    if (bulkDeleting || typeof window === 'undefined') {
      return;
    }
    const viewportPadding = 12;
    const menuWidth = 188;
    const menuHeight = 96;
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

  const title = category === 'insurance'
    ? `Assurances (${services.length})`
    : category === 'other'
      ? `Autres services (${services.length})`
      : `Services personnel (${services.length})`;

  const emptyMessage = category === 'insurance'
    ? "Aucune assurance enregistree pour l'instant."
    : category === 'other'
      ? "Aucun autre service pour l'instant."
      : "Aucun service personnel pour l'instant.";

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSelection || bulkDeleting}
            onClick={() => hasSelection && !bulkDeleting && setMenuOpen((open) => !open)}
            className="px-3 py-2 text-sm"
          >
            {bulkDeleting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            Actions
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
                Supprimer
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
                  aria-label="Tout selectionner"
                  disabled={bulkDeleting}
                />
              </TableHeaderCell>
              <TableHeaderCell className="px-4">
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                  title="Trier par nom"
                >
                  Service
                  <SortIcon active={sortKey === 'name'} />
                </button>
              </TableHeaderCell>
              {category === 'insurance' ? (
                <>
                  <TableHeaderCell className="px-4">Assureur</TableHeaderCell>
                  <TableHeaderCell className="px-4">Couvertures</TableHeaderCell>
                  <TableHeaderCell className="px-4">Validite</TableHeaderCell>
                  <TableHeaderCell className="px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('amount')}
                      className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                      title="Trier par montant"
                    >
                      Montant/jour
                      <SortIcon active={sortKey === 'amount'} />
                    </button>
                  </TableHeaderCell>
                  <TableHeaderCell className="px-4">Justificatif</TableHeaderCell>
                  <TableHeaderCell className="px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                      title="Trier par statut"
                    >
                      Statut
                      <SortIcon active={sortKey === 'status'} />
                    </button>
                  </TableHeaderCell>
                </>
              ) : category === 'other' ? (
                <>
                  <TableHeaderCell className="px-4">Type</TableHeaderCell>
                  <TableHeaderCell className="px-4">Sous-type</TableHeaderCell>
                  <TableHeaderCell className="px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('amount')}
                      className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                      title="Trier par prix"
                    >
                      Prix
                      <SortIcon active={sortKey === 'amount'} />
                    </button>
                  </TableHeaderCell>
                  <TableHeaderCell className="px-4">Description</TableHeaderCell>
                </>
              ) : (
                <>
                  <TableHeaderCell className="px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('amount')}
                      className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                      title="Trier par cout"
                    >
                      Cout / personne
                      <SortIcon active={sortKey === 'amount'} />
                    </button>
                  </TableHeaderCell>
                  <TableHeaderCell className="px-4">Notes</TableHeaderCell>
                </>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {services.length === 0 && (
              <EmptyTableRow colSpan={category === 'insurance' ? 8 : (category === 'other' ? 6 : 4)} message={emptyMessage} />
            )}
            {sorted.map((item) => {
              const checked = selectedIds.includes(item.id);
              const statusInfo = statusMeta[item.status as ServiceStatus] || {
                label: item.status,
                className: 'bg-slate-100 text-slate-600 border border-slate-200',
              };
              const coverages = item.coverage || [];
              const typeLabel = item.category_id ? (categoryMap.get(item.category_id) || '-') : '-';
              const subtypeLabel = item.subcategory_id ? (subcategoryMap.get(item.subcategory_id) || '-') : '-';
              return (
                <TableRow
                  key={item.id}
                  className={cn(
                    'transition-colors',
                    checked && 'bg-blue-50/80',
                    !checked && hoveredId === item.id && 'bg-blue-50/40',
                    !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                  )}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onContextMenu={(event) => handleRowContextMenu(event, item)}
                  onClick={() => {
                    closeContextMenu();
                    if (hasSelection) return;
                    window.location.href = `/services/${item.id}`;
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
                      aria-label={`Selectionner ${item.title}`}
                      disabled={bulkDeleting}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <div className="text-sm font-medium text-gray-900">{item.title}</div>
                  </TableCell>
                  {category === 'insurance' ? (
                    <>
                      <TableCell className="px-4 py-2 text-sm text-gray-600">{item.provider || '-'}</TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-600 max-w-[240px] truncate" title={coverages.join(', ')}>
                        {coverages.length > 0 ? coverages.join(', ') : '-'}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-600">
                        {formatDateRange(item.start_date, item.end_date)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-900">
                        {item.amount_per_day == null ? '-' : currencyFormatter.format(item.amount_per_day)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-600">
                        {item.proof_file_url ? (
                          <a
                            href={item.proof_file_url}
                            download={item.proof_file_name || undefined}
                            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                          >
                            <FileText className="h-4 w-4" />
                            <span className="truncate max-w-[140px]">{item.proof_file_name || 'Justificatif'}</span>
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <StatusBadge tone={statusInfo.tone} variant="outline" className="font-semibold">
                          {statusInfo.label}
                        </StatusBadge>
                      </TableCell>
                    </>
                  ) : category === 'other' ? (
                    <>
                      <TableCell className="px-4 py-2 text-sm text-gray-600">{typeLabel}</TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-600">{subtypeLabel}</TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-900">
                        {item.price == null ? '-' : currencyFormatter.format(item.price)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-600 max-w-[320px] truncate" title={item.notes || ''}>
                        {item.notes || '-'}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="px-4 py-2 text-sm text-gray-900">
                        {item.cost_per_person == null ? '-' : currencyFormatter.format(item.cost_per_person)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-gray-600 max-w-[320px] truncate" title={item.notes || ''}>
                        {item.notes || '-'}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {contextMenu && contextTarget && (
        <div
          className="fixed z-[12040] w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          <button
            type="button"
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => {
              const target = contextTarget;
              closeContextMenu();
              if (!target) return;
              window.location.href = `/services/${target.id}`;
            }}
            role="menuitem"
          >
            Voir
          </button>
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
              Supprimer
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
        title="Supprimer des services"
        message={
          selectedIds.length > 1
            ? `Supprimer ${selectedIds.length} services ?`
            : 'Supprimer ce service ?'
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        loading={bulkDeleting}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Supprimer un service"
        message={deleteTarget?.title ? `Supprimer "${deleteTarget.title}" ?` : 'Supprimer ce service ?'}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        loading={singleDeleting}
      />
    </div>
  );
};

export default ServiceTable;
