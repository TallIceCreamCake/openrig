import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Euro, ListChecks, Image as ImageIcon, ArrowLeft, ArrowRight, Save, Package, Globe } from 'lucide-react';
import { Equipment } from '../../types/equipment';
import { useForm } from 'react-hook-form';
import { useWarehouses } from '../../hooks/useWarehouses';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';
import { useTranslation } from '../../context/TranslationContext';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { isAutoEntrepreneurMode } from '../../utils/accountingMode';
import EquipmentImageField from './EquipmentImageField';

type FormData = Partial<Equipment> & {
  quantity?: number;
  inventory_category?: 'series' | 'vrac' | 'consommable';
  stock_quantity?: number;
  stock_warehouse_id?: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  internal_location?: string | null;
};
interface SerialRow {
  serial: string;
  warehouse_id: string;
  internal_location: string;
  internal_location_override: boolean;
}
interface AccessoryRow {
  id: string;
  name: string;
  quantity: string;
  imageUrl: string;
  description: string;
}

interface WizardProps {
  onSubmit: (
    data: Partial<Equipment>,
    serials: string[],
    stock?: { warehouse_id: string; quantity: number }[],
    serialRows?: { serial: string; warehouse_id: string; internal_location: string | null; internal_location_override: boolean }[],
    accessories?: { name: string; quantity: number; imageUrl?: string | null; description?: string | null }[]
  ) => void | Promise<void>;
}

type WizardStep = {
  id: 'general' | 'pricing' | 'serials' | 'media' | 'accessories' | 'summary';
  name: string;
  icon: typeof Info;
};

const parseAccessoryImageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const [first] = trimmed.split(/[\n,]+/);
  const normalized = first.trim();
  return normalized.length ? normalized : null;
};

