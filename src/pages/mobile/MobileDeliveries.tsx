import React, { useEffect, useState } from 'react';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { StatusBadge, type BadgeTone } from '../../components/ui-kit';

interface Row {
  id: string;
  rental_id: string;
  client_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  status: string;
  address?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Validé',
  preparing: 'En préparation',
  in_progress: 'En cours',
  delivered: 'Livré',
  in_return: 'En retour',
  returned: 'Retourné',
  paid: 'Payé',
  completed: 'Terminée',
  cancelled: 'Annulée',
  archived: 'Archivée',
};

const statusBadgeTone = (status: string): BadgeTone => {
  switch (status) {
    case 'preparing':
      return 'orange';
    case 'confirmed':
      return 'emerald';
    case 'pending':
      return 'amber';
    case 'in_progress':
      return 'blue';
    case 'delivered':
      return 'sky';
    case 'in_return':
      return 'purple';
    case 'returned':
    case 'paid':
    case 'completed':
      return 'gray';
    case 'cancelled':
      return 'red';
    default:
      return 'slate';
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

const MobileDeliveries: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await supabase
          .from('rentals')
          .select('id, type, status, start_date, end_date, delivery_address, location, clients(name)')
          .in('type', ['rental', 'service'])
          .in('status', ['in_progress'])
          .order('start_date', { ascending: true });
        setRows((data || []).map((r: any) => ({
          id: r.id,
          rental_id: r.id,
          client_name: r.clients?.name || 'Client',
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.status,
          address: r.delivery_address || r.location || null,
        })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <MobileLayout>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Livraisons</h1>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">Aucune livraison.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/m/livraisons/${row.rental_id}`}
              className="block border border-gray-200 rounded-lg p-3 active:scale-[.99] dark:border-gray-700"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">{row.client_name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(row.start_date)} → {formatDate(row.end_date)}
              </div>
              {row.address && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.address}</div>
              )}
              <StatusBadge tone={statusBadgeTone(row.status)} className="mt-2">
                {STATUS_LABELS[row.status] || row.status}
              </StatusBadge>
            </Link>
          ))}
        </div>
      )}
    </MobileLayout>
  );
};

export default MobileDeliveries;
