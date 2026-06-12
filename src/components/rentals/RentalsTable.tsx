import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Euro, ChevronDown, ArrowDown, ArrowUp, ChevronsUpDown, FileCheck2, ShieldCheck, Package, Truck, RotateCcw, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { Rental } from '../../types/rental';
import Button from '../ui/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import { cn } from '../../utils/cn';
import { useTranslation } from '../../context/TranslationContext';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { computeRentalTotals } from '../../utils/rentalTotals';
import { StatusBadge, type BadgeTone } from '../ui-kit';

type SortKey = 'client' | 'period' | 'status' | 'total';

interface RentalsTableProps {
  rentals: Rental[];
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  onBulkArchive?: (ids: string[]) => Promise<void> | void;
  onBulkPurge?: (ids: string[]) => Promise<void> | void;
  onCheckPaidSelection?: (ids: string[]) => Promise<boolean> | boolean;
  onHover?: (rental: Rental | null) => void;
}

const statusTone = (status: string): BadgeTone => {
  switch (status) {
    case 'confirmed':
      return 'blue';
    case 'preparing':
      return 'amber';
    case 'in_progress':
      return 'indigo';
    case 'delivered':
      return 'sky';
    case 'return_delivery':
      return 'sky';
    case 'in_return':
      return 'purple';
    case 'returned':
      return 'emerald';
    case 'paid':
      return 'emerald';
    case 'completed':
      return 'emerald';
    case 'cancelled':
      return 'red';
    case 'archived':
      return 'slate';
    default:
      return 'amber';
  }
};


type StepState = 'done' | 'active' | 'upcoming' | 'cancelled';

const PROGRESS_STEPS = [
  { icon: FileCheck2,  tipDone: 'Créée',    tipActive: 'En cours',  tipUpcoming: 'À venir' },
  { icon: ShieldCheck, tipDone: 'Validée',  tipActive: 'En cours',  tipUpcoming: 'À venir' },
  { icon: Package,     tipDone: 'Préparée', tipActive: 'En cours',  tipUpcoming: 'À venir' },
  { icon: Truck,       tipDone: 'Livré',    tipActive: 'En cours',  tipUpcoming: 'À venir' },
  { icon: RotateCcw,   tipDone: 'Retourné', tipActive: 'En cours',  tipUpcoming: 'À venir' },
  { icon: Banknote,    tipDone: 'Payée',    tipActive: 'En cours',  tipUpcoming: 'Non payée' },
];

