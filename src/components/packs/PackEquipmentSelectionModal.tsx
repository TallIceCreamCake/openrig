import React, { useEffect, useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { Equipment } from '../../types/equipment';
import { useEquipment } from '../../hooks/useEquipment';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { useTranslation } from '../../context/TranslationContext';

type PackEquipmentSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (equipment: Equipment, quantity: number) => void;
  existingEquipment?: Set<string>;
  alreadySelected?: Array<{ equipment_id: string; quantity: number }>;
};

const PackEquipmentSelectionModal: React.FC<PackEquipmentSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  existingEquipment = new Set(),
  alreadySelected = [],
}) => {
  const { equipment, loading } = useEquipment();
  const { t, language } = useTranslation();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [locale]
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
      }),
    [locale]
  );
  const [search, setSearch] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState<Record<string, number>>({});
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [nextReturn, setNextReturn] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSelectedQuantity({});
  }, [isOpen]);

  const filteredEquipment = useMemo(() => {
    const list = (equipment || [])
      .filter((item) => item.type !== 'Pack')
      .filter((item) => !existingEquipment.has(item.id));
    const q = search.toLowerCase();
    if (!q) return list;
    return list.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      (item.subtype && item.subtype.toLowerCase().includes(q))
    );
  }, [equipment, existingEquipment, search]);

  const handleSelect = (equipmentRow: Equipment) => {
    const quantity = selectedQuantity[equipmentRow.id] || 1;
    const avail = availability[equipmentRow.id];
    const selectedQty = alreadySelected.find((a) => a.equipment_id === equipmentRow.id)?.quantity || 0;
    const maxAdd = typeof avail === 'number' ? Math.max(0, avail - selectedQty) : undefined;
    if (typeof maxAdd === 'number') {
      if (maxAdd <= 0) {
        const nr = nextReturn[equipmentRow.id];
        if (nr) {
          const when = dateTimeFormatter.format(new Date(nr));
          toast.error(
            t('rentals.selection.toast.unavailableWithReturn', {
              name: equipmentRow.name,
              date: when,
            })
          );
        } else {
          toast.error(
            t('rentals.selection.toast.unavailable', { name: equipmentRow.name })
          );
        }
        return;
      }
      if (quantity > maxAdd) {
        const nr = nextReturn[equipmentRow.id];
        if (nr) {
          const when = dateTimeFormatter.format(new Date(nr));
          toast.error(
            t('rentals.selection.toast.insufficientStockWithReturn', {
              name: equipmentRow.name,
              count: maxAdd,
              date: when,
            })
          );
        } else {
          toast.error(
            t('rentals.selection.toast.insufficientStock', {
              name: equipmentRow.name,
              count: maxAdd,
            })
          );
        }
        return;
      }
    }
    onSelect(equipmentRow, quantity);
    setSelectedQuantity((prev) => ({ ...prev, [equipmentRow.id]: 1 }));
  };

  useEffect(() => {
    const loadAvailability = async () => {
      try {
        if (!isOpen) return;
        const ids = (equipment || [])
          .filter((item) => item.type !== 'Pack')
          .filter((item) => !existingEquipment.has(item.id))
          .map((item) => item.id);
        if (ids.length === 0) return;
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase.rpc('get_units_availability_for_equipment', {
          p_ids: ids,
          p_start: today,
          p_end: today,
        });
        if (error) throw error;
        const map: Record<string, number> = {};
        const needsFallback = new Set<string>();
        (data || []).forEach((row: any) => {
          const available = Math.max(0, Number(row.available ?? 0));
          map[row.equipment_id] = available;
          if (available <= 0) needsFallback.add(row.equipment_id);
        });
        ids.forEach((id) => {
          if (!(id in map)) needsFallback.add(id);
        });
        if (needsFallback.size > 0) {
          const { data: fallback, error: fallbackErr } = await supabase.rpc('get_availability_for_equipment', {
            p_ids: Array.from(needsFallback),
            p_start: today,
            p_end: today,
          });
          if (fallbackErr) throw fallbackErr;
          (fallback || []).forEach((row: any) => {
            const available = Math.max(0, Number(row.available ?? 0));
            if (!(row.equipment_id in map) || available > map[row.equipment_id]) {
              map[row.equipment_id] = available;
            }
          });
        }

        const idsNeedingUnitCheck = ids.filter((id) => (map[id] ?? 0) <= 0);
        if (idsNeedingUnitCheck.length > 0) {
          const perUnitResults = await Promise.all(idsNeedingUnitCheck.map(async (equipmentId) => {
            const { data: perUnits, error: perErr } = await supabase.rpc('get_available_units', {
              p_equipment_id: equipmentId,
              p_start: today,
              p_end: today,
            });
            if (perErr) {
              console.warn('get_available_units error', equipmentId, perErr);
              return { equipmentId, count: map[equipmentId] ?? 0 };
            }
            const count = Array.isArray(perUnits) ? perUnits.length : 0;
            return { equipmentId, count };
          }));
          perUnitResults.forEach(({ equipmentId, count }) => {
            if (count > (map[equipmentId] ?? 0)) {
              map[equipmentId] = count;
            }
          });
        }

        setAvailability(map);
        const { data: nr, error: nrErr } = await supabase.rpc('get_next_return_for_equipment', {
          p_ids: ids,
          p_start: today,
        });
        if (nrErr) throw nrErr;
        const nrMap: Record<string, string | null> = {};
        (nr || []).forEach((row: any) => { nrMap[row.equipment_id] = row.next_return; });
        setNextReturn(nrMap);
      } catch (error) {
        console.error('availability rpc error', error);
      }
    };
    void loadAvailability();
  }, [equipment, existingEquipment, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[12040] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">{t('rentals.selection.title')}</h3>
              <button
                onClick={onClose}
                className="rounded-full p-1 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('rentals.selection.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading && (
                <div className="py-8 text-center text-sm text-gray-500">{t('rentals.selection.loading')}</div>
              )}
              {!loading && filteredEquipment.length === 0 && (
                <div className="py-8 text-center text-sm text-gray-500">{t('rentals.selection.empty')}</div>
              )}
              {!loading && filteredEquipment.map((item) => {
                const avail = availability[item.id];
                const selectedQty = alreadySelected.find((a) => a.equipment_id === item.id)?.quantity || 0;
                const maxAdd = typeof avail === 'number' ? Math.max(0, avail - selectedQty) : undefined;
                const disabled = typeof maxAdd === 'number' && maxAdd <= 0;
                const availableCount = typeof avail === 'number' ? Math.max(0, avail - selectedQty) : undefined;
                const badgeClass = (() => {
                  if (availableCount === undefined) return 'bg-gray-300';
                  if (availableCount <= 0) return 'bg-red-500';
                  if (availableCount <= 2) return 'bg-orange-500';
                  return 'bg-green-500';
                })();
                const availabilityLabel = (() => {
                  if (availableCount === undefined) return t('rentals.selection.status.checking');
                  if (availableCount <= 0) return t('rentals.selection.status.none');
                  if (availableCount <= 2) return t('rentals.selection.status.limited', { count: availableCount });
                  return t('rentals.selection.status.available', { count: availableCount });
                })();
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 border-b"
                  >
                    <div className="flex items-center space-x-4">
                      <img
                        src={item.image_url || 'https://images.unsplash.com/photo-1606857521015-7f9fcf423740?w=300'}
                        alt={item.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{item.name}</h4>
                        <p className="text-sm text-gray-500">{item.type}</p>
                        <p className="text-xs flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-2.5 h-2.5 rounded-full ${badgeClass}`} />
                          <span className={availableCount === undefined ? 'text-gray-500' : availableCount <= 0 ? 'text-red-600' : availableCount <= 2 ? 'text-orange-600' : 'text-green-600'}>
                            {availabilityLabel}
                          </span>
                        </p>
                        {disabled && nextReturn[item.id] && (
                          <p className="text-xs text-gray-500">
                            {t('rentals.selection.nextReturn', {
                              date: dateTimeFormatter.format(new Date(nextReturn[item.id] as string)),
                            })}
                          </p>
                        )}
                        <p className="text-sm font-medium text-gray-900">
                          {t('rentals.selection.pricePerDay', { amount: currencyFormatter.format(item.rental_price_ttc) })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min={disabled ? 0 : 1}
                        max={disabled ? 0 : (typeof maxAdd === 'number' ? Math.max(1, maxAdd) : undefined)}
                        value={disabled ? 0 : (selectedQuantity[item.id] || 1)}
                        disabled={disabled}
                        onChange={(e) => setSelectedQuantity((prev) => {
                          const raw = parseInt(e.target.value, 10) || 0;
                          const allowedMax = typeof maxAdd === 'number' ? Math.max(0, maxAdd) : Infinity;
                          const allowedMin = disabled ? 0 : 1;
                          const next = Math.max(allowedMin, Math.min(allowedMax, raw));
                          return { ...prev, [item.id]: next };
                        })}
                        className={`w-16 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                      />
                      <button
                        onClick={() => handleSelect(item)}
                        disabled={disabled}
                        className={`px-3 py-1 text-white rounded-md ${disabled ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {t('rentals.selection.addButton')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackEquipmentSelectionModal;
