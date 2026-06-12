import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Personnel } from '../../types/personnel';
import Button from '../ui/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import { cn } from '../../utils/cn';

interface PersonnelListProps {
  personnel: Personnel[];
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
}

const PersonnelList: React.FC<PersonnelListProps> = ({ personnel, onBulkDelete }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const navigate = useNavigate();

  const hasSelection = selectedIds.length > 0;

  const getRoleLabel = (role: string) => {
    const roles = {
      admin: 'Administrateur',
      manager: 'Manager',
      technician: 'Technicien',
      driver: 'Chauffeur',
      commercial: 'Commercial',
      accountant: 'Comptable',
    } as const;
    return roles[role as keyof typeof roles] || role;
  };

  const getStatusLabel = (status: string) => {
    const statuses = {
      active: 'Actif',
      inactive: 'Inactif',
      vacation: 'Congés',
      sick_leave: 'Arrêt maladie',
    } as const;
    return statuses[status as keyof typeof statuses] || status;
  };

  const getStatusColorValue = (status: string) => {
    switch (status) {
      case 'active':
        return '#22c55e';
      case 'vacation':
        return '#2563eb';
      case 'sick_leave':
        return '#facc15';
      case 'inactive':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]));
  };

  const toggleAll = (checked: boolean, current: Personnel[]) => {
    setSelectedIds(checked ? current.map(p => p.id) : []);
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
    if (!hasSelection) setMenuOpen(false);
  }, [hasSelection]);

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => personnel.some(p => p.id === id)));
  }, [personnel]);

  const sorted = useMemo(() => {
    return [...personnel].sort((a, b) => {
      const nameA = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
      const nameB = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [personnel]);

  return (
    <div className="bg-white shadow rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Liste du Personnel ({personnel.length})</h3>
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
          <div className="absolute right-4 top-16 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
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
            <TableHeaderCell className="w-14 px-4">Statut</TableHeaderCell>
            <TableHeaderCell className="px-4">Employé</TableHeaderCell>
            <TableHeaderCell className="px-4">Rôle</TableHeaderCell>
            <TableHeaderCell className="px-4">Contact</TableHeaderCell>
            <TableHeaderCell className="px-4">Embauche</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.length === 0 && (
            <EmptyTableRow colSpan={6} message="Aucun membre du personnel" />
          )}
          {sorted.map((person) => {
            const isSelected = selectedIds.includes(person.id);
            return (
              <TableRow
                key={person.id}
                className={cn(
                  'transition-colors',
                  isSelected && 'bg-blue-50',
                  !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                )}
                onClick={() => {
                  if (hasSelection) return;
                  navigate(`/personnel/${person.id}`);
                }}
              >
                <TableCell className="px-4 py-2 align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRow(person.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Sélectionner ${person.first_name} ${person.last_name}`}
                    disabled={bulkDeleting}
                  />
                </TableCell>
                <TableCell className="px-4 py-2">
                  <span
                    className="inline-block h-4 w-4 rounded-md border border-gray-200"
                    style={{ backgroundColor: getStatusColorValue(person.status) }}
                    aria-hidden="true"
                  />
                </TableCell>
                <TableCell className="px-4 py-2">
                  <div className="flex items-center">
                    <img
                      className="h-9 w-9 rounded-full object-cover"
                      src={person.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100'}
                      alt="Avatar"
                    />
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">
                        {person.first_name} {person.last_name}
                      </div>
                      <div className="text-xs text-gray-500">{person.email || 'Sans acces app'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2 text-sm text-gray-700">{getRoleLabel(person.role)}</TableCell>
                <TableCell className="px-4 py-2 text-sm text-gray-700">
                  <div>{person.phone || '—'}</div>
                </TableCell>
                <TableCell className="px-4 py-2 text-sm text-gray-500">{new Date(person.hire_date).toLocaleDateString()}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Supprimer le personnel"
        message={`Confirmer la suppression des ${selectedIds.length} personne(s) sélectionnée(s) ? Cette action est irréversible.`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        loading={bulkDeleting}
      />
    </div>
  );
};

export default PersonnelList;
