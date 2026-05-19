import React, { useEffect, useMemo, useState } from 'react';
import MobileLayout from './MobileLayout';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MapPin, Truck, CheckCircle2 } from 'lucide-react';
import { StatusBadge, type BadgeTone } from '../../components/ui-kit';

type ClientInfo = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  company: string | null;
};

type VehicleInfo = {
  id: string;
  name: string;
  license_plate: string | null;
  make: string | null;
  model: string | null;
};

type AssignmentInfo = {
  id: string;
  vehicle_id: string;
  delivery_at: string | null;
  appointment_at: string | null;
  vehicle: VehicleInfo | null;
};

type DeliveryDetail = {
  id: string;
  reference_code: string | null;
  title: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  delivered_at: string | null;
  client: ClientInfo | null;
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

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

const MobileDeliveryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [assignments, setAssignments] = useState<AssignmentInfo[]>([]);
  const [gpsOpen, setGpsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
            delivered_at,
            clients(
              name,
              email,
              phone,
              address,
              company
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
          delivered_at: data.delivered_at,
          client: data.clients
            ? {
              name: data.clients.name ?? null,
              email: data.clients.email ?? null,
              phone: data.clients.phone ?? null,
              address: data.clients.address ?? null,
              company: data.clients.company ?? null,
            }
            : null,
        });

        const { data: assignmentRows } = await supabase
          .from('vehicle_assignments')
          .select('id, vehicle_id, delivery_at, appointment_at')
          .eq('rental_id', id);
        const rows = Array.isArray(assignmentRows) ? assignmentRows : [];
        const vehicleIds = rows.map((row: any) => row.vehicle_id).filter(Boolean);
        let vehicleMap = new Map<string, VehicleInfo>();
        if (vehicleIds.length) {
          const { data: vehicleRows } = await supabase
            .from('vehicles')
            .select('id, name, license_plate, make, model')
            .in('id', vehicleIds);
          if (Array.isArray(vehicleRows)) {
            vehicleMap = new Map(vehicleRows.map((v: any) => [v.id, v as VehicleInfo]));
          }
        }
        setAssignments(rows.map((row: any) => ({
          id: row.id,
          vehicle_id: row.vehicle_id,
          delivery_at: row.delivery_at,
          appointment_at: row.appointment_at,
          vehicle: vehicleMap.get(row.vehicle_id) || null,
        })));
      } catch (err) {
        console.error(err);
        setDetail(null);
        setAssignments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const address = useMemo(() => {
    if (!detail) return '—';
    return detail.delivery_address || detail.location || detail.pickup_address || detail.client?.address || '—';
  }, [detail]);

  const preferredArrival = useMemo(() => {
    if (!assignments.length) return null;
    const candidates = assignments
      .map((assignment) => assignment.appointment_at || assignment.delivery_at)
      .filter(Boolean) as string[];
    if (!candidates.length) return null;
    candidates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return candidates[0];
  }, [assignments]);

  const canConfirm = Boolean(detail && !detail.delivered_at && ['in_progress', 'delivered', 'paid'].includes(detail.status));

  const openGps = (provider: 'waze' | 'apple' | 'google') => {
    if (!address || address === '—') return;
    const encoded = encodeURIComponent(address);
    let url = '';
    if (provider === 'waze') {
      url = `https://waze.com/ul?q=${encoded}&navigate=yes`;
    } else if (provider === 'apple') {
      url = `http://maps.apple.com/?q=${encoded}`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    }
    window.open(url, '_blank', 'noopener');
    setGpsOpen(false);
  };

  const confirmDelivery = async () => {
    if (!detail || saving || !canConfirm) return;
    try {
      setSaving(true);
      const deliveredAt = new Date().toISOString();
      const { error } = await supabase
        .from('rentals')
        .update({ status: 'delivered', delivered_at: deliveredAt })
        .eq('id', detail.id);
      if (error) throw error;
      setDetail((prev) => prev ? { ...prev, status: 'delivered', delivered_at: deliveredAt } : prev);
    } catch (err) {
      console.error('confirm delivery', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileLayout>
      <div className="bg-white min-h-[80vh] -mt-10 -mx-4 px-4 pt-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Livraison</h1>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : !detail ? (
          <div className="text-sm text-gray-500">Livraison introuvable.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{detail.reference_code || 'Référence —'}</div>
                  <div className="text-base font-semibold text-gray-900 dark:text-white">{detail.title || 'Prestation'}</div>
                </div>
                <StatusBadge tone={statusBadgeTone(detail.status)}>
                  {STATUS_LABELS[detail.status] || detail.status}
                </StatusBadge>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-gray-600 dark:text-gray-300">
                <div>Début : <span className="text-gray-900 dark:text-white">{formatDateTime(detail.start_date)}</span></div>
                <div>Fin : <span className="text-gray-900 dark:text-white">{formatDateTime(detail.end_date)}</span></div>
                <div>Heure d&apos;arrivée préférée : <span className="text-gray-900 dark:text-white">{formatDateTime(preferredArrival)}</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
                <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-300" />
                Adresse de livraison
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-200">{address}</div>
              <button
                type="button"
                onClick={() => setGpsOpen(true)}
                disabled={!address || address === '—'}
                className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm font-medium dark:border-gray-700 ${
                  address && address !== '—'
                    ? 'border-blue-500 text-blue-600 hover:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-900/40'
                    : 'border-gray-200 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:text-gray-500'
                }`}
              >
                Ouvrir dans un GPS
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
                <Truck className="h-4 w-4 text-gray-400 dark:text-gray-300" />
                Attribution du véhicule
              </div>
              {assignments.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Aucun véhicule assigné.</div>
              ) : (
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70"
                    >
                      <div className="font-medium text-gray-900 dark:text-white">
                        {assignment.vehicle?.name || 'Véhicule'}
                        {assignment.vehicle?.license_plate ? ` • ${assignment.vehicle.license_plate}` : ''}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-300">
                        Livraison : {formatDateTime(assignment.delivery_at)} · Rendez-vous : {formatDateTime(assignment.appointment_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Client</div>
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-200">
                <div>{detail.client?.name || '—'}</div>
                {detail.client?.company && (
                  <div className="text-xs text-gray-500 dark:text-gray-300">{detail.client.company}</div>
                )}
                {detail.client?.email && (
                  <div>{detail.client.email}</div>
                )}
                {detail.client?.phone && (
                  <div>{detail.client.phone}</div>
                )}
                {detail.client?.address && (
                  <div className="text-xs text-gray-500 dark:text-gray-300">{detail.client.address}</div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={confirmDelivery}
              disabled={!canConfirm || saving}
              className={`mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white ${
                canConfirm
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {detail.delivered_at ? (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Livraison validée
                </span>
              ) : (
                'Valider la livraison'
              )}
            </button>
          </div>
        )}
      </div>

      {gpsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGpsOpen(false)} />
          <div className="relative w-full max-w-lg rounded-t-2xl bg-white px-4 py-5 shadow-xl">
            <div className="text-sm font-semibold text-gray-900">Ouvrir dans</div>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => openGps('waze')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Waze
              </button>
              <button
                type="button"
                onClick={() => openGps('apple')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Apple Plans
              </button>
              <button
                type="button"
                onClick={() => openGps('google')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Google Maps
              </button>
            </div>
            <button
              type="button"
              onClick={() => setGpsOpen(false)}
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </MobileLayout>
  );
};

export default MobileDeliveryDetail;
