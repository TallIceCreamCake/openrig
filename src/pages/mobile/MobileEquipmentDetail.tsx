import React, { useEffect, useMemo, useState } from 'react';
import MobileLayout from './MobileLayout';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { StatusBadge, type BadgeTone } from '../../components/ui-kit';

type EquipmentInfo = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  image_url: string | null;
};

type AccessoryRow = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  image_urls: string[];
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

const MobileEquipmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<EquipmentInfo | null>(null);
  const [accessories, setAccessories] = useState<AccessoryRow[]>([]);
  const [rentals, setRentals] = useState<RentalRow[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data: equipmentRow } = await supabase
          .from('equipment')
          .select('id, name, type, subtype, description, image_url')
          .eq('id', id)
          .maybeSingle();
        setEquipment(equipmentRow as EquipmentInfo);

        const { data: accessoryRows } = await supabase
          .from('equipment_accessories')
          .select('id, name, description, quantity, image_urls')
          .eq('equipment_id', id)
          .order('created_at', { ascending: false });
        setAccessories((accessoryRows || []) as AccessoryRow[]);

        const { data: rentalItems } = await supabase
          .from('rental_items')
          .select('rental_id, created_at')
          .eq('equipment_id', id)
          .order('created_at', { ascending: false })
          .limit(3);
        const rentalIds = Array.from(new Set((rentalItems || []).map((row: any) => row.rental_id).filter(Boolean)));
        if (rentalIds.length) {
          const { data: rentalRows } = await supabase
            .from('rentals')
            .select('id, reference_code, title, status, start_date, end_date')
            .in('id', rentalIds);
          const orderMap = new Map(rentalIds.map((rid, idx) => [rid, idx]));
          const sorted = (rentalRows || []).sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
          setRentals(sorted as RentalRow[]);
        } else {
          setRentals([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const mainImage = useMemo(() => equipment?.image_url || '', [equipment?.image_url]);

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Matériel</h1>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : !equipment ? (
          <div className="text-sm text-gray-500">Matériel introuvable.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              {mainImage ? (
                <img src={mainImage} alt={equipment.name} className="w-full h-44 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className="w-full h-44 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-sm text-gray-500 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-400">
                  Aucune image
                </div>
              )}
              <div className="mt-3">
                <div className="text-base font-semibold text-gray-900 dark:text-white">{equipment.name}</div>
                {equipment.description && (
                  <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{equipment.description}</div>
                )}
                <div className="mt-3 grid gap-1 text-sm text-gray-600 dark:text-gray-300">
                  <div>Type : <span className="text-gray-900 dark:text-white">{equipment.type}</span></div>
                  <div>Sous-type : <span className="text-gray-900 dark:text-white">{equipment.subtype || '—'}</span></div>
                  <div>Emplacement : <span className="text-gray-900 dark:text-white">À venir</span></div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Accessoires</div>
              {accessories.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Aucun accessoire.</div>
              ) : (
                <div className="space-y-2">
                  {accessories.map((acc) => {
                    const imageUrl = Array.isArray(acc.image_urls) ? acc.image_urls.find(Boolean) || '' : '';
                    return (
                      <Link
                        key={acc.id}
                        to={`/m/accessoires/${acc.id}`}
                        className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70"
                      >
                        {imageUrl ? (
                          <img src={imageUrl} alt={acc.name} className="h-12 w-12 rounded-md object-cover border border-gray-200 dark:border-gray-700" />
                        ) : (
                          <div className="h-12 w-12 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-400">
                            —
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{acc.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Quantité : {acc.quantity}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
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
                      className="block rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70"
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

export default MobileEquipmentDetail;
