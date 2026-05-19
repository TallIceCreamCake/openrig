import React from 'react';
import { useForm } from 'react-hook-form';
import { Equipment } from '../../types/equipment';
import { useWarehouses } from '../../hooks/useWarehouses';
import { Plus, Trash2 } from 'lucide-react';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Label from '../ui/Label';
import Button from '../ui/Button';
import { cn } from '../../utils/cn';
import { isAutoEntrepreneurMode } from '../../utils/accountingMode';

export type EquipmentUnitFormRow = {
  id?: string;
  serial: string;
  status: 'available' | 'in_use' | 'maintenance' | 'broken';
  warehouse_id: string | null;
  internal_location?: string | null;
  internal_location_override?: boolean;
  custom_status_id?: string | null;
};

type EquipmentFormValues = Partial<Equipment> & {
  stock_quantity?: number;
  stock_warehouse_id?: string | null;
  internal_location?: string | null;
};

interface EquipmentFormProps {
  onSubmit: (payload: { data: Partial<Equipment>; units: EquipmentUnitFormRow[]; stock?: { warehouse_id: string | null; quantity: number }[] }) => void;
  initialData?: Partial<Equipment>;
  initialUnits?: Array<{ id: string; serial_number: string | null; status: string | null; warehouse_id: string | null; custom_status_id?: string | null }>;
  initialStock?: Array<{ warehouse_id: string | null; quantity: number }>;
}

