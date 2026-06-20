import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '../../types/client';
import EmptyTableRow from '../common/EmptyTableRow';
import Button from '../ui/Button';
import ConfirmDialog from '../common/ConfirmDialog';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

const getInitials = (name?: string | null) => {
  if (!name) return '?';
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() || '');
  const joined = letters.join('').slice(0, 2);
  return joined || '?';
};

type SortKey = 'name' | 'contact';

interface ClientTableProps {
  clients: Client[];
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  mode?: 'clients' | 'companies';
}

const ClientTable: React.FC<ClientTableProps> = ({ clients, onBulkDelete, mode = 'clients' }) => {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const navigate = useNavigate();

  const sorted = useMemo(() => {
    const data = [...clients];
    const dir = sortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      let av: any;
      let bv: any;
      switch (sortKey) {
        case 'name':
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
          break;
        case 'contact':
          av = (a.email || '').toLowerCase();
          bv = (b.email || '').toLowerCase();
          break;
        default:
          av = 0; bv = 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return data;
  }, [clients, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
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
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]));
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? sorted.map(item => item.id) : []);
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

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-700">
          {mode === 'companies' ? `Entreprises (${clients.length})` : `Clients (${clients.length})`}
        </p>
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSelection || bulkDeleting}
            onClick={() => hasSelection && !bulkDeleting && setMenuOpen(open => !open)}
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
                checked={hasSelection && selectedIds.length === sorted.length}
                onChange={(e) => toggleAll(e.target.checked)}
                aria-label="Tout sélectionner"
                disabled={bulkDeleting}
              />
            </TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900">
                Nom
                <SortIcon active={sortKey === 'name'} />
              </button>
            </TableHeaderCell>
            <TableHeaderCell className="px-4">
              <button type="button" onClick={() => toggleSort('contact')} className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900">
                Contact
                <SortIcon active={sortKey === 'contact'} />
              </button>
            </TableHeaderCell>
            <TableHeaderCell className="px-4 text-right w-28">Score</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {clients.length === 0 && (
            <EmptyTableRow
              colSpan={4}
              message={mode === 'companies' ? "Aucune entreprise n'a été créée" : "Aucun client n'a été créé"}
            />
          )}
          {sorted.map((client) => {
            const isSelected = selectedIds.includes(client.id);
            return (
              <TableRow
                key={client.id}
                className={cn(
                  'transition-colors',
                  isSelected && 'bg-blue-50',
                  !hasSelection ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                )}
                onClick={() => {
                  if (hasSelection) return;
                  navigate(`/clients/${client.id}`);
                }}
              >
                <TableCell className="px-4 py-2 align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRow(client.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Sélectionner ${client.name}`}
                    disabled={bulkDeleting}
                  />
                </TableCell>
                <TableCell className="px-4 py-2">
                  <div className="flex items-center">
                    <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                      {getInitials(client.name)}
                    </div>
                    <div className="ml-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">{client.name}</div>
                        {client.client_number != null && (
                          <span className="font-mono text-[11px] text-gray-400">
                            #{String(client.client_number).padStart(4, '0')}
                          </span>
                        )}
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          client.client_type === 'company'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        )}>
                          {client.client_type === 'company' ? 'Entreprise' : 'Client'}
                        </span>
                      </div>
                      {client.address && <div className="text-xs text-gray-500">{client.address}</div>}
                      {client.tags && client.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {client.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2 text-sm text-gray-700">
                  <div>{client.email || '—'}</div>
                  {client.phone && <div className="text-xs text-gray-500">{client.phone}</div>}
                </TableCell>
                <TableCell className="px-4 py-2">
                  {client.client_type === 'person' && (() => {
                    const s = client.trust_score ?? null;
                    const c = 2 * Math.PI * 10;
                    const color = s === null ? '#d1d5db'
                      : s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : s >= 40 ? '#f97316' : '#ef4444';
                    return (
                      <div className="flex items-center justify-end gap-1.5" title={s !== null ? `Score de confiance : ${s}/100` : 'Score non calculé'}>
                        <svg width="20" height="20" viewBox="0 0 26 26" className="-rotate-90">
                          <circle cx="13" cy="13" r="10" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                          {s !== null && (
                            <circle
                              cx="13" cy="13" r="10" fill="none"
                              stroke={color} strokeWidth="3"
                              strokeDasharray={c}
                              strokeDashoffset={c * (1 - s / 100)}
                              strokeLinecap="round"
                            />
                          )}
                        </svg>
                        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
                          {s !== null ? `${s}/100` : '--/100'}
                        </span>
                      </div>
                    );
                  })()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Supprimer les clients"
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

export default ClientTable;
