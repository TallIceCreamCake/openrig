import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Save, Package, Info, ListChecks, FileText } from 'lucide-react';
import { Equipment } from '../../types/equipment';
import { useTranslation } from '../../context/TranslationContext';
import { cn } from '../../utils/cn';
import PackEquipmentSelectionModal from './PackEquipmentSelectionModal';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { isAutoEntrepreneurMode } from '../../utils/accountingMode';
import EquipmentImageField from '../equipment/EquipmentImageField';

type PackItemDraft = {
  equipment_id: string;
  quantity: string;
};

type PackCreatePayload = {
  name: string;
  rental_price_ht: number;
  rental_price_ttc: number;
  image_url: string | null;
  overview: string | null;
  highlights: string | null;
  conditions: string | null;
  items: Array<{ equipment_id: string; quantity: number }>;
};

type PackCreateWizardProps = {
  equipmentOptions: Equipment[];
  onSubmit: (payload: PackCreatePayload) => void | Promise<void>;
};

type WizardStep = {
  id: 'general' | 'items' | 'details' | 'summary';
  name: string;
  icon: typeof Info;
};

const parseNumber = (value: string) => {
  const normalized = value.replace(',', '.').trim();
  if (!normalized.length) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const PackCreateWizard: React.FC<PackCreateWizardProps> = ({ equipmentOptions, onSubmit }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [priceHt, setPriceHt] = useState('');
  const [tva, setTva] = useState('20');
  const [imageUrl, setImageUrl] = useState('');
  const [overview, setOverview] = useState('');
  const [highlights, setHighlights] = useState('');
  const [conditions, setConditions] = useState('');
  const [selectedItems, setSelectedItems] = useState<PackItemDraft[]>([]);
  const [isSelectionOpen, setIsSelectionOpen] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<{ name?: string; priceHt?: string }>(() => ({}));
  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(companySettings);

  const steps = useMemo<WizardStep[]>(() => ([
    { id: 'general', name: t('pack.wizard.steps.general'), icon: Info },
    { id: 'items', name: t('pack.wizard.steps.items'), icon: ListChecks },
    { id: 'details', name: t('pack.wizard.steps.details'), icon: FileText },
    { id: 'summary', name: t('pack.wizard.steps.summary'), icon: Package },
  ]), [t]);

  const progress = ((step + 1) / steps.length) * 100;
  const currentStep = steps[step];

  const selectedEquipmentIds = useMemo(
    () => new Set(selectedItems.map((item) => item.equipment_id)),
    [selectedItems],
  );

  const tvaValue = parseNumber(tva) ?? 0;
  const enteredPriceValue = parseNumber(priceHt) ?? 0;
  const priceHtValue = autoEntrepreneurMode ? enteredPriceValue : enteredPriceValue;
  const priceTtcValue = useMemo(
    () => (autoEntrepreneurMode ? enteredPriceValue : +(enteredPriceValue * (1 + tvaValue / 100)).toFixed(2)),
    [autoEntrepreneurMode, enteredPriceValue, tvaValue]
  );

  const updateItemQuantity = (equipmentId: string, quantity: string) => {
    setSelectedItems((prev) => prev.map((item) => {
      if (item.equipment_id !== equipmentId) return item;
      const parsed = parseNumber(quantity) ?? 0;
      const maxAvailable = availabilityMap[equipmentId];
      const allowedMax = typeof maxAvailable === 'number' ? Math.max(0, maxAvailable) : Infinity;
      const next = Math.max(1, Math.min(allowedMax, Math.floor(parsed)));
      return { ...item, quantity: String(next) };
    }));
  };

  const removeItem = (equipmentId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.equipment_id !== equipmentId));
  };

  useEffect(() => {
    const loadAvailability = async () => {
      const ids = Array.from(new Set(selectedItems.map((item) => item.equipment_id).filter(Boolean)));
      if (ids.length === 0) {
        setAvailabilityMap({});
        return;
      }
      try {
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
        setAvailabilityMap(map);
      } catch (error) {
        console.error('availability rpc error', error);
      }
    };
    void loadAvailability();
  }, [selectedItems]);

  const validateGeneral = () => {
    const nextErrors: { name?: string; priceHt?: string } = {};
    if (!name.trim()) nextErrors.name = t('pack.wizard.validation.nameRequired');
    if (priceHt.trim().length === 0 || parseNumber(priceHt) === null) {
      nextErrors.priceHt = t('pack.wizard.validation.priceRequired');
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const next = () => {
    if (currentStep.id === 'general' && !validateGeneral()) return;
    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const prev = () => setStep((prev) => Math.max(prev - 1, 0));

  const submit = async () => {
    if (!validateGeneral()) return;
    for (const item of selectedItems) {
      const maxAvailable = availabilityMap[item.equipment_id];
      if (typeof maxAvailable === 'number') {
        const quantityValue = Math.max(1, Math.floor(parseNumber(item.quantity) ?? 1));
        if (quantityValue > maxAvailable) {
          const eq = equipmentOptions.find((opt) => opt.id === item.equipment_id);
          toast.error(t('rentals.selection.toast.insufficientStock', {
            name: eq?.name || t('pack.detail.contents.emptyValue'),
            count: maxAvailable,
          }));
          return;
        }
      }
    }
    const payload: PackCreatePayload = {
      name: name.trim(),
      rental_price_ht: autoEntrepreneurMode ? priceTtcValue : priceHtValue,
      rental_price_ttc: priceTtcValue,
      image_url: imageUrl.trim() ? imageUrl.trim() : null,
      overview: overview.trim() ? overview.trim() : null,
      highlights: highlights.trim() ? highlights.trim() : null,
      conditions: conditions.trim() ? conditions.trim() : null,
      items: selectedItems.map((item) => ({
        equipment_id: item.equipment_id,
        quantity: Math.max(1, Math.floor(parseNumber(item.quantity) ?? 1)),
      })),
    };
    await onSubmit(payload);
  };

  const renderStep = () => {
    const StepIcon = currentStep.icon as any;
    switch (currentStep.id) {
      case 'general':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('pack.wizard.fields.name.label')}</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('pack.wizard.fields.name.placeholder')}
                className={cn(
                  'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500',
                  errors.name && 'border-red-500'
                )}
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              <p className="text-xs text-gray-500 mt-1">{t('pack.wizard.fields.name.hint')}</p>
            </div>
            <div>
              <EquipmentImageField
                value={imageUrl}
                onChange={setImageUrl}
                scope="pack"
                label={t('pack.wizard.fields.image.label')}
                placeholder={t('pack.wizard.fields.image.placeholder')}
                helpText={t('pack.wizard.fields.image.hint')}
                previewHeightClassName="h-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {autoEntrepreneurMode ? t('pack.wizard.fields.priceTtc.label') : t('pack.wizard.fields.priceHt.label')}
              </label>
              <input
                type="number"
                step="0.01"
                value={priceHt}
                onChange={(event) => setPriceHt(event.target.value)}
                placeholder={t('pack.wizard.fields.priceHt.placeholder')}
                className={cn(
                  'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500',
                  errors.priceHt && 'border-red-500'
                )}
              />
              {errors.priceHt && <p className="text-xs text-red-600 mt-1">{errors.priceHt}</p>}
            </div>
            {!autoEntrepreneurMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('pack.wizard.fields.vat.label')}</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={tva}
                  onChange={(event) => setTva(event.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            )}
            {!autoEntrepreneurMode && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">{t('pack.wizard.fields.priceTtc.label')}</label>
                <input
                  type="number"
                  value={priceTtcValue}
                  readOnly
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-700"
                />
                <p className="text-xs text-gray-500 mt-1">{t('pack.wizard.fields.priceTtc.hint')}</p>
              </div>
            )}
            {autoEntrepreneurMode && (
              <div className="md:col-span-2 text-xs text-gray-500">Mode auto-entrepreneur: saisie TTC uniquement.</div>
            )}
            <div className="md:col-span-2 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              <div className="flex items-center gap-2">
                <StepIcon className="h-4 w-4" />
                <span>{t('pack.wizard.general.tip')}</span>
              </div>
            </div>
          </div>
        );
      case 'items':
        return (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t('pack.wizard.items.title')}</h3>
                <p className="text-xs text-gray-500">{t('pack.wizard.items.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSelectionOpen(true)}
                className="inline-flex items-center rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                {t('pack.detail.contents.actions.add')}
              </button>
            </div>
            {selectedItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                {t('pack.wizard.items.empty')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">{t('pack.detail.contents.columns.name')}</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">{t('pack.detail.contents.columns.type')}</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">{t('pack.detail.contents.columns.quantity')}</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">{t('pack.detail.contents.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {selectedItems.map((item) => {
                      const eq = equipmentOptions.find((opt) => opt.id === item.equipment_id);
                      const maxAvailable = availabilityMap[item.equipment_id];
                      const availabilityLabel = typeof maxAvailable === 'number'
                        ? (maxAvailable <= 0
                          ? t('rentals.selection.status.none')
                          : t('rentals.selection.status.available', { count: maxAvailable }))
                        : t('rentals.selection.status.checking');
                      return (
                        <tr key={item.equipment_id}>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{eq?.name || t('pack.detail.contents.emptyValue')}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {eq?.type || t('pack.detail.contents.emptyValue')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={1}
                              step="1"
                              max={typeof maxAvailable === 'number' ? Math.max(1, maxAvailable) : undefined}
                              value={item.quantity}
                              onChange={(event) => updateItemQuantity(item.equipment_id, event.target.value)}
                              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-right focus:border-blue-500 focus:ring-blue-500"
                            />
                            <div className="text-xs text-gray-400">{availabilityLabel}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(item.equipment_id)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              {t('pack.detail.contents.actions.remove')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      case 'details':
        return (
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('pack.wizard.details.overview.label')}</label>
              <textarea
                rows={4}
                value={overview}
                onChange={(event) => setOverview(event.target.value)}
                placeholder={t('pack.wizard.details.overview.placeholder')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('pack.wizard.details.highlights.label')}</label>
              <textarea
                rows={3}
                value={highlights}
                onChange={(event) => setHighlights(event.target.value)}
                placeholder={t('pack.wizard.details.highlights.placeholder')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('pack.wizard.details.conditions.label')}</label>
              <textarea
                rows={3}
                value={conditions}
                onChange={(event) => setConditions(event.target.value)}
                placeholder={t('pack.wizard.details.conditions.placeholder')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        );
      case 'summary':
        return (
          <div className="space-y-4">
            <h3 className="text-md font-medium text-gray-900">{t('pack.wizard.summary.title')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('pack.wizard.summary.sections.general')}</div>
                <div className="text-sm text-gray-700">{name || '—'}</div>
                <div className="text-sm text-gray-700">{priceTtcValue.toFixed(2)} €</div>
              </div>
              <div className="border rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('pack.wizard.summary.sections.items')}</div>
                {selectedItems.length === 0 ? (
                  <div className="text-sm text-gray-500">{t('pack.wizard.items.empty')}</div>
                ) : (
                  <ul className="text-sm text-gray-700 space-y-1">
                    {selectedItems.map((item) => {
                      const eq = equipmentOptions.find((opt) => opt.id === item.equipment_id);
                      return (
                        <li key={item.equipment_id}>{eq?.name || '—'} · {Math.max(1, Number(item.quantity) || 1)}</li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="border rounded-lg p-4 md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('pack.wizard.summary.sections.details')}</div>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{overview || '—'}</p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="bg-white rounded-lg shadow"
      >
        <div className="px-6 pt-5">
          <div className="mb-4">
            <div className="h-2 bg-gray-200 rounded">
              <div className="h-2 bg-blue-600 rounded" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              {t('pack.wizard.progress', { current: step + 1, total: steps.length, name: steps[step].name })}
            </div>
          </div>
        </div>
        <div className="p-6">
          {renderStep()}
        </div>
        <div className="px-6 pb-5 flex justify-between">
          <button
            type="button"
            onClick={prev}
            disabled={step === 0}
            className={cn(
              'inline-flex items-center px-4 py-2 rounded-md border',
              step === 0 ? 'border-gray-200 text-gray-300' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            )}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> {t('pack.wizard.controls.previous')}
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              {t('pack.wizard.controls.next')} <ArrowRight className="h-4 w-4 ml-2" />
            </button>
          ) : (
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <Save className="h-4 w-4 mr-2" /> {t('pack.wizard.controls.submit')}
            </button>
          )}
        </div>
      </form>
      <PackEquipmentSelectionModal
        isOpen={isSelectionOpen}
        onClose={() => setIsSelectionOpen(false)}
        existingEquipment={selectedEquipmentIds}
        alreadySelected={selectedItems.map((item) => ({
          equipment_id: item.equipment_id,
          quantity: Math.max(1, Math.floor(parseNumber(item.quantity) ?? 1)),
        }))}
        onSelect={(equipmentRow, quantity) => {
          setSelectedItems((prev) => [
            ...prev,
            { equipment_id: equipmentRow.id, quantity: String(quantity) },
          ]);
          setIsSelectionOpen(false);
        }}
      />
    </>
  );
};

export default PackCreateWizard;