const getStepStates = (status: string): StepState[] => {
  switch (status) {
    case 'pending':         return ['done', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'];
    case 'confirmed':       return ['done', 'done',     'upcoming', 'upcoming', 'upcoming', 'upcoming'];
    case 'preparing':       return ['done', 'done',     'active',   'upcoming', 'upcoming', 'upcoming'];
    case 'in_progress':     return ['done', 'done',     'done',     'active',   'upcoming', 'upcoming'];
    case 'delivered':       return ['done', 'done',     'done',     'done',     'upcoming', 'upcoming'];
    case 'return_delivery': return ['done', 'done',     'done',     'done',     'active',   'upcoming'];
    case 'in_return':       return ['done', 'done',     'done',     'done',     'active',   'upcoming'];
    case 'returned':        return ['done', 'done',     'done',     'done',     'done',     'upcoming'];
    case 'completed':       return ['done', 'done',     'done',     'done',     'done',     'upcoming'];
    case 'paid':            return ['done', 'done',     'done',     'done',     'done',     'done'];
    case 'cancelled':       return ['cancelled', 'cancelled', 'cancelled', 'cancelled', 'cancelled', 'cancelled'];
    default:                return ['done', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'];
  }
};

const stepColor: Record<StepState, string> = {
  done:      'text-emerald-500',
  active:    'text-blue-500',
  upcoming:  'text-gray-200',
  cancelled: 'text-red-400',
};

const RentalsTable: React.FC<RentalsTableProps> = ({
  rentals,
  onBulkDelete,
  onBulkArchive,
  onBulkPurge,
  onCheckPaidSelection,
  onHover,
}) => {
  const { t, language } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>('period');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);
  const [deleteChoiceAction, setDeleteChoiceAction] = useState<'archive' | 'purge' | null>(null);
  const [checkingDeleteOptions, setCheckingDeleteOptions] = useState(false);
  const navigate = useNavigate();
  const { settings } = useCompanySettings();

  const dateLocale = language === 'fr' ? fr : enUS;
  const datePattern = language === 'fr' ? 'dd/MM/yyyy' : 'MM/dd/yyyy';
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
        style: 'currency',
        currency: 'EUR',
      }),
    [language]
  );

  const statusLabel = useMemo(
    () => ({
      pending: t('rentals.status.pending'),
      confirmed: t('rentals.status.confirmed'),
      preparing: t('rentals.status.preparing'),
      in_progress: t('rentals.status.in_progress'),
      delivered: t('rentals.status.delivered'),
      return_delivery: t('rentals.status.return_delivery'),
      in_return: t('rentals.status.in_return'),
      returned: t('rentals.status.returned'),
      paid: t('rentals.status.paid'),
      completed: t('rentals.status.completed'),
      cancelled: t('rentals.status.cancelled'),
      archived: t('rentals.status.archived'),
    }),
    [t]
  );

  const typeLabel = useMemo(
    () => ({
      rental: t('rentals.type.rental'),
      service: t('rentals.type.service'),
      sale: t('rentals.type.sale'),
    }),
    [t]
  );

  const totalsById = useMemo(() => {
    const map = new Map<string, number>();
    rentals.forEach((rental) => {
      const total = computeRentalTotals(rental, settings).total;
      map.set(rental.id, total);
    });
    return map;
  }, [rentals, settings]);

  const sorted = useMemo(() => {
    const data = [...rentals];
    const dir = sortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (sortKey) {
        case 'client':
          av = (a.client_name || '').toLowerCase();
          bv = (b.client_name || '').toLowerCase();
          break;
        case 'period':
          av = new Date(a.start_date).getTime();
          bv = new Date(b.start_date).getTime();
          break;
        case 'status':
          av = (a.status || '').toString();
          bv = (b.status || '').toString();
          break;
        case 'total':
          av = totalsById.get(a.id) ?? Number(a.total_price || 0);
          bv = totalsById.get(b.id) ?? Number(b.total_price || 0);
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
  }, [rentals, sortDir, sortKey, totalsById]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
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

  const handleDeleteSelection = async () => {
    if (!hasSelection || bulkDeleting || checkingDeleteOptions) return;
    setMenuOpen(false);
    if (!onCheckPaidSelection) {
      setConfirmOpen(true);
      return;
    }
    setCheckingDeleteOptions(true);
    try {
      const needsChoice = await onCheckPaidSelection(selectedIds);
      if (needsChoice) {
        setDeleteChoiceOpen(true);
      } else {
        setConfirmOpen(true);
      }
    } catch (error) {
      console.error(error);
      setConfirmOpen(true);
    } finally {
      setCheckingDeleteOptions(false);
    }
  };

  const handleBulkArchive = async () => {
    if (!onBulkArchive) {
      setDeleteChoiceOpen(false);
      return;
    }
    setDeleteChoiceAction('archive');
    try {
      await onBulkArchive(selectedIds);
      setSelectedIds([]);
      setDeleteChoiceOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setDeleteChoiceAction(null);
    }
  };

  const handleBulkPurge = async () => {
    if (!onBulkPurge) {
      setDeleteChoiceOpen(false);
      return;
    }
    setDeleteChoiceAction('purge');
    try {
      await onBulkPurge(selectedIds);
      setSelectedIds([]);
      setDeleteChoiceOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setDeleteChoiceAction(null);
    }
  };

  useEffect(() => {
    if (!hasSelection) {
      setMenuOpen(false);
      setConfirmOpen(false);
      setDeleteChoiceOpen(false);
    }
  }, [hasSelection]);

  const actionBusy = bulkDeleting || checkingDeleteOptions || deleteChoiceAction !== null;

  const handleHover = (rental: Rental | null) => {
    onHover?.(rental);
  };

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-700">{t('rentals.table.title', { count: rentals.length })}</p>
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSelection || actionBusy}
            onClick={() => hasSelection && !actionBusy && setMenuOpen((open) => !open)}
            className="px-3 py-2 text-sm"
          >
            {actionBusy && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {t('rentals.table.actions')}
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
          {menuOpen && hasSelection && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
              <button
                type="button"
                className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50"
                onClick={handleDeleteSelection}
              >
                {t('rentals.table.bulkDelete')}
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
            <TableHeaderCell className="w-14 px-4" />
            <TableHeaderCell className="px-4">Projet</TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button
                type="button"
                onClick={() => toggleSort('period')}
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
              >
                Date
                <SortIcon active={sortKey === 'period'} />
              </button>
            </TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button
                type="button"
                onClick={() => toggleSort('client')}
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
              >
                {t('rentals.table.columns.client')}
                <SortIcon active={sortKey === 'client'} />
              </button>
            </TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button
                type="button"
                onClick={() => toggleSort('status')}
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
              >
                {t('rentals.table.columns.status')}
                <SortIcon active={sortKey === 'status'} />
              </button>
            </TableHeaderCell>
            <TableHeaderCell className="px-4 text-right">
              <button
                type="button"
                onClick={() => toggleSort('total')}
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
              >
                {t('rentals.table.columns.total')}
                <SortIcon active={sortKey === 'total'} />
              </button>
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody onMouseLeave={() => handleHover(null)}>
          {rentals.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="px-4 py-6 text-sm text-gray-500 text-center">
                {t('rentals.table.empty')}
              </TableCell>
            </TableRow>
          )}
          {sorted.map((rental) => {
            const startStr = format(new Date(rental.start_date), datePattern, { locale: dateLocale });
            const reference = rental.reference_code || t('rentals.table.referenceFallback');
            const projectName = rental.title || reference;
            const label = statusLabel[rental.status as keyof typeof statusLabel] ?? rental.status;
            const total = totalsById.get(rental.id) ?? Number(rental.total_price || 0);
            const isSelected = selectedIds.includes(rental.id);
            return (
              <TableRow
                key={rental.id}
                className={cn(
                  'transition-colors',
                  isSelected && 'bg-blue-50',
                  !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                )}
                onMouseEnter={() => handleHover(rental)}
                onClick={() => {
                  if (hasSelection) return;
                  navigate(`/rentals/${rental.id}`);
                }}
              >
                <TableCell className="px-4 py-2 align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRow(rental.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('rentals.table.selectRow', { reference })}
                    disabled={bulkDeleting}
                  />
                </TableCell>
                <TableCell className="px-4 py-2">
                  <span
                    className="inline-block h-4 w-4 rounded-md border border-gray-200"
                    style={{ backgroundColor: rental.color || '#e2e8f0' }}
                    aria-hidden="true"
                  />
                </TableCell>
                <TableCell className="px-4 py-2">
                  <div className="text-sm font-medium text-gray-800">{projectName}</div>
                  <div className="text-xs text-gray-400 font-mono">{reference}</div>
                </TableCell>
                <TableCell className="px-4 py-2 text-sm text-gray-700">{startStr}</TableCell>
                <TableCell className="px-4 py-2 text-sm text-gray-700">{rental.client_name || t('rentals.table.clientFallback')}</TableCell>
                <TableCell className="px-4 py-2">
                  <StatusBadge tone={statusTone(rental.status)}>
                    {label}
                  </StatusBadge>
                  <div className="flex items-center gap-1 mt-1.5">
                    {getStepStates(rental.status).map((state, i) => {
                      const Icon = PROGRESS_STEPS[i].icon;
                      const tip = state === 'done' ? PROGRESS_STEPS[i].tipDone : state === 'active' ? PROGRESS_STEPS[i].tipActive : PROGRESS_STEPS[i].tipUpcoming;
                      return <Icon key={i} className={`h-4 w-4 ${stepColor[state]}`} title={tip} />;
                    })}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2 text-right text-sm text-gray-900">
                  {currencyFormatter.format(total)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('rentals.table.bulkDeleteTitle')}
        message={
          selectedIds.length > 1
            ? t('rentals.table.bulkDeleteMessageMultiple', { count: selectedIds.length })
            : t('rentals.table.bulkDeleteMessageSingle')
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        loading={bulkDeleting}
      />

      {deleteChoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={deleteChoiceAction ? undefined : () => setDeleteChoiceOpen(false)}
          />
          <div className="relative w-full max-w-md mx-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">Supprimer le projet</h3>
            <p className="mt-2 text-sm text-gray-600">
              Au moins un projet sélectionné est déjà payé ou partiellement payé. Choisissez l&apos;action souhaitée.
            </p>
            <div className="mt-3 space-y-1 text-xs text-gray-500">
              <p>
                <span className="font-medium text-gray-700">Supprimer toute trace</span> : supprime le projet, les paiements, les documents et l&apos;historique lié.
              </p>
              <p>
                <span className="font-medium text-gray-700">Supprimer visuellement</span> : archive le projet et le masque de la liste.
              </p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteChoiceOpen(false)}
                disabled={deleteChoiceAction !== null}
                className={`px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 ${deleteChoiceAction ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleBulkArchive}
                disabled={deleteChoiceAction !== null}
                className={`px-4 py-2 rounded-md text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center gap-2 ${deleteChoiceAction ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {deleteChoiceAction === 'archive' && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                )}
                Supprimer visuellement
              </button>
              <button
                type="button"
                onClick={handleBulkPurge}
                disabled={deleteChoiceAction !== null}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 inline-flex items-center justify-center gap-2 ${deleteChoiceAction ? 'opacity-80 cursor-not-allowed hover:bg-red-600' : ''}`}
              >
                {deleteChoiceAction === 'purge' && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Supprimer toute trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentalsTable;
