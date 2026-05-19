import React, { useEffect, useMemo, useState } from 'react';
import MobileLayout from './MobileLayout';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { StatusBadge, type BadgeTone } from '../../components/ui-kit';

type ClientInfo = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  company: string | null;
};

type PrestationDetail = {
  id: string;
  reference_code: string | null;
  title: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  description: string | null;
  notes: string | null;
  total_price: number | null;
  client: ClientInfo | null;
  documents: Array<{
    id: string;
    title: string;
    doc_type: string;
    file_url: string;
    created_at: string;
  }>;
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

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—';
  return `${Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
};

const MobilePrestationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PrestationDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('rentals')
          .select(`
            id,
            reference_code,
            title,
            status,
            start_date,
            end_date,
            location,
            delivery_address,
            pickup_address,
            description,
            notes,
            total_price,
            clients(
              name,
              email,
              phone,
              address,
              company
            ),
            rental_documents(
              id,
              title,
              doc_type,
              file_url,
              created_at
            )
          `)
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          setDetail(null);
          return;
        }
        setDetail({
          id: data.id,
          reference_code: data.reference_code,
          title: data.title,
          status: data.status || 'pending',
          start_date: data.start_date,
          end_date: data.end_date,
          location: data.location,
          delivery_address: data.delivery_address,
          pickup_address: data.pickup_address,
          description: data.description,
          notes: data.notes,
          total_price: typeof data.total_price === 'number' ? data.total_price : null,
          client: data.clients
            ? {
              name: data.clients.name ?? null,
              email: data.clients.email ?? null,
              phone: data.clients.phone ?? null,
              address: data.clients.address ?? null,
              company: data.clients.company ?? null,
            }
            : null,
          documents: Array.isArray(data.rental_documents) ? data.rental_documents : [],
        });
      } catch (err) {
        console.error(err);
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const locationLabel = useMemo(() => {
    if (!detail) return '—';
    return detail.location || detail.delivery_address || detail.pickup_address || '—';
  }, [detail]);

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Détails prestation</h1>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : !detail ? (
          <div className="text-sm text-gray-500">Prestation introuvable.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {detail.reference_code || 'Référence —'}
                  </div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">
                    {detail.title || 'Prestation'}
                  </div>
                </div>
                <StatusBadge tone={statusBadgeTone(detail.status)}>
                  {STATUS_LABELS[detail.status] || detail.status}
                </StatusBadge>
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                <div>Début : <span className="text-gray-900 dark:text-white">{formatDate(detail.start_date)}</span></div>
                <div>Fin : <span className="text-gray-900 dark:text-white">{formatDate(detail.end_date)}</span></div>
                <div>Lieu : <span className="text-gray-900 dark:text-white">{locationLabel}</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Client</div>
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                <div>{detail.client?.name || '—'}</div>
                {detail.client?.company && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{detail.client.company}</div>
                )}
                {detail.client?.email && (
                  <div>{detail.client.email}</div>
                )}
                {detail.client?.phone && (
                  <div>{detail.client.phone}</div>
                )}
                {detail.client?.address && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{detail.client.address}</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Résumé</div>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <div>
                  Montant total : <span className="text-gray-900 dark:text-white">{formatCurrency(detail.total_price)}</span>
                </div>
                {detail.description && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-1 dark:text-gray-500">Description</div>
                    <div className="text-gray-700 dark:text-gray-200">{detail.description}</div>
                  </div>
                )}
                {detail.notes && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400 mb-1 dark:text-gray-500">Notes</div>
                    <div className="text-gray-700 dark:text-gray-200">{detail.notes}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Documents</div>
              {detail.documents.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Aucun document généré.</div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {detail.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      download={doc.title}
                      className="flex items-center justify-between py-2 text-sm text-gray-700 dark:text-gray-200"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{doc.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{doc.doc_type} • {formatDate(doc.created_at)}</div>
                      </div>
                      <span className="text-xs text-blue-600 dark:text-blue-300">Télécharger</span>
                    </a>
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

export default MobilePrestationDetail;
