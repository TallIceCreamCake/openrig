import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Equipment } from '../../types/equipment';
import toast from 'react-hot-toast';
import { useTranslation } from '../../context/TranslationContext';

interface EquipmentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (equipment: Equipment, quantity: number) => void;
  onSelectExternal?: (payload: {
    name: string;
    description?: string;
    type: string;
    subtype?: string;
    supplier?: string;
    price_per_day: number;
  }, quantity: number) => void;
  externalTabLabel?: string;
  skipAvailability?: boolean;
  existingEquipment?: Set<string>;
  startDate?: string;
  endDate?: string;
  alreadySelected?: Array<{ equipment_id: string; quantity: number }>;
}

const EquipmentSelectionModal: React.FC<EquipmentSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectExternal,
  externalTabLabel,
}) => {
  const [externalName, setExternalName] = useState('');
  const [externalSupplier, setExternalSupplier] = useState('');
  const [externalDescription, setExternalDescription] = useState('');
  const [externalPrice, setExternalPrice] = useState('');
  const [externalQuantity, setExternalQuantity] = useState(1);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    setExternalName('');
    setExternalSupplier('');
    setExternalDescription('');
    setExternalPrice('');
    setExternalQuantity(1);
  }, [isOpen]);

  const handleExternalSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSelectExternal) return;
    const name = externalName.trim();
    const supplier = externalSupplier.trim();
    const description = externalDescription.trim();
    const priceValue = Number(externalPrice);
    if (!name) {
      toast.error(t('rentals.selection.toast.nameRequired'));
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      toast.error(t('rentals.selection.toast.priceInvalid'));
      return;
    }
    if (!Number.isFinite(externalQuantity) || externalQuantity <= 0) {
      toast.error(t('rentals.selection.toast.quantityInvalid'));
      return;
    }
    onSelectExternal({
      name,
      description: description || undefined,
      type: 'Sous-location',
      supplier: supplier || undefined,
      price_per_day: priceValue,
    }, externalQuantity);
    setExternalName('');
    setExternalSupplier('');
    setExternalDescription('');
    setExternalPrice('');
    setExternalQuantity(1);
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const modal = (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {externalTabLabel || 'Sous-location'}
              </h3>
              <button
                onClick={onClose}
                className="rounded-full p-1 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleExternalSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('rentals.selection.external.nameLabel')}</label>
                  <input
                    value={externalName}
                    onChange={(e) => setExternalName(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('rentals.selection.external.namePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('rentals.selection.external.supplierLabel')}</label>
                  <input
                    value={externalSupplier}
                    onChange={(e) => setExternalSupplier(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('rentals.selection.external.supplierPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('rentals.selection.external.priceLabel')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={externalPrice}
                    onChange={(e) => setExternalPrice(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('rentals.selection.external.pricePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('rentals.selection.external.quantityLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    value={externalQuantity}
                    onChange={(e) => setExternalQuantity(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">{t('rentals.selection.external.descriptionLabel')}</label>
                  <textarea
                    value={externalDescription}
                    onChange={(e) => setExternalDescription(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('rentals.selection.external.descriptionPlaceholder')}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
                  Ajouter la sous-location
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default EquipmentSelectionModal;
