import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vehicle } from '../../types/vehicle';
import Button from '../ui/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import { ChevronDown } from 'lucide-react';
import { StatusBadge, type BadgeTone } from '../ui-kit';
import { cn } from '../../utils/cn';

interface VehicleTableProps {
  vehicles: Vehicle[];
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
}

const statusMeta: Record<Vehicle['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Actif', tone: 'emerald' },
  maintenance: { label: 'Maintenance', tone: 'amber' },
  retired: { label: 'Retiré', tone: 'slate' },
};

const VehicleTable: React.FC<VehicleTableProps> = ({ vehicles, onBulkDelete }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const navigate = useNavigate();

  const hasSelection = selectedIds.length > 0;

  useEffect(() => {
    if (!hasSelection) setMenuOpen(false);
  }, [hasSelection]);

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => vehicles.some(v => v.id === id)));
  }, [vehicles]);

  const sorted = useMemo(() => {
    return [...vehicles].sort((a, b) => a.name.localeCompare(b.name));
  }, [vehicles]);

  const toggleRow = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]));
  };

  const toggleAll = (checked: boolean, current: Vehicle[]) => {
    setSelectedIds(checked ? current.map(v => v.id) : []);
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

  const colorSwatch = (color?: string | null) => color || '#CBD5F5';

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Véhicules ({vehicles.length})</h3>
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSelection || bulkDeleting}
            onClick={() => hasSelection && !bulkDeleting && setMenuOpen(open => !open)}
            className="px-3 py-1.5 text-sm"
          >
            {bulkDeleting && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
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
                Supprimer la sélection
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
                checked={hasSelection && selectedIds.length === sorted.length && sorted.length > 0}
                onChange={(e) => toggleAll(e.target.checked, sorted)}
                aria-label="Tout sélectionner"
                disabled={bulkDeleting || sorted.length === 0}
              />
            </TableHeaderCell>
            <TableHeaderCell className="w-14 px-4">Couleur</TableHeaderCell>
            <TableHeaderCell className="px-4">Nom</TableHeaderCell>
            <TableHeaderCell className="px-4">Plaque</TableHeaderCell>
            <TableHeaderCell className="px-4">Statut</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.length === 0 && (
            <tr>
              <TableCell colSpan={5} className="px-4 py-6 text-sm text-gray-500 text-center">Aucun véhicule</TableCell>
            </tr>
          )}
          {sorted.map((vehicle) => {
            const isSelected = selectedIds.includes(vehicle.id);
            return (
              <TableRow
                key={vehicle.id}
                className={cn(
                  'transition-colors',
                  isSelected && 'bg-blue-50',
                  !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                )}
                onClick={() => {
                  if (hasSelection) return;
                  navigate(`/vehicles/${vehicle.id}`);
                }}
              >
                <TableCell className="px-4 py-2 align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRow(vehicle.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Sélectionner ${vehicle.name}`}
                    disabled={bulkDeleting}
                  />
                </TableCell>
                <TableCell className="px-4 py-2">
                  <span
                    className="inline-block h-4 w-4 rounded-md border border-gray-300"
                    style={{ backgroundColor: colorSwatch(vehicle.color) }}
                    aria-hidden="true"
                  />
                </TableCell>
                <TableCell className="px-4 py-2 text-sm font-medium text-gray-900">{vehicle.name}</TableCell>
                <TableCell className="px-4 py-2 text-sm text-gray-700">{vehicle.license_plate}</TableCell>
                <TableCell className="px-4 py-2">
                  <StatusBadge tone={statusMeta[vehicle.status].tone}>
                    {statusMeta[vehicle.status].label}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Supprimer les véhicules"
        message={`Confirmer la suppression des ${selectedIds.length} élément(s) sélectionné(s) ? Cette action est irréversible.`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        loading={bulkDeleting}
      />
    </div>
  );
};

export default VehicleTable;
