import React from 'react';
import { Loader2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NAV_ITEM_DEFINITIONS } from '../../constants/navigation';
import type { GlobalSearchResult, GlobalSearchSection } from '../../utils/globalSearch';
import { StatusBadge } from '../ui-kit';

type GlobalSearchDropdownProps = {
  searchQuery: string;
  loading: boolean;
  sections: GlobalSearchSection[];
  onClose: () => void;
  /** Render inline (no absolute positioning) — used when embedded inside an overlay */
  inline?: boolean;
};

const MIN_QUERY_LENGTH = 3;
const MAX_ITEMS = 5;

const badgeClassMap: Record<NonNullable<GlobalSearchResult['badgeTone']>, string> = {
  blue: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  gray: 'bg-gray-100 text-gray-700',
};

const kindIconMap: Record<GlobalSearchResult['kind'], React.ComponentType<{ className?: string }>> = {
  project: NAV_ITEM_DEFINITIONS.rentals.icon,
  client: NAV_ITEM_DEFINITIONS.clients.icon,
  equipment: NAV_ITEM_DEFINITIONS.equipment.icon,
};

const GlobalSearchDropdown: React.FC<GlobalSearchDropdownProps> = ({
  searchQuery,
  loading,
  sections,
  onClose,
  inline = false,
}) => {
  if (searchQuery.trim().length < MIN_QUERY_LENGTH) return null;

  const isEmpty = !loading && sections.length === 0;
  const items = sections.flatMap((section) => section.results).slice(0, MAX_ITEMS);

  return (
    <div className={inline
      ? 'w-full overflow-hidden'
      : 'absolute left-0 right-0 top-full z-[12020] -mt-px w-full overflow-hidden rounded-b-xl rounded-t-none border border-t-0 border-gray-200 bg-white shadow-xl ring-1 ring-black/5'
    }>
      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2.5 px-3 py-3 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recherche en cours...
        </div>
      ) : isEmpty ? (
        <div className="flex items-start gap-2.5 px-3 py-3 text-sm text-gray-500">
          <Search className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium text-gray-700">Aucun résultat</p>
            <p>Aucune correspondance pour “{searchQuery.trim()}”.</p>
          </div>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto py-1">
          {items.map((result) => {
            const Icon = kindIconMap[result.kind];
            const badgeClass = badgeClassMap[result.badgeTone || 'gray'];
            return (
              <Link
                key={`${result.kind}-${result.id}`}
                to={result.href}
                className="flex items-center gap-2.5 px-3 py-2.5 transition hover:bg-gray-50"
                onClick={onClose}
              >
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${badgeClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                      {result.title}
                    </p>
                    {result.status && (
                      <StatusBadge
                        tone={result.statusTone || 'gray'}
                        size="xs"
                        className="flex-shrink-0"
                      >
                        {result.status}
                      </StatusBadge>
                    )}
                  </div>
                  {(result.subtitle || result.meta) && (
                    <p className="truncate text-xs text-gray-500">
                      {[result.subtitle, result.meta].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GlobalSearchDropdown;
