import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/ui-kit/StatusBadge';
import type { BadgeTone } from '../../components/ui-kit/StatusBadge';

type Rental = {
  id: string;
  title: string | null;
  reference_code: string | null;
  status: string;
  start_date: string;
  end_date: string;
  type: string;
  clients: { name: string } | null;
};

const statusTone = (status: string): BadgeTone => {
  switch (status) {
    case 'pending':
    case 'confirmed':
      return 'amber';
    case 'preparing':
      return 'orange';
    case 'in_progress':
    case 'delivered':
      return 'blue';
    case 'returned':
    case 'paid':
    case 'completed':
      return 'gray';
    case 'cancelled':
      return 'red';
    default:
      return 'gray';
  }
};

const statusLabel: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  preparing: 'En préparation',
  in_progress: 'En cours',
  delivered: 'Livré',
  in_return: 'En retour',
  returned: 'Retourné',
  paid: 'Payé',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'in_progress'];
const DELIVERED_STATUSES = ['delivered', 'in_return'];

type Tab = 'active' | 'delivered' | 'all';

const MobileRentals: React.FC = () => {
  const navigate = useNavigate();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('active');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('rentals')
          .select('id, title, reference_code, status, start_date, end_date, type, clients(name)')
          .not('type', 'eq', 'internal')
          .order('start_date', { ascending: false });
        setRentals((data as Rental[]) || []);
      } catch (err) {
        console.error('MobileRentals fetch error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = rentals.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.title?.toLowerCase().includes(q) ||
      r.reference_code?.toLowerCase().includes(q) ||
      r.clients?.name?.toLowerCase().includes(q);

    const matchTab =
      tab === 'all' ||
      (tab === 'active' && ACTIVE_STATUSES.includes(r.status)) ||
      (tab === 'delivered' && DELIVERED_STATUSES.includes(r.status));

    return matchSearch && matchTab;
  });

  return (
    <MobileLayout>
      {/* Title */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Projets</h1>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un projet..."
          className="w-full rounded-xl border border-gray-300 px-4 py-3 pl-9 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        {([['active', 'Actifs'], ['delivered', 'Livrés'], ['all', 'Tous']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <ClipboardList className="h-10 w-10 text-gray-300" />
          <p className="text-gray-400 text-sm">Aucun projet trouvé</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          {filtered.map((rental) => (
            <button
              key={rental.id}
              type="button"
              onClick={() => navigate(`/m/projets/${rental.id}`)}
              className="w-full text-left border border-gray-200 rounded-xl bg-white shadow-sm active:scale-[.98] transition-transform px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-semibold text-gray-900 truncate flex-1">
                  {rental.title || rental.reference_code || 'Sans titre'}
                </p>
                <StatusBadge tone={statusTone(rental.status)}>
                  {statusLabel[rental.status] || rental.status}
                </StatusBadge>
              </div>
              {rental.clients?.name && (
                <p className="text-sm text-gray-500 mb-1 truncate">{rental.clients.name}</p>
              )}
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span>{format(new Date(rental.start_date), 'd MMM', { locale: fr })}</span>
                <span>→</span>
                <span>{format(new Date(rental.end_date), 'd MMM', { locale: fr })}</span>
              </div>
              {rental.status === 'confirmed' || rental.status === 'preparing' ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/m/preparations/${rental.id}`);
                    }}
                    className="text-xs font-medium px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg active:scale-95 transition-transform"
                  >
                    Préparer
                  </button>
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

    </MobileLayout>
  );
};

export default MobileRentals;