const EquipmentCreateWizard: React.FC<WizardProps> = ({ onSubmit }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [serialRows, setSerialRows] = useState<SerialRow[]>([
    { serial: '', warehouse_id: 'default', internal_location: '', internal_location_override: false },
  ]);
  const [accessoryRows, setAccessoryRows] = useState<AccessoryRow[]>([]);
  const [tva, setTva] = useState<number>(20);
  const { warehouses } = useWarehouses();
  const { categories, loading: categoriesLoading } = useEquipmentCategories();
  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(companySettings);

  const { register, handleSubmit, watch, setValue, trigger, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: {
      name: '', type: '', subtype: '',
      rental_price_ht: 0, rental_price_ttc: 0, purchase_price: 0, purchase_date: '',
      image_url: '', description: '', quantity: 1,
      inventory_category: 'series',
      stock_quantity: 0,
      stock_warehouse_id: 'default',
      category_id: '',
      subcategory_id: '',
      internal_location: '',
      is_public: false,
    }
  });

  const inventoryCategory = watch('inventory_category') || 'series';
  const quantity = watch('quantity') || 0;
  const stockQuantity = watch('stock_quantity') || 0;
  const stockWarehouseId = watch('stock_warehouse_id') || 'default';
  const equipmentInternalLocation = (watch('internal_location') || '').trim();
  const categoryId = watch('category_id') || '';
  const subcategoryId = watch('subcategory_id') || '';
  const ttcInput = watch('rental_price_ttc') || 0;
  const ht = watch('rental_price_ht') || 0;
  const steps = useMemo<WizardStep[]>(() => ([
    { id: 'general', name: t('equipment.wizard.steps.general'), icon: Info },
    { id: 'pricing', name: t('equipment.wizard.steps.pricing'), icon: Euro },
    {
      id: 'serials',
      name: inventoryCategory === 'series'
        ? t('equipment.wizard.steps.serials.series')
        : t('equipment.wizard.steps.serials.stock'),
      icon: ListChecks,
    },
    { id: 'media', name: t('equipment.wizard.steps.media'), icon: ImageIcon },
    { id: 'accessories', name: t('equipment.wizard.steps.accessories'), icon: Package },
    { id: 'summary', name: t('equipment.wizard.steps.summary'), icon: Info },
  ]), [inventoryCategory, t]);
  const progress = ((step + 1) / steps.length) * 100;
  const currentStep = steps[step];
  const selectedCategory = useMemo(() => categories.find((cat) => cat.id === categoryId) || null, [categories, categoryId]);
  const availableSubcategories = selectedCategory?.subcategories ?? [];
  const selectedSubcategory = useMemo(
    () => availableSubcategories.find((sub) => sub.id === subcategoryId) || null,
    [availableSubcategories, subcategoryId],
  );
  const ttcComputed = useMemo(() => {
    if (autoEntrepreneurMode) {
      return Number(ttcInput) || 0;
    }
    const nht = Number(ht) || 0;
    const rate = Number(tva) || 0;
    return +(nht * (1 + rate / 100)).toFixed(2);
  }, [autoEntrepreneurMode, ht, ttcInput, tva]);

  const addAccessoryRow = () => {
    setAccessoryRows((prev) => [
      ...prev,
      {
        id: `acc-${Math.random().toString(36).slice(2, 9)}`,
        name: '',
        quantity: '1',
        imageUrl: '',
        description: '',
      },
    ]);
  };

  const updateAccessoryRow = (id: string, patch: Partial<AccessoryRow>) => {
    setAccessoryRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeAccessoryRow = (id: string) => {
    setAccessoryRows((prev) => prev.filter((row) => row.id !== id));
  };

  useEffect(() => {
    if (inventoryCategory !== 'series') {
      setSerialRows([]);
      setValue('quantity', 0 as any);
      return;
    }
    const q = Math.max(0, Math.floor(Number(quantity) || 0));
    setValue('quantity', q as any);
    setSerialRows(prev => (q > prev.length
      ? [
          ...prev,
          ...Array(q - prev.length).fill(null).map(() => ({
            serial: '',
            warehouse_id: 'default',
            internal_location: equipmentInternalLocation,
            internal_location_override: false,
          })),
        ]
      : prev.slice(0, q)));
  }, [equipmentInternalLocation, inventoryCategory, quantity, setValue]);

  useEffect(() => {
    setSerialRows((prev) =>
      prev.map((row) =>
        row.internal_location_override
          ? row
          : { ...row, internal_location: equipmentInternalLocation },
      ),
    );
  }, [equipmentInternalLocation]);

  useEffect(() => {
    if (!categories.length) {
      return;
    }
    if (!categoryId || !categories.some((cat) => cat.id === categoryId)) {
      setValue('category_id', categories[0].id);
    }
  }, [categories, categoryId, setValue]);

  useEffect(() => {
    if (!categoryId) {
      if (subcategoryId) setValue('subcategory_id', '');
      return;
    }
    const available = availableSubcategories;
    if (!available.length) {
      if (subcategoryId) setValue('subcategory_id', '');
      return;
    }
    if (subcategoryId && available.some((sub) => sub.id === subcategoryId)) return;
    setValue('subcategory_id', available[0].id);
  }, [categoryId, availableSubcategories, subcategoryId, setValue]);

  const validateCurrentStep = async (): Promise<boolean> => {
    switch (currentStep.id) {
      case 'general':
        return await trigger(['name', 'category_id']);
      case 'pricing':
        return await trigger([autoEntrepreneurMode ? 'rental_price_ttc' : 'rental_price_ht']);
      case 'serials': {
        if (inventoryCategory !== 'series') {
          return stockQuantity >= 0;
        }
        const q = quantity || 0;
        if (q <= 0) return true;
        const allSerials = serialRows.length === q && serialRows.every(r => r.serial && r.serial.trim().length > 0);
        const allWarehouses = serialRows.length === q && serialRows.every(r => !!r.warehouse_id);
        return allSerials && allWarehouses;
      }
      // Stock consolidé dans 'serials'
      case 'media':
        return true;
      case 'accessories':
        return true;
    }
  };

  const next = async () => {
    const ok = await validateCurrentStep();
    if (!ok) return;
    setStep(s => Math.min(s + 1, steps.length - 1));
  };
  const prev = () => setStep(s => Math.max(s - 1, 0));

  // Anti auto-submit guard: when the summary step appears, the "Next" button
  // is replaced in place by the submit button — the second click of a
  // double-click (or an Enter keypress) used to land on it and validate the
  // creation without the user asking anything.
  const summaryArmedAtRef = useRef(0);
  useEffect(() => {
    if (currentStep.id === 'summary') {
      summaryArmedAtRef.current = Date.now();
    }
  }, [currentStep.id]);

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Enter in a field on an intermediate step: go to the next step instead
    // of validating the whole creation.
    if (step < steps.length - 1) {
      event.preventDefault();
      void next();
      return;
    }
    // Ignore a submission landing less than 400 ms after the summary step
    // appeared: it is the tail of a double-click on "Next", not a real intent.
    if (Date.now() - summaryArmedAtRef.current < 400) {
      event.preventDefault();
      return;
    }
    void submit(event);
  };

  const submit = handleSubmit(async (data) => {
    const trimmedSerials = inventoryCategory === 'series'
      ? serialRows.map(r => r.serial).filter(s => s && s.trim().length > 0)
      : [];
    const resolvedWarehouse = inventoryCategory === 'series' ? null : (data.stock_warehouse_id || 'default');
    const resolvedStockQuantity = inventoryCategory === 'series' ? 0 : Math.max(0, Number(data.stock_quantity) || 0);
    const payload: Partial<Equipment> = {
      name: data.name?.trim() || '',
      rental_price_ttc: Number(ttcComputed) || 0,
      rental_price_ht: autoEntrepreneurMode ? (Number(ttcComputed) || 0) : (Number(data.rental_price_ht) || 0),
      status: 'available',
      image_url: data.image_url || null,
      description: data.description || null,
      internal_location: data.internal_location?.trim() || null,
      purchase_date: data.purchase_date || null,
      purchase_price: Number(data.purchase_price) || 0,
      inventory_category: inventoryCategory,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
      type: selectedCategory?.name || '',
      subtype: selectedSubcategory?.name || null,
      serial_number: inventoryCategory === 'series' && trimmedSerials.length
        ? trimmedSerials.join(', ')
        : null,
      is_public: data.is_public ?? false,
    } as Partial<Equipment>;
    let stock: { warehouse_id: string; quantity: number }[] = [];
    if (inventoryCategory === 'series') {
      const stockMap = new Map<string, number>();
      for (const r of serialRows) {
        if (!r.warehouse_id) continue;
        stockMap.set(r.warehouse_id, (stockMap.get(r.warehouse_id) || 0) + 1);
      }
      stock = Array.from(stockMap.entries()).map(([warehouse_id, quantity]) => ({ warehouse_id, quantity }));
    } else if (resolvedStockQuantity > 0) {
      stock = [{ warehouse_id: resolvedWarehouse || 'default', quantity: resolvedStockQuantity }];
    }
    const accessories = accessoryRows
      .map((row) => ({
        name: row.name.trim(),
        quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
        imageUrl: parseAccessoryImageUrl(row.imageUrl),
        description: row.description.trim() ? row.description.trim() : null,
      }))
      .filter((row) => row.name.length > 0);
    await onSubmit(
      payload,
      trimmedSerials,
      stock,
      inventoryCategory === 'series'
        ? serialRows.map((row) => ({
            serial: row.serial.trim(),
            warehouse_id: row.warehouse_id,
            internal_location: row.internal_location.trim() || null,
            internal_location_override: row.internal_location_override,
          }))
        : undefined,
      accessories
    );
  });

  const renderStep = () => {
    const StepIcon = currentStep.icon as any;
    const serialsInvalid = inventoryCategory === 'series' && (quantity || 0) > 0 && serialRows.some(s => !s.serial || !s.serial.trim() || !s.warehouse_id);
    switch (currentStep.id) {
      case 'general':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.name.label')}</label>
              <input
                type="text"
                placeholder={t('equipment.wizard.fields.name.placeholder')}
                {...register('name', { required: t('equipment.wizard.validation.nameRequired') })}
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${errors.name ? 'border-red-500' : ''}`}
              />
              <p className="text-xs text-gray-500 mt-1">{t('equipment.wizard.fields.name.hint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.category.label')}</label>
              <select
                {...register('category_id', { required: t('equipment.wizard.validation.categoryRequired') })}
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${errors.category_id ? 'border-red-500' : ''}`}
                disabled={categoriesLoading || categories.length === 0}
              >
                <option value="">{categoriesLoading ? t('common.loading') : t('equipment.wizard.fields.category.placeholder')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {errors.category_id && <p className="text-xs text-red-600 mt-1">{errors.category_id.message?.toString()}</p>}
              {categories.length === 0 && !categoriesLoading && (
                <p className="text-xs text-gray-500 mt-1">{t('equipment.wizard.fields.category.noData')}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.subcategory.label')}</label>
              <select
                {...register('subcategory_id')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                disabled={!selectedCategory || availableSubcategories.length === 0}
              >
                <option value="">{t('equipment.wizard.fields.subcategory.none')}</option>
                {availableSubcategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.inventoryCategory.label')}</label>
              <select
                {...register('inventory_category', { required: true })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="series">{t('equipment.common.inventoryCategory.series')}</option>
                <option value="vrac">{t('equipment.common.inventoryCategory.bulk')}</option>
                <option value="consommable">{t('equipment.common.inventoryCategory.consumable')}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {inventoryCategory === 'series'
                  ? t('equipment.wizard.fields.inventoryCategory.seriesHint')
                  : inventoryCategory === 'vrac'
                    ? t('equipment.wizard.fields.inventoryCategory.bulkHint')
                    : t('equipment.wizard.fields.inventoryCategory.consumableHint')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Emplacement interne</label>
              <input
                type="text"
                placeholder="Ex: Rack A / Etage 2 / Bac 14"
                {...register('internal_location')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Emplacement fin interne par défaut du matériel.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.description.label')}</label>
              <textarea
                rows={3}
                placeholder={t('equipment.wizard.fields.description.placeholder')}
                {...register('description')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <div className="mt-2 text-xs text-gray-500">{t('equipment.wizard.fields.description.hint')}</div>
            </div>
            {companySettings?.features?.client_portal && (
              <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Produit public</p>
                    <p className="text-xs text-gray-500">Visible dans l'espace client pour les demandes de projet</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('is_public', !watch('is_public'))}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${watch('is_public') ? 'bg-emerald-500' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${watch('is_public') ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            )}
          </div>
        );
      case 'pricing':
        return (
          autoEntrepreneurMode ? (
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.ttc.label')}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={t('equipment.wizard.fields.rentalPriceHt.placeholder')}
                  {...register('rental_price_ttc', { valueAsNumber: true, required: t('equipment.wizard.validation.rentalPriceRequired') })}
                  className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${errors.rental_price_ttc ? 'border-red-500' : ''}`}
                />
              </div>
              <div className="text-xs text-gray-500">
                Mode auto-entrepreneur: montant saisi en TTC, sans calcul de TVA.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.rentalPriceHt.label')}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={t('equipment.wizard.fields.rentalPriceHt.placeholder')}
                  {...register('rental_price_ht', { valueAsNumber: true, required: t('equipment.wizard.validation.rentalPriceRequired') })}
                  className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${errors.rental_price_ht ? 'border-red-500' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.vat.label')}</label>
                <input type="number" step="0.1" min={0} value={tva} onChange={(e) => setTva(parseFloat(e.target.value) || 0)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.ttc.label')}</label>
                <input type="number" step="0.01" value={ttcComputed} readOnly className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 text-gray-700" />
              </div>
              <div className="md:col-span-3 text-xs text-gray-500">{t('equipment.wizard.tips.pricing')}</div>
            </div>
          )
        );
      case 'serials':
        if (inventoryCategory !== 'series') {
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.stockInitial.label')}</label>
                  <input
                    type="number"
                    min={0}
                    placeholder={t('equipment.wizard.fields.stockInitial.placeholder')}
                    {...register('stock_quantity', {
                      valueAsNumber: true,
                      min: { value: 0, message: t('equipment.wizard.validation.stockQuantityPositive') },
                    })}
                    className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${errors.stock_quantity ? 'border-red-500' : ''}`}
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('equipment.wizard.fields.stockInitial.hint')}</p>
                  {errors.stock_quantity && <p className="text-xs text-red-600 mt-1">{errors.stock_quantity.message?.toString()}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.stockWarehouse.primaryLabel')}</label>
                  <select
                    {...register('stock_warehouse_id')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="default">{t('equipment.wizard.fields.stockWarehouse.defaultPrimaryOption')}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{t('equipment.wizard.fields.stockWarehouse.hint')}</p>
                </div>
              </div>
              <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                {inventoryCategory === 'consommable'
                  ? t('equipment.wizard.guidance.consumable')
                  : t('equipment.wizard.guidance.bulk')}
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('equipment.wizard.fields.quantity.label')}</label>
                <input
                  type="number"
                  min={0}
                  placeholder={t('equipment.wizard.fields.quantity.placeholder')}
                  {...register('quantity', {
                    valueAsNumber: true,
                    validate: (value) =>
                      (inventoryCategory !== 'series' || (value ?? 0) > 0) ||
                      t('equipment.wizard.validation.quantityRequired'),
                  })}
                  className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${errors.quantity ? 'border-red-500' : ''}`}
                />
                <p className="text-xs text-gray-500 mt-1">{t('equipment.wizard.fields.quantity.hint')}</p>
                {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity.message?.toString()}</p>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">{t('equipment.wizard.serials.table.index')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('equipment.wizard.serials.table.serial')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('equipment.wizard.serials.table.warehouse')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emplacement</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {serialRows.length === 0 && (
                    <tr><td className="px-6 py-6 text-center text-sm text-gray-500" colSpan={4}>{t('equipment.wizard.serials.table.empty')}</td></tr>
                  )}
                  {serialRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-2 text-sm text-gray-500">{idx + 1}</td>
                      <td className="px-6 py-2">
                        <input
                          type="text"
                          value={row.serial}
                          onChange={(e) => setSerialRows(prev => prev.map((s, i) => i === idx ? { ...s, serial: e.target.value } : s))}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder={t('equipment.wizard.serials.table.serialPlaceholder')}
                        />
                      </td>
                      <td className="px-6 py-2">
                        <select
                          value={row.warehouse_id}
                          onChange={(e) => setSerialRows(prev => prev.map((s, i) => i === idx ? { ...s, warehouse_id: e.target.value } : s))}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          <option value="default">{t('equipment.wizard.fields.stockWarehouse.defaultOption')}</option>
                          {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-2">
                        <div className="space-y-2">
                          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={row.internal_location_override}
                              onChange={(e) =>
                                setSerialRows((prev) =>
                                  prev.map((current, currentIndex) =>
                                    currentIndex === idx
                                      ? {
                                          ...current,
                                          internal_location_override: e.target.checked,
                                          internal_location: e.target.checked
                                            ? current.internal_location || equipmentInternalLocation
                                            : equipmentInternalLocation,
                                        }
                                      : current,
                                  ),
                                )
                              }
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Emplacement personnalisé
                          </label>
                          <input
                            type="text"
                            value={row.internal_location}
                            onChange={(e) =>
                              setSerialRows((prev) =>
                                prev.map((current, currentIndex) =>
                                  currentIndex === idx
                                    ? {
                                        ...current,
                                        internal_location_override: true,
                                        internal_location: e.target.value,
                                      }
                                    : current,
                                ),
                              )
                            }
                            disabled={!row.internal_location_override}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                            placeholder={equipmentInternalLocation || 'Même emplacement que le matériel'}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {serialsInvalid && (
              <div className="text-sm text-red-600">{t('equipment.wizard.validation.serialsIncomplete')}</div>
            )}
          </div>
        );
      case 'media':
        return (
          <div className="max-w-3xl">
            <EquipmentImageField
              value={watch('image_url') || ''}
              onChange={(nextValue) => setValue('image_url', nextValue, { shouldDirty: true })}
              scope="equipment"
              label={t('equipment.wizard.fields.imageUrl.label')}
              placeholder={t('equipment.wizard.fields.imageUrl.placeholder')}
              helpText={t('equipment.wizard.fields.imageUrl.hint')}
              previewLabel={t('equipment.wizard.media.preview.label')}
              emptyLabel={t('equipment.wizard.media.preview.empty')}
              previewHeightClassName="h-48"
            />
          </div>
        );
      case 'accessories':
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t('equipment.wizard.accessories.title')}</h3>
                <p className="text-xs text-gray-500">{t('equipment.wizard.accessories.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={addAccessoryRow}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                + {t('equipment.wizard.accessories.actions.add')}
              </button>
            </div>
            {accessoryRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                {t('equipment.wizard.accessories.empty')}
              </div>
            ) : (
              <div className="space-y-4">
                {accessoryRows.map((row, index) => (
                  <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {t('equipment.wizard.accessories.itemLabel', { index: index + 1 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAccessoryRow(row.id)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        {t('equipment.wizard.accessories.actions.remove')}
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {t('equipment.wizard.accessories.fields.name')}
                        </label>
                        <input
                          type="text"
                          value={row.name}
                          onChange={(event) => updateAccessoryRow(row.id, { name: event.target.value })}
                          placeholder={t('equipment.wizard.accessories.placeholders.name')}
                          className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {t('equipment.wizard.accessories.fields.quantity')}
                        </label>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          value={row.quantity}
                          onChange={(event) => updateAccessoryRow(row.id, { quantity: event.target.value })}
                          placeholder="1"
                          className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <EquipmentImageField
                          value={row.imageUrl}
                          onChange={(nextValue) => updateAccessoryRow(row.id, { imageUrl: nextValue })}
                          scope="accessory"
                          label={t('equipment.wizard.accessories.fields.image')}
                          placeholder={t('equipment.wizard.accessories.placeholders.image')}
                          helpText={t('equipment.wizard.accessories.hints.image')}
                          emptyLabel={t('equipment.wizard.media.preview.empty')}
                          previewHeightClassName="h-32"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {t('equipment.wizard.accessories.fields.description')}
                        </label>
                        <textarea
                          rows={3}
                          value={row.description}
                          onChange={(event) => updateAccessoryRow(row.id, { description: event.target.value })}
                          placeholder={t('equipment.wizard.accessories.placeholders.description')}
                          className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'summary':
        return (
          <div className="space-y-4">
            <h3 className="text-md font-medium text-gray-900">{t('equipment.wizard.summary.title')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('equipment.wizard.summary.sections.general')}</h4>
                <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.name')}:</span> {watch('name') || '-'}</p>
                <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.category')}:</span> {selectedCategory?.name || '-'}</p>
                <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.subcategory')}:</span> {selectedSubcategory?.name || '-'}</p>
                <p className="text-sm text-gray-700"><span className="text-gray-500">Emplacement interne:</span> {equipmentInternalLocation || '-'}</p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">{t('equipment.wizard.summary.labels.inventoryMode')}:</span>{' '}
                  {inventoryCategory === 'series'
                    ? t('equipment.wizard.summary.inventoryModes.series')
                    : inventoryCategory === 'vrac'
                      ? t('equipment.wizard.summary.inventoryModes.bulk')
                      : t('equipment.wizard.summary.inventoryModes.consumable')}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('equipment.wizard.summary.sections.pricing')}</h4>
                {!autoEntrepreneurMode && (
                  <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.priceHt')}:</span> {watch('rental_price_ht') || 0} €</p>
                )}
                {!autoEntrepreneurMode && (
                  <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.vat')}:</span> {tva}%</p>
                )}
                <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.priceTtc')}:</span> {ttcComputed.toFixed(2)} €</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('equipment.wizard.summary.sections.inventory')}</h4>
                {inventoryCategory === 'series' ? (
                  <>
                    <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.quantity')}:</span> {quantity || 0}</p>
                    <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.serials')}:</span> {serialRows.length ? serialRows.map(r => r.serial).join(', ') : '-'}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-700"><span className="text-gray-500">{t('equipment.wizard.summary.labels.stockInitial')}:</span> {stockQuantity || 0}</p>
                    <p className="text-sm text-gray-700">
                      <span className="text-gray-500">{t('equipment.wizard.summary.labels.stockWarehouse')}:</span>{' '}
                      {stockWarehouseId === 'default'
                        ? t('equipment.wizard.fields.stockWarehouse.defaultName')
                        : (warehouses.find((w) => w.id === stockWarehouseId)?.name || stockWarehouseId)}
                    </p>
                  </>
                )}
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('equipment.wizard.summary.sections.stock')}</h4>
                {inventoryCategory === 'series'
                  ? (() => {
                      const counts = new Map<string, number>();
                      for (const r of serialRows) {
                        if (!r.warehouse_id) continue;
                        counts.set(r.warehouse_id, (counts.get(r.warehouse_id) || 0) + 1);
                      }
                      const entries = Array.from(counts.entries());
                      if (entries.length === 0) return <p className="text-sm text-gray-500">{t('equipment.wizard.summary.stock.none')}</p>;
                      return (
                        <ul className="text-sm text-gray-700 list-disc ml-4">
                          {entries.map(([wid, qty]) => (
                            <li key={wid}>
                              {wid === 'default'
                                ? t('equipment.wizard.summary.stock.defaultWarehouse')
                                : (warehouses.find(w => w.id === wid)?.name || wid)}: {qty}
                            </li>
                          ))}
                        </ul>
                      );
                    })()
                  : (
                    <p className="text-sm text-gray-700">{t('equipment.wizard.summary.stock.singleWarehouse')}</p>
                  )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('equipment.wizard.summary.sections.media')}</h4>
                <div className="h-40 rounded border border-dashed flex items-center justify-center overflow-hidden bg-gray-50">
                  {watch('image_url') ? (
                    <img src={watch('image_url') || ''} alt="Preview" className="object-cover h-full w-full" />
                  ) : (
                    <span className="text-sm text-gray-400">{t('equipment.wizard.media.preview.empty')}</span>
                  )}
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('equipment.wizard.summary.sections.description')}</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{watch('description') || '-'}</p>
              </div>
              <div className="border rounded-lg p-4 md:col-span-2">
                <h4 className="font-medium mb-2">{t('equipment.wizard.summary.sections.accessories')}</h4>
                {accessoryRows.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('equipment.wizard.accessories.empty')}</p>
                ) : (
                  <ul className="space-y-1 text-sm text-gray-700">
                    {accessoryRows.map((row) => (
                      <li key={row.id}>
                        {row.name || t('equipment.wizard.accessories.placeholders.name')} · {Math.max(1, Number(row.quantity) || 1)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="bg-white rounded-lg shadow">
      <div className="px-6 pt-5">
        <div className="mb-4">
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-blue-600 rounded" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-sm text-gray-600">
            {t('equipment.wizard.progress', { current: step + 1, total: steps.length, name: steps[step].name })}
          </div>
        </div>
      </div>
      <div className="p-6">
        {renderStep()}
      </div>
      <div className="px-6 pb-5 flex justify-between">
        <button type="button" onClick={prev} disabled={step === 0} className={`inline-flex items-center px-4 py-2 rounded-md border ${step === 0 ? 'border-gray-200 text-gray-300' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t('equipment.wizard.controls.previous')}
        </button>
        {step < steps.length - 1 ? (
          <button type="button" onClick={next} className="inline-flex items-center px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700">
            {t('equipment.wizard.controls.next')} <ArrowRight className="h-4 w-4 ml-2" />
          </button>
        ) : (
          <button type="submit" disabled={isSubmitting} className="inline-flex items-center px-4 py-2 rounded-md text-white bg-green-600 hover:bg-green-700">
            <Save className="h-4 w-4 mr-2" /> {t('equipment.wizard.controls.submit')}
          </button>
        )}
      </div>
    </form>
  );
};

export default EquipmentCreateWizard;
