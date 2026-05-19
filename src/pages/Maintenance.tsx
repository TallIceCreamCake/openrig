import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, ChevronDown, Filter, Loader2, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MaintenanceTask, useMaintenance } from '../hooks/useMaintenance';
import EmptyTableRow from '../components/common/EmptyTableRow';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../components/ui/Table';
import {
  maintenancePriorityOptions,
  maintenancePriorityTone,
  maintenancePriorityLabels,
  maintenanceStatusOptions,
  maintenanceStatusTone,
  maintenanceStatusLabels,
  maintenanceTypeOptions,
  maintenanceTypeLabels,
} from '../constants/maintenance';
import Button from '../components/ui/Button';
import { StatusBadge } from '../components/ui-kit';
import { cn } from '../utils/cn';

const MaintenancePage: React.FC = () => {
  const { tasks, loading, updateTasksStatus, deleteTask } = useMaintenance();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterTypes, setFilterTypes] = useState<Set<MaintenanceTask['type']>>(new Set(maintenanceTypeOptions));
  const [filterStatuses, setFilterStatuses] = useState<Set<MaintenanceTask['status']>>(new Set(maintenanceStatusOptions));
  const [filterPriorities, setFilterPriorities] = useState<Set<MaintenanceTask['priority']>>(new Set(maintenancePriorityOptions));
  const [uiTypes, setUiTypes] = useState<Set<MaintenanceTask['type']>>(new Set(maintenanceTypeOptions));
  const [uiStatuses, setUiStatuses] = useState<Set<MaintenanceTask['status']>>(new Set(maintenanceStatusOptions));
  const [uiPriorities, setUiPriorities] = useState<Set<MaintenanceTask['priority']>>(new Set(maintenancePriorityOptions));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<MaintenanceTask['status'] | null>(null);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowActionKind, setRowActionKind] = useState<'complete' | 'delete' | null>(null);
  const navigate = useNavigate();

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filterTypes.size > 0 && !filterTypes.has(t.type)) return false;
      if (filterStatuses.size > 0 && !filterStatuses.has(t.status)) return false;
      if (filterPriorities.size > 0 && !filterPriorities.has(t.priority)) return false;
      if (!q) return true;
      const haystack = [
        t.title,
        t.equipment_name,
        t.equipment_id,
        t.serial_numbers?.join(' '),
        t.description,
        t.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tasks, query, filterTypes, filterStatuses, filterPriorities]);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }),
    []
  );

  const hasSelection = selectedIds.length > 0;

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? filteredTasks.map((item) => item.id) : []);
  };

  const handleBulkStatus = async (status: MaintenanceTask['status']) => {
    if (!hasSelection || bulkStatus) return;
    setMenuOpen(false);
    setBulkStatus(status);
    try {
      await updateTasksStatus(selectedIds, status);
      setSelectedIds([]);
    } catch (error) {
      console.error(error);
      toast.error('Impossible de mettre à jour les statuts');
    } finally {
      setBulkStatus(null);
    }
  };

  useEffect(() => {
    if (!hasSelection) {
      setMenuOpen(false);
    }
  }, [hasSelection]);

  useEffect(() => {
    if (!selectedIds.length) return;
    const currentIds = new Set(filteredTasks.map((t) => t.id));
    setSelectedIds((prev) => prev.filter((id) => currentIds.has(id)));
  }, [filteredTasks, selectedIds.length]);

  const actionBusy = bulkStatus !== null;

  const handleComplete = async (task: MaintenanceTask) => {
    if (rowActionId || task.status === 'completed' || task.status === 'cancelled') return;
    setRowActionId(task.id);
    setRowActionKind('complete');
    try {
      await updateTasksStatus([task.id], 'completed');
    } catch (error) {
      console.error(error);
      toast.error('Impossible de terminer la maintenance');
    } finally {
      setRowActionId(null);
      setRowActionKind(null);
    }
  };

  const handleDelete = async (task: MaintenanceTask) => {
    if (rowActionId) return;
    if (!window.confirm(`Supprimer la maintenance "${task.title}" ?`)) return;
    setRowActionId(task.id);
    setRowActionKind('delete');
    try {
      await deleteTask(task.id);
      setSelectedIds((prev) => prev.filter((value) => value !== task.id));
    } catch (error) {
      console.error(error);
      toast.error('Impossible de supprimer la maintenance');
    } finally {
      setRowActionId(null);
      setRowActionKind(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">Maintenance</h1>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une maintenance"
              className="pl-9 pr-8 py-2 w-full rounded-md border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                aria-label="Effacer la recherche"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              aria-haspopup="dialog"
              aria-expanded={showFilters}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50"
              title="Filtres"
            >
              <Filter className="h-4 w-4" />
              Filtres
            </button>

            {showFilters && (
              <div className="absolute z-20 mt-2 w-80 left-0 bg-white border border-gray-200 rounded-md shadow-lg">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-900">Filtres</div>
                    <button
                      type="button"
                      className="p-1 text-gray-400 hover:text-gray-600"
                      aria-label="Fermer"
                      onClick={() => setShowFilters(false)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-2">Type</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {maintenanceTypeOptions.map((key) => (
                        <label key={key} className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={uiTypes.has(key)}
                            onChange={(e) => {
                              setUiTypes((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(key);
                                else next.delete(key);
                                if (next.size === 0) return new Set(maintenanceTypeOptions);
                                return next;
                              });
                            }}
                          />
                          <span className="text-gray-700">{maintenanceTypeLabels[key]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-2">Statut</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {maintenanceStatusOptions.map((key) => (
                        <label key={key} className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={uiStatuses.has(key)}
                            onChange={(e) => {
                              setUiStatuses((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }}
                          />
                          <span className="text-gray-700">{maintenanceStatusLabels[key]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-2">Priorité</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {maintenancePriorityOptions.map((key) => (
                        <label key={key} className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={uiPriorities.has(key)}
                            onChange={(e) => {
                              setUiPriorities((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }}
                          />
                          <span className="text-gray-700">{maintenancePriorityLabels[key]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700"
                      onClick={() => {
                        setUiTypes(new Set(maintenanceTypeOptions));
                        setUiStatuses(new Set(maintenanceStatusOptions));
                        setUiPriorities(new Set(maintenancePriorityOptions));
                      }}
                    >
                      Réinitialiser
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white"
                      onClick={() => {
                        setFilterTypes(new Set(uiTypes));
                        setFilterStatuses(new Set(uiStatuses));
                        setFilterPriorities(new Set(uiPriorities));
                        setShowFilters(false);
                      }}
                    >
                      Appliquer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-700">
            Tâches de maintenance <span className="text-gray-400">({filteredTasks.length})</span>
          </h2>
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
              Actions
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
            {menuOpen && hasSelection && (
              <div className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                <button
                  type="button"
                  className="w-full px-4 py-2 text-sm text-left text-blue-600 hover:bg-blue-50"
                  onClick={() => handleBulkStatus('in_progress')}
                >
                  Marquer en cours
                </button>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-sm text-left text-emerald-600 hover:bg-emerald-50"
                  onClick={() => handleBulkStatus('completed')}
                >
                  Marquer terminée
                </button>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50"
                  onClick={() => handleBulkStatus('cancelled')}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-12 px-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                    checked={hasSelection && selectedIds.length === filteredTasks.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Tout selectionner"
                    disabled={actionBusy}
                  />
                </TableHeaderCell>
                <TableHeaderCell>Tâche</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Priorité</TableHeaderCell>
                <TableHeaderCell>Planifiée</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
                <TableHeaderCell>Coût</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-gray-500">
                    <Loader2 className="inline-block h-4 w-4 mr-2 animate-spin" /> Chargement…
                  </TableCell>
                </TableRow>
              ) : filteredTasks.length === 0 ? (
                <EmptyTableRow colSpan={8} message="Aucune tâche pour ce filtre" />
              ) : (
                filteredTasks.map((t) => (
                  <TableRow
                    key={t.id}
                    className={cn(
                      'transition-colors',
                      selectedIds.includes(t.id) && 'bg-blue-50',
                      !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                    )}
                    onClick={() => {
                      if (hasSelection) return;
                      navigate(`/maintenance/${t.id}`);
                    }}
                  >
                    <TableCell className="px-4 py-2 align-middle">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                        checked={selectedIds.includes(t.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleRow(t.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Selectionner ${t.title}`}
                        disabled={actionBusy}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/maintenance/${t.id}`}
                        className="font-semibold text-gray-900 hover:text-blue-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.title}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {t.equipment_name || t.equipment_id || 'Équipement inconnu'}
                      </div>
                    </TableCell>
                    <TableCell>{maintenanceTypeLabels[t.type]}</TableCell>
                    <TableCell>
                      <StatusBadge tone={maintenancePriorityTone[t.priority]} variant="outline">
                        {maintenancePriorityLabels[t.priority]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{new Date(t.scheduled_date).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>
                      <StatusBadge tone={maintenanceStatusTone[t.status]}>
                        {maintenanceStatusLabels[t.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {typeof t.cost === 'number' ? currencyFormatter.format(t.cost) : '—'}
                    </TableCell>
                    <TableCell className="w-[220px]">
                      <div className="flex items-center justify-end gap-2">
                        {t.status !== 'completed' && t.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleComplete(t);
                            }}
                            disabled={actionBusy || rowActionId === t.id}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {rowActionId === t.id && rowActionKind === 'complete' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}
                            Terminer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(t);
                          }}
                          disabled={actionBusy || rowActionId === t.id}
                          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {rowActionId === t.id && rowActionKind === 'delete' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Supprimer
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
};

export default MaintenancePage;
