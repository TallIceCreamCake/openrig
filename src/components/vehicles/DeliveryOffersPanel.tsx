import React, { useMemo, useState } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDeliveryOffers } from '../../hooks/useDeliveryOffers';
import { DeliveryOffer, DeliveryPricingType } from '../../types/deliveryOffer';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import ConfirmDialog from '../common/ConfirmDialog';

type OfferFormState = {
  name: string;
  description: string;
  pricing_type: DeliveryPricingType;
  rate_amount: string;
  base_amount: string;
  is_active: boolean;
};

const PRICING_OPTIONS: Array<{ value: DeliveryPricingType; label: string; unitLabel?: string }> = [
  { value: 'per_km', label: 'Au km', unitLabel: 'km' },
  { value: 'per_hour', label: "À l'heure", unitLabel: 'h' },
  { value: 'fixed', label: 'Prix fixe' },
  { value: 'per_day', label: 'Par jour', unitLabel: 'jour' },
  { value: 'per_trip', label: 'Par livraison' },
];

const RATE_LABEL: Record<DeliveryPricingType, string> = {
  per_km: 'Tarif par km',
  per_hour: "Tarif par heure",
  fixed: 'Prix fixe',
  per_day: 'Tarif par jour',
  per_trip: 'Tarif par livraison',
};

const emptyForm = (): OfferFormState => ({
  name: '',
  description: '',
  pricing_type: 'per_km',
  rate_amount: '',
  base_amount: '',
  is_active: true,
});

const toNumber = (value: string) => {
  if (!value.trim()) return 0;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

type Props = {
  createSignal?: number;
};

const DeliveryOffersPanel: React.FC<Props> = ({ createSignal = 0 }) => {
  const { offers, loading, addOffer, updateOffer, deleteOffer } = useDeliveryOffers();
  const [form, setForm] = useState<OfferFormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const lastCreateSignal = React.useRef(createSignal);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }),
    []
  );

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowFormModal(true);
  };

  const closeForm = () => {
    resetForm();
    setShowFormModal(false);
  };

  React.useEffect(() => {
    if (createSignal !== lastCreateSignal.current) {
      lastCreateSignal.current = createSignal;
      if (createSignal > 0) {
        openCreate();
      }
    }
  }, [createSignal]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom est requis.');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<DeliveryOffer> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        pricing_type: form.pricing_type,
        rate_amount: toNumber(form.rate_amount),
        base_amount: toNumber(form.base_amount),
        is_active: form.is_active,
      };
      if (editingId) {
        await updateOffer(editingId, payload);
      } else {
        await addOffer(payload);
      }
      closeForm();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (offer: DeliveryOffer) => {
    setEditingId(offer.id);
    setForm({
      name: offer.name,
      description: offer.description || '',
      pricing_type: offer.pricing_type,
      rate_amount: offer.rate_amount?.toString() || '',
      base_amount: offer.base_amount?.toString() || '',
      is_active: offer.is_active,
    });
    setShowFormModal(true);
  };

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteOffer(pendingDeleteId);
    } catch (e) {
      console.error(e);
    } finally {
      setPendingDeleteId(null);
      setConfirmOpen(false);
    }
  };

  const renderPricingDetails = (offer: DeliveryOffer) => {
    const parts: string[] = [];
    const rateLabel = RATE_LABEL[offer.pricing_type];
    const rate = currencyFormatter.format(Number(offer.rate_amount || 0));
    parts.push(`${rateLabel} : ${rate}`);
    if (offer.base_amount > 0) {
      parts.push(`Forfait de base : ${currencyFormatter.format(Number(offer.base_amount || 0))}`);
    }
    return parts.join(' • ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Offres disponibles</h3>
          <span className="text-xs text-gray-500">{offers.length} offre(s)</span>
        </div>
        {offers.length === 0 ? (
          <div className="px-6 py-6 text-sm text-gray-500">Aucune offre enregistrée.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {offers.map((offer) => (
              <div key={offer.id} className="px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{offer.name}</span>
                    {!offer.is_active && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">Inactive</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{renderPricingDetails(offer)}</div>
                  {offer.description && <div className="text-xs text-gray-500">{offer.description}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(offer)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-100"
                  >
                    <Pencil className="h-4 w-4" /> Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(offer.id)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Supprimer l'offre"
        message="Confirmer la suppression de cette offre de livraison ?"
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={confirmDelete}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingDeleteId(null);
        }}
      />

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={saving ? undefined : closeForm}
          />
          <div className="relative w-full max-w-2xl mx-4 rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? "Modifier l'offre" : "Créer une offre"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className={`p-2 rounded-full hover:bg-gray-100 text-gray-500 ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Nom de l'offre</label>
                <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Livraison express" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Type de tarification</label>
                <Select
                  value={form.pricing_type}
                  onChange={(e) => setForm(prev => ({ ...prev, pricing_type: e.target.value as DeliveryPricingType }))}
                >
                  {PRICING_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">{RATE_LABEL[form.pricing_type]}</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.rate_amount}
                  onChange={(e) => setForm(prev => ({ ...prev, rate_amount: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Forfait de base</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.base_amount}
                  onChange={(e) => setForm(prev => ({ ...prev, base_amount: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Détails et conditions de l'offre"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 md:col-span-2">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={form.is_active}
                  onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                Offre active
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className={`px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check className="h-4 w-4" />}
                {editingId ? 'Mettre à jour' : "Créer l'offre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryOffersPanel;
