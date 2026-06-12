import React from 'react';
import { Truck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { Rental } from '../../types/rental';
import { Button, Input, Textarea } from '../ui-kit';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  rental: Rental;
  onConfirmed?: (updates: Partial<Rental>) => void;
};

const toDatetimeLocal = (value?: string | null) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    const tzOffset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  } catch {
    return '';
  }
};

const fromDatetimeLocal = (value: string) => {
  if (!value || value.trim().length === 0) return null;
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  } catch {
    return null;
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
};

const ReturnDeliveryConfirmModal: React.FC<Props> = ({ isOpen, onClose, rental, onConfirmed }) => {
  const [returnedAt, setReturnedAt] = React.useState('');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const nowLocal = toDatetimeLocal(new Date().toISOString());
    setReturnedAt(toDatetimeLocal(rental.return_delivery_at) || nowLocal);
    setNote(rental.return_delivery_confirmation_note || '');
  }, [isOpen, rental.return_delivery_at, rental.return_delivery_confirmation_note]);

  const handleConfirm = async () => {
    const iso = fromDatetimeLocal(returnedAt);
    if (!iso) {
      toast.error('Veuillez indiquer la date/heure de récupération.');
      return;
    }
    setSaving(true);
    try {
      const updates: Partial<Rental> = {
        status: 'in_return',
        return_delivery_at: iso,
        return_delivery_confirmation_note: note.trim() ? note.trim() : null,
      };
      const { error } = await supabase
        .from('rentals')
        .update(updates)
        .eq('id', rental.id);
      if (error) throw error;
      toast.success('Livraison retour confirmée');
      onConfirmed?.(updates);
      onClose();
    } catch (e) {
      console.error('confirm return delivery', e);
      toast.error("Impossible de confirmer la livraison retour");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const pickupAddress = rental.pickup_address || rental.delivery_address || rental.location || '—';
  const depotAddress = rental.location || '—';
  const deliveryOffer = rental.delivery_offer_name || (rental.delivery_pricing_type ? `Offre ${rental.delivery_pricing_type}` : '—');
  const deliveryTotal = rental.delivery_total_amount != null ? `${rental.delivery_total_amount.toFixed(2)} €` : '—';

  return (
    <div className="fixed inset-0 z-[12040] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
              <Truck className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Confirmation de livraison retour</h3>
              <p className="text-sm text-slate-500">{rental.client_name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2 text-sm text-slate-600">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Adresse de retrait</p>
                <p className="text-slate-700">{pickupAddress}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Adresse de dépôt</p>
                <p className="text-slate-700">{depotAddress}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Période</p>
                <p className="text-slate-700">{formatDateTime(rental.start_date)} au {formatDateTime(rental.end_date)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Forfait livraison</p>
                <p className="text-slate-700">{deliveryOffer} · {deliveryTotal}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Date/heure de récupération</label>
            <Input
              type="datetime-local"
              value={returnedAt}
              onChange={(event) => setReturnedAt(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Note de livraison retour</label>
            <Textarea
              rows={3}
              placeholder="Ex: matériel récupéré, accès, particularités..."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="bg-cyan-600 text-white hover:bg-cyan-700 focus:ring-cyan-300"
          >
            Confirmer la livraison retour
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReturnDeliveryConfirmModal;
