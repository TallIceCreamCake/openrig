import React, { useEffect, useMemo, useState } from 'react';
import MobileLayout from './MobileLayout';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { StatusBadge, type BadgeTone } from '../../components/ui-kit';

type ClientInfo = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  company: string | null;
  image_url: string | null;
  client_type: 'person' | 'company';
};

type RentalRow = {
  id: string;
  reference_code: string | null;
  title: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

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

const MobileClientDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [rentals, setRentals] = useState<RentalRow[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data: clientRow } = await supabase
          .from('clients')
          .select('id, name, email, phone, address, company, image_url, client_type')
          .eq('id', id)
          .maybeSingle();
        setClient(clientRow as ClientInfo);

        const { data: rentalRows } = await supabase
          .from('rentals')
          .select('id, reference_code, title, status, start_date, end_date')
          .eq('client_id', id)
          .order('start_date', { ascending: false })
          .limit(3);
        setRentals((rentalRows || []) as RentalRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const initials = useMemo(() => {
    if (!client?.name) return '?';
    return client.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }, [client?.name]);

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">{client?.client_type === 'company' ? 'Entreprise' : 'Client'}</h1>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : !client ? (
          <div className="text-sm text-gray-500">Client introuvable.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="flex items-center gap-3">
                {client.image_url ? (
                  <img src={client.image_url} alt={client.name} className="h-12 w-12 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-300">
                    {initials}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-gray-900 dark:text-white">{client.name}</div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      client.client_type === 'company'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {client.client_type === 'company' ? 'Entreprise' : 'Client'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {client.client_type === 'company' ? 'Entreprise' : (client.company || '—')}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-gray-600 dark:text-gray-300">
                <div>Email : <span className="text-gray-900 dark:text-white">{client.email || '—'}</span></div>
                <div>Téléphone : <span className="text-gray-900 dark:text-white">{client.phone || '—'}</span></div>
                <div>Adresse :</div>
                <div className="text-gray-900 dark:text-white whitespace-pre-line">{client.address || '—'}</div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Dernières prestations</div>
              {rentals.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Aucun projet récent.</div>
              ) : (
                <div className="space-y-2">
                  {rentals.map((row) => (
                    <Link
                      key={row.id}
                      to={`/m/prestations/${row.id}`}
                      className="block rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 active:scale-[.99] dark:border-gray-700 dark:bg-gray-800/70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{row.title || 'Prestation'}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {row.reference_code || 'Réf'} · {formatDate(row.start_date)} → {formatDate(row.end_date)}
                          </div>
                        </div>
                        <StatusBadge tone={statusBadgeTone(row.status)} size="sm">
                          {STATUS_LABELS[row.status] || row.status}
                        </StatusBadge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MobileClientDetail;