const EquipmentForm: React.FC<EquipmentFormProps> = ({ onSubmit, initialData, initialUnits, initialStock }) => {
  const defaultStockQuantity = React.useMemo(
    () => (initialStock || []).reduce((sum, row) => sum + (row.quantity || 0), 0),
    [initialStock],
  );
  const defaultStockWarehouse = React.useMemo(() => {
    if (!initialStock || initialStock.length === 0) return 'default';
    return initialStock[0].warehouse_id || 'default';
  }, [initialStock]);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EquipmentFormValues>({
    defaultValues: {
      ...initialData,
      inventory_category: initialData?.inventory_category || 'series',
      stock_quantity: defaultStockQuantity,
      stock_warehouse_id: defaultStockWarehouse,
      category_id: initialData?.category_id || null,
      subcategory_id: initialData?.subcategory_id || null,
      internal_location: initialData?.internal_location || '',
    },
  });
  const { warehouses } = useWarehouses();
  const { categories, loading: categoriesLoading } = useEquipmentCategories();
  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(companySettings);
  const [unitRows, setUnitRows] = React.useState<EquipmentUnitFormRow[]>([]);
  const [unitsError, setUnitsError] = React.useState<string | null>(null);
  const inventoryCategory = watch('inventory_category') || 'series';
  const stockQuantity = watch('stock_quantity') || 0;
  const stockWarehouseId = watch('stock_warehouse_id') || 'default';
  const equipmentInternalLocation = (watch('internal_location') || '').trim();
  const categoryId = watch('category_id') || '';
  const subcategoryId = watch('subcategory_id') || '';
  const selectedCategory = React.useMemo(() => categories.find((cat) => cat.id === categoryId) || null, [categories, categoryId]);
  const availableSubcategories = selectedCategory?.subcategories ?? [];
  const selectedSubcategory = React.useMemo(() => availableSubcategories.find((sub) => sub.id === subcategoryId) || null, [availableSubcategories, subcategoryId]);

  React.useEffect(() => {
    reset({
      ...initialData,
      inventory_category: initialData?.inventory_category || 'series',
      stock_quantity: defaultStockQuantity,
      stock_warehouse_id: defaultStockWarehouse,
      category_id: initialData?.category_id || null,
      subcategory_id: initialData?.subcategory_id || null,
      internal_location: initialData?.internal_location || '',
    });
  }, [initialData, defaultStockQuantity, defaultStockWarehouse, reset]);

  React.useEffect(() => {
    const mapped = (initialUnits || []).map((row) => ({
      id: row.id,
      serial: row.serial_number || '',
      status: (row.status as EquipmentUnitFormRow['status']) || 'available',
      warehouse_id: row.warehouse_id || null,
      internal_location: initialData?.internal_location || null,
      internal_location_override: false,
      custom_status_id: row.custom_status_id || null,
    }));
    setUnitRows(mapped);
  }, [initialUnits, initialData?.id]);

  React.useEffect(() => {
    setUnitRows((prev) =>
      prev.map((row) =>
        row.internal_location_override
          ? row
          : { ...row, internal_location: equipmentInternalLocation || null },
      ),
    );
  }, [equipmentInternalLocation]);

  React.useEffect(() => {
    if (!categories.length) return;
    if (!categoryId || !categories.some((cat) => cat.id === categoryId)) {
      setValue('category_id', categories[0].id, { shouldDirty: true });
    }
  }, [categories, categoryId, setValue]);

  React.useEffect(() => {
    if (!categoryId) {
      if (subcategoryId) setValue('subcategory_id', '', { shouldDirty: true });
      return;
    }
    if (!availableSubcategories.length) {
      if (subcategoryId) setValue('subcategory_id', '', { shouldDirty: true });
      return;
    }
    if (subcategoryId && availableSubcategories.some((sub) => sub.id === subcategoryId)) return;
    setValue('subcategory_id', availableSubcategories[0].id, { shouldDirty: true });
  }, [availableSubcategories, categoryId, subcategoryId, setValue]);

  const addUnitRow = () => {
    setUnitRows((prev) => [
      ...prev,
      {
        serial: '',
        status: 'available',
        warehouse_id: warehouses[0]?.id || null,
        internal_location: equipmentInternalLocation || null,
        internal_location_override: false,
      },
    ]);
  };

  const removeUnitRow = (index: number) => {
    setUnitRows((prev) => prev.filter((_, idx) => idx !== index));
    setUnitsError(null);
  };

  const handleUnitsChange = (index: number, patch: Partial<EquipmentUnitFormRow>) => {
    setUnitRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const submitForm = handleSubmit((formData) => {
    const trimmedUnits = unitRows.map((row) => ({
      ...row,
      serial: row.serial.trim(),
    }));

    if (inventoryCategory === 'series') {
      const invalid = trimmedUnits.some((row) => row.serial.length === 0);
      if (invalid) {
        setUnitsError('Renseignez tous les numéros de série ou supprimez les lignes inutiles.');
        return;
      }
    }
    setUnitsError(null);

    const normalized: Partial<Equipment> = {
      ...formData,
      name: formData.name?.trim() || '',
      image_url: formData.image_url?.trim() || null,
      description: formData.description?.trim() || null,
      internal_location: formData.internal_location?.trim() || null,
      inventory_category: inventoryCategory,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
      type: selectedCategory?.name || '',
      subtype: selectedSubcategory?.name || null,
      serial_number:
        inventoryCategory === 'series'
          ? trimmedUnits.map((row) => row.serial).filter(Boolean).join(', ') || null
          : null,
      rental_price_ttc: Number(formData.rental_price_ttc || 0),
      rental_price_ht: autoEntrepreneurMode
        ? Number(formData.rental_price_ttc || 0)
        : Number(formData.rental_price_ht || 0),
    };
    if (inventoryCategory !== 'series') {
      normalized.serial_number = null;
    }

    const stockPayload = inventoryCategory === 'series'
      ? undefined
      : [{
          warehouse_id: stockWarehouseId === 'default' ? null : stockWarehouseId,
          quantity: Math.max(0, Number(stockQuantity) || 0),
        }];

    onSubmit({
      data: normalized,
      units: inventoryCategory === 'series' ? trimmedUnits : [],
      stock: stockPayload,
    });
  });

  return (
    <form onSubmit={submitForm} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Nom</Label>
        <Input
          id="name"
          type="text"
          {...register('name', { required: 'Le nom est requis' })}
          className={cn(errors.name && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="category_id">Catégorie</Label>
        <Select
          id="category_id"
          {...register('category_id', { required: 'La catégorie est requise' })}
          disabled={categoriesLoading || categories.length === 0}
          className={cn(errors.category_id && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
        >
          <option value="">{categoriesLoading ? 'Chargement…' : 'Sélectionner une catégorie'}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </Select>
        {errors.category_id && <p className="text-sm text-red-600">{errors.category_id.message}</p>}
        {categories.length === 0 && !categoriesLoading && (
          <p className="text-xs text-gray-500">Ajoutez des catégories dans les paramètres d’entreprise.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="inventory_category">Catégorie d'inventaire</Label>
        <Select
          id="inventory_category"
          {...register('inventory_category', { required: true })}
        >
          <option value="series">Suivi par numéro de série</option>
          <option value="vrac">Stock en vrac</option>
          <option value="consommable">Consommable</option>
        </Select>
        <p className="text-xs text-gray-500">
          {inventoryCategory === 'series'
            ? 'Chaque unité est suivie individuellement via un numéro de série.'
            : inventoryCategory === 'vrac'
              ? 'Seule la quantité disponible est comptabilisée.'
              : 'Les consommables suivent uniquement un stock global restant.'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subcategory_id">Sous-catégorie</Label>
        <Select
          id="subcategory_id"
          {...register('subcategory_id')}
          disabled={!selectedCategory || availableSubcategories.length === 0}
        >
          <option value="">Aucune sous-catégorie</option>
          {availableSubcategories.map((sub) => (
            <option key={sub.id} value={sub.id}>{sub.name}</option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="internal_location">Emplacement interne</Label>
        <Input
          id="internal_location"
          type="text"
          placeholder="Ex: Rack A / Étage 2 / Bac 14"
          {...register('internal_location')}
        />
      </div>

      {!autoEntrepreneurMode && (
        <div className="space-y-2">
          <Label htmlFor="rental_price_ht">Tarif HT</Label>
          <Input
            id="rental_price_ht"
            type="number"
            step="0.01"
            {...register('rental_price_ht', { valueAsNumber: true })}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="rental_price_ttc">Tarif TTC</Label>
        <Input
          id="rental_price_ttc"
          type="number"
          step="0.01"
          {...register('rental_price_ttc', { valueAsNumber: true })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Statut</Label>
        <Select
          id="status"
          {...register('status', { required: 'Le statut est requis' })}
          className={cn(errors.status && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
        >
          <option value="">Sélectionner un statut</option>
          <option value="available">Disponible</option>
          <option value="in_use">En utilisation</option>
          <option value="maintenance">Maintenance</option>
          <option value="broken">Cassé</option>
        </Select>
        {errors.status && <p className="text-sm text-red-600">{errors.status.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="image_url">Image (URL)</Label>
        <Input
          id="image_url"
          type="url"
          {...register('image_url', {
            pattern: {
              value: /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|svg|webp|bmp))$/,
              message: 'Indiquez une URL d’image valide',
            },
          })}
          aria-invalid={!!errors.image_url}
          className={cn(errors.image_url && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
        />
        {errors.image_url && <p className="text-sm text-red-600">{errors.image_url.message}</p>}
      </div>

      {inventoryCategory === 'series' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Numéros de série</h3>
            <Button type="button" onClick={addUnitRow} className="px-3 py-1.5 text-xs">
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
          <div className="space-y-3">
            {unitRows.length === 0 && (
              <div className="text-sm text-gray-500">Aucun numéro enregistré.</div>
            )}
            {unitRows.map((row, idx) => (
              <div key={row.id || idx} className="rounded border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Unité {idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeUnitRow(idx)}
                    className="px-2 py-1 text-xs text-red-600 hover:text-red-700"
                    title="Supprimer cette unité"
                  >
                    <Trash2 className="h-4 w-4" /> Retirer
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`unit-serial-${idx}`} className="text-xs font-medium text-gray-600">
                      Numéro de série
                    </Label>
                    <Input
                      id={`unit-serial-${idx}`}
                      value={row.serial}
                      onChange={(e) => handleUnitsChange(idx, { serial: e.target.value })}
                      placeholder="Ex: CAM-00123"
                      className="h-10 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`unit-status-${idx}`} className="text-xs font-medium text-gray-600">
                      Statut
                    </Label>
                    <Select
                      id={`unit-status-${idx}`}
                      value={row.status}
                      onChange={(e) => handleUnitsChange(idx, { status: e.target.value as EquipmentUnitFormRow['status'] })}
                      className="h-10 text-sm"
                    >
                      <option value="available">Disponible</option>
                      <option value="in_use">En utilisation</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="broken">Cassé</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`unit-warehouse-${idx}`} className="text-xs font-medium text-gray-600">
                      Entrepôt
                    </Label>
                    <Select
                      id={`unit-warehouse-${idx}`}
                      value={row.warehouse_id || ''}
                      onChange={(e) => handleUnitsChange(idx, { warehouse_id: e.target.value ? e.target.value : null })}
                      className="h-10 text-sm"
                    >
                      <option value="">Sans entrepôt</option>
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>{wh.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`unit-location-${idx}`} className="text-xs font-medium text-gray-600">
                        Emplacement
                      </Label>
                      <label className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <input
                          type="checkbox"
                          checked={!!row.internal_location_override}
                          onChange={(e) =>
                            handleUnitsChange(idx, {
                              internal_location_override: e.target.checked,
                              internal_location: e.target.checked
                                ? (row.internal_location ?? equipmentInternalLocation ?? '')
                                : (equipmentInternalLocation || null),
                            })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Personnalise
                      </label>
                    </div>
                    <Input
                      id={`unit-location-${idx}`}
                      value={row.internal_location || ''}
                      onChange={(e) => handleUnitsChange(idx, { internal_location: e.target.value, internal_location_override: true })}
                      placeholder={equipmentInternalLocation || 'Même emplacement que le matériel'}
                      disabled={!row.internal_location_override}
                      className="h-10 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {unitsError && <p className="text-sm text-red-600">{unitsError}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Stock global</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stock_quantity" className="text-xs font-medium text-gray-600">
                Quantité
              </Label>
              <Input
                id="stock_quantity"
                type="number"
                min={0}
                {...register('stock_quantity', {
                  valueAsNumber: true,
                  min: { value: 0, message: 'La quantité ne peut pas être négative' },
                })}
                className={cn('h-10 text-sm', errors.stock_quantity && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
              />
              {errors.stock_quantity && (
                <p className="text-xs text-red-600">{errors.stock_quantity.message?.toString()}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stock_warehouse_id" className="text-xs font-medium text-gray-600">
                Entrepôt
              </Label>
              <Select
                id="stock_warehouse_id"
                {...register('stock_warehouse_id')}
                className="h-10 text-sm"
              >
                <option value="default">Entrepôt par défaut</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
            {inventoryCategory === 'consommable'
              ? 'Pour les consommables, ajustez ce stock global lors des sorties.'
              : 'Le matériel en vrac ne requiert pas de numéros de série : maintenez simplement la quantité.'}
          </div>
        </div>
      )}

      <Button type="submit" className="w-full py-2.5">
        Enregistrer le matériel
      </Button>
    </form>
  );
};

export default EquipmentForm;
