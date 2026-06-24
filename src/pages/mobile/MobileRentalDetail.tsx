import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ClipboardList, Truck, Undo2, Package } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import MobileLayout from './MobileLayout';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/ui-kit/StatusBadge';
import type { BadgeTone } from '../../components/ui-kit/StatusBadge';

type RentalItem = {
  quantity: number;
  equipment: { name: string } | null;
};

type Rental = {
  id: string;
  title: string | null;
  reference_code: string | null;
  status: string;
  type: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  clients: { name: string } | null;
  rental_items: RentalItem[];
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

const typeLabel: Record<string, string> = {
  rental: 'Location',
  service: 'Service',
  sale: 'Vente',
  internal: 'Interne',
};

const MobileRentalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('rentals')
          .select('id, title, reference_code, status, type, start_date, end_date, notes, clients(name), rental_items(quantity, equipment:equipment_id(name))')
          .eq('id', id)
          .single();
        setRental(data as Rental);
      } catch (err) {
        console.error('MobileRentalDetail fetch error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement...</div>
      </MobileLayout>
    );
  }

  if (!rental) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Projet introuvable</div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shrink-0"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {rental.title || rental.reference_code || 'Sans titre'}
          </h1>
          {rental.clients?.name && (
            <p className="text-sm text-gray-500 truncate">{rental.clients.name}</p>
          )}
        </div>
        <StatusBadge tone={statusTone(rental.status)} size="sm">
          {statusLabel[rental.status] || rental.status}
        </StatusBadge>
      </div>

      {/* Info card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">Type</span>
          <span className="text-sm font-medium text-gray-900">{typeLabel[rental.type] || rental.type}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Période</span>
          <span className="text-sm font-medium text-gray-900">
            {format(new Date(rental.start_date), 'd MMM yyyy', { locale: fr })}
            {' → '}
            {format(new Date(rental.end_date), 'd MMM yyyy', { locale: fr })}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <button
          type="button"
          onClick={() => navigate(`/m/preparations/${id}`)}
          className="flex flex-col items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-2xl py-3 active:scale-95 transition-transform"
        >
          <ClipboardList className="h-5 w-5 text-indigo-600" />
          <span className="text-xs font-medium text-indigo-700">Préparer</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/m/livraisons/${id}`)}
          className="flex flex-col items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-2xl py-3 active:scale-95 transition-transform"
        >
          <Truck className="h-5 w-5 text-amber-600" />
          <span className="text-xs font-medium text-amber-700">Livrer</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/m/retours/${id}`)}
          className="flex flex-col items-center gap-1.5 bg-teal-50 border border-teal-100 rounded-2xl py-3 active:scale-95 transition-transform"
        >
          <Undo2 className="h-5 w-5 text-teal-600" />
          <span className="text-xs font-medium text-teal-700">Retourner</span>
        </button>
      </div>

      {/* Equipment */}
      {rental.rental_items && rental.rental_items.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Équipements</p>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {rental.rental_items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-800">{item.equipment?.name || 'Équipement inconnu'}</span>
                </div>
                <span className="text-sm font-medium text-gray-600">×{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {rental.notes && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</p>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{rental.notes}</p>
          </div>
        </div>
      )}
    </MobileLayout>
  );
};

export default MobileRentalDetail;
