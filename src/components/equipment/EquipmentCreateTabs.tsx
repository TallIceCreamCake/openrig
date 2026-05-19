import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Image as ImageIcon, Info, ListChecks, ArrowLeft, Save, Euro } from 'lucide-react';
import { Equipment } from '../../types/equipment';
import EmptyTableRow from '../common/EmptyTableRow';
import { useWarehouses } from '../../hooks/useWarehouses';
import { useAuth } from '../../context/AuthContext';
import { hasPerm } from '../../utils/perm';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Label from '../ui/Label';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/Table';
import { cn } from '../../utils/cn';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { isAutoEntrepreneurMode } from '../../utils/accountingMode';

type GeneralForm = Partial<Equipment> & {
  quantity?: number;
  inventory_category?: 'series' | 'vrac' | 'consommable';
  stock_quantity?: number;
  stock_warehouse_id?: string;
};

interface SerialRow { serial: string; warehouse_id: string; }

interface EquipmentCreateTabsProps {
  onSubmit: (data: Partial<Equipment>, serials: string[], stock?: { warehouse_id: string; quantity: number }[]) => void | Promise<void>;
  onCancel?: () => void;
}

const tabs = [
  { id: 'general', name: "Infos générales", icon: Info },
  { id: 'pricing', name: 'Tarification', icon: Euro },
  { id: 'serials', name: 'Numéros de série', icon: ListChecks },
  { id: 'media', name: 'Média', icon: ImageIcon },
  { id: 'summary', name: 'Résumé', icon: Info },
] as const;

const EquipmentCreateTabs: React.FC<EquipmentCreateTabsProps> = ({ onSubmit, onCancel }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'pricing' | 'serials' | 'media' | 'summary'>('general');
  const [serialRows, setSerialRows] = useState<SerialRow[]>([{ serial: '', warehouse_id: 'default' }]);
  const [tva, setTva] = useState<number>(20);
  const { warehouses } = useWarehouses();
  const { categories, loading: categoriesLoading } = useEquipmentCategories();
  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(companySettings);
  const { user } = useAuth();
  const canManagePricing = hasPerm(user, 'eq_manage_pricing');
  const canManageSerials = hasPerm(user, 'eq_manage_serials') && hasPerm(user, 'eq_manage_stock');
  const canUploadMedia = hasPerm(user, 'eq_upload_media');

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<GeneralForm>({
    defaultValues: {
      name: '',
      type: '',
      subtype: '',
      rental_price_ht: 0,
      rental_price_ttc: 0,
      description: '',
      image_url: '',
      purchase_date: '',
      purchase_price: 0,
      quantity: 1,
      inventory_category: 'series',
      stock_quantity: 0,
      stock_warehouse_id: 'default',
      category_id: '',
      subcategory_id: '',
    }
  });

  const inventoryCategory = watch('inventory_category') || 'series';
  const quantity = watch('quantity') || 0;
  const stockQuantity = watch('stock_quantity') || 0;
  const stockWarehouseId = watch('stock_warehouse_id') || 'default';
  const categoryId = watch('category_id') || '';
  const subcategoryId = watch('subcategory_id') || '';
  const ttcInput = watch('rental_price_ttc') || 0;
  const ht = watch('rental_price_ht') || 0;
  const selectedCategory = useMemo(() => categories.find((cat) => cat.id === categoryId) || null, [categories, categoryId]);
  const availableSubcategories = selectedCategory?.subcategories ?? [];
  const selectedSubcategory = useMemo(
    () => availableSubcategories.find((sub) => sub.id === subcategoryId) || null,
    [availableSubcategories, subcategoryId],
  );

  const displayTabs = useMemo(() => tabs.map((tab) => (
    tab.id === 'serials'
      ? { ...tab, name: inventoryCategory === 'series' ? 'Numéros de série' : 'Stock' }
      : tab
  )), [inventoryCategory]);

  // Keep serial rows count in sync with quantity
  useEffect(() => {
    if (inventoryCategory !== 'series') {
      setSerialRows([]);
      setValue('quantity', 0 as any, { shouldValidate: false });
      return;
    }
    const q = Math.max(0, Math.floor(Number(quantity) || 0));
    setValue('quantity', q as any, { shouldValidate: true });
    setSerialRows(prev => {
      if (q === prev.length) return prev;
      if (q > prev.length) {
        return [
          ...prev,
          ...Array(q - prev.length).fill(null).map(() => ({ serial: '', warehouse_id: 'default' }))
        ];
      }
      return prev.slice(0, q);
    });
  }, [inventoryCategory, quantity, setValue]);

  useEffect(() => {
    if (!categories.length) return;
    if (!categoryId || !categories.some((cat) => cat.id === categoryId)) {
      setValue('category_id', categories[0].id, { shouldValidate: true });
    }
  }, [categories, categoryId, setValue]);

  useEffect(() => {
    const available = availableSubcategories;
    if (!categoryId) {
      if (subcategoryId) setValue('subcategory_id', '', { shouldValidate: false });
      return;
    }
    if (!available.length) {
      if (subcategoryId) setValue('subcategory_id', '', { shouldValidate: false });
      return;
    }
    if (subcategoryId && available.some((sub) => sub.id === subcategoryId)) return;
    setValue('subcategory_id', available[0].id, { shouldValidate: false });
  }, [categoryId, availableSubcategories, subcategoryId, setValue]);

  const ttcComputed = useMemo(() => {
    if (autoEntrepreneurMode) return Number(ttcInput) || 0;
    const nht = Number(ht) || 0;
    const rate = Number(tva) || 0;
    return +(nht * (1 + rate / 100)).toFixed(2);
  }, [autoEntrepreneurMode, ht, ttcInput, tva]);

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
      purchase_date: data.purchase_date || null,
      purchase_price: Number(data.purchase_price) || 0,
      inventory_category: inventoryCategory,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
      type: selectedCategory?.name || '',
      subtype: selectedSubcategory?.name || null,
      // Store serials only for matériel suivi à l'unité
      serial_number: inventoryCategory === 'series' && trimmedSerials.length
        ? trimmedSerials.join(', ')
        : null,
    } as Partial<Equipment>;

    let stock: { warehouse_id: string; quantity: number }[] = [];
    if (inventoryCategory === 'series') {
      // Build stock distribution from serial-warehouse assignments
      const stockMap = new Map<string, number>();
      for (const r of serialRows) {
        if (!r.warehouse_id) continue;
        stockMap.set(r.warehouse_id, (stockMap.get(r.warehouse_id) || 0) + 1);
      }
      stock = Array.from(stockMap.entries()).map(([warehouse_id, quantity]) => ({ warehouse_id, quantity }));
    } else if (resolvedStockQuantity > 0) {
      stock = [{ warehouse_id: resolvedWarehouse || 'default', quantity: resolvedStockQuantity }];
    }

    await onSubmit(payload, trimmedSerials, stock);
  });

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 pt-5 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {displayTabs.map((tab) => {
            const Icon = tab.icon as any;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`${active ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <form onSubmit={submit} className="p-6 space-y-6">
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Nom</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ex: Canon EOS R5"
                {...register('name', { required: 'Le nom est requis' })}
                className={cn(errors.name && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
              />
              {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Catégorie</Label>
              <Select
                id="category"
                {...register('category_id', { required: 'La catégorie est requise' })}
                disabled={categoriesLoading || categories.length === 0}
                className={cn(errors.category_id && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
              >
                <option value="">{categoriesLoading ? 'Chargement…' : 'Sélectionner une catégorie'}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>
              {errors.category_id && <p className="text-sm text-red-600">{errors.category_id.message?.toString()}</p>}
              {categories.length === 0 && !categoriesLoading && (
                <p className="text-xs text-gray-500">Créez vos catégories depuis les paramètres d’entreprise.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="subcategory">Sous-catégorie</Label>
              <Select
                id="subcategory"
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
                  ? 'Chaque unité possédera un numéro de série unique.'
                  : inventoryCategory === 'vrac'
                    ? 'Suivi simplifié: indiquez uniquement les quantités disponibles.'
                    : 'Les consommables utilisent un stock global à décrémenter.'}
              </p>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="Détails, accessoires inclus, remarques..."
                {...register('description')}
              />
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          autoEntrepreneurMode ? (
            <div className="grid grid-cols-1 gap-6">
              {!canManagePricing && (
                <div className="p-4 border rounded bg-gray-50 text-gray-600">Vous n’avez pas l’autorisation de gérer la tarification.</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="price_ttc_input">Prix TTC (€/jour)</Label>
                <Input
                  id="price_ttc_input"
                  type="number"
                  step="0.01"
                  placeholder="Ex: 49.00"
                  {...register('rental_price_ttc', { valueAsNumber: true })}
                  disabled={!canManagePricing}
                />
              </div>
              <div className="text-xs text-gray-500">Mode auto-entrepreneur: saisie TTC uniquement, sans TVA.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {!canManagePricing && (
                <div className="md:col-span-3 p-4 border rounded bg-gray-50 text-gray-600">Vous n’avez pas l’autorisation de gérer la tarification.</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="price_ht">Prix HT (€/jour)</Label>
                <Input
                  id="price_ht"
                  type="number"
                  step="0.01"
                  placeholder="Ex: 49.00"
                  {...register('rental_price_ht', { valueAsNumber: true })}
                  disabled={!canManagePricing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tva">TVA</Label>
                <Input
                  id="tva"
                  type="number"
                  step="0.1"
                  min={0}
                  placeholder="Ex: 20"
                  value={tva}
                  onChange={(e) => setTva(parseFloat(e.target.value) || 0)}
                  disabled={!canManagePricing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price_ttc">Prix TTC (€/jour)</Label>
                <Input
                  id="price_ttc"
                  type="number"
                  step="0.01"
                  value={ttcComputed}
                  onChange={() => {}}
                  readOnly
                  className="bg-gray-50 text-gray-700"
                />
              </div>
            </div>
          )
        )}

        {activeTab === 'serials' && (
          <div>
            {!canManageSerials && (
              <div className="mb-4 p-4 border rounded bg-gray-50 text-gray-600">Vous n’avez pas l’autorisation de gérer le stock et les numéros de série.</div>
            )}
            {inventoryCategory !== 'series' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="stock_quantity">Stock initial</Label>
                    <Input
                      id="stock_quantity"
                      type="number"
                      min={0}
                      placeholder="Ex: 25"
                      {...register('stock_quantity', {
                        valueAsNumber: true,
                        min: { value: 0, message: 'La quantité ne peut pas être négative' },
                      })}
                      disabled={!canManageSerials}
                      className={cn(errors.stock_quantity && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
                    />
                    {errors.stock_quantity && <p className="text-xs text-red-600">{errors.stock_quantity.message?.toString()}</p>}
                    <p className="text-xs text-gray-500">Quantité disponible dès la création.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stock_warehouse">Entrepôt principal</Label>
                    <Select
                      id="stock_warehouse"
                      {...register('stock_warehouse_id')}
                      disabled={!canManageSerials}
                    >
                      <option value="default">Entrepôt par défaut</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </Select>
                    <p className="text-xs text-gray-500">Lieu où sera affecté le stock global.</p>
                  </div>
                </div>
                <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                  {inventoryCategory === 'consommable'
                    ? 'Les consommables ne nécessitent pas de numéros de série. Ajustez simplement le stock au fur et à mesure de la consommation.'
                    : 'Le matériel en vrac suit un stock agrégé sans gestion unitaire.'}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantité</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={0}
                      placeholder="Ex: 3"
                      {...register('quantity', {
                        valueAsNumber: true,
                        validate: (value) => (inventoryCategory !== 'series' || (value ?? 0) > 0) || 'Quantité requise',
                      })}
                      disabled={!canManageSerials}
                      className={cn(errors.quantity && 'border-red-500 focus:border-red-500 focus:ring-red-200')}
                    />
                    {errors.quantity && <p className="text-xs text-red-600">{errors.quantity.message?.toString()}</p>}
                  </div>
                </div>
                <div className="mb-2 text-sm text-gray-600">
                  Ajouter les numéros de série pour chaque unité (quantité: {quantity || 0}).
                </div>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-20 px-6">#</TableHeaderCell>
                      <TableHeaderCell className="px-6">Numéro de série</TableHeaderCell>
                      <TableHeaderCell className="px-6">Entrepôt</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {serialRows.length === 0 && (
                      <EmptyTableRow colSpan={3} message={"Aucune ligne (quantité = 0)"} />
                    )}
                    {serialRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="px-6 py-2 text-gray-500">{idx + 1}</TableCell>
                        <TableCell className="px-6 py-2">
                          <Input
                            type="text"
                            value={row.serial}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSerialRows(prev => prev.map((s, i) => (i === idx ? { ...s, serial: v } : s)));
                            }}
                            placeholder="Saisir le numéro de série"
                            disabled={!canManageSerials}
                            className="h-10"
                          />
                        </TableCell>
                        <TableCell className="px-6 py-2">
                          <Select
                            value={row.warehouse_id}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSerialRows(prev => prev.map((s, i) => (i === idx ? { ...s, warehouse_id: v } : s)));
                            }}
                            disabled={!canManageSerials}
                            className="h-10"
                          >
                            <option value="default">Défaut</option>
                            {warehouses.map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        )}

        {activeTab === 'media' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {!canUploadMedia && (
              <div className="md:col-span-2 p-4 border rounded bg-gray-50 text-gray-600">Vous n’avez pas l’autorisation de gérer les médias.</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="image_url">Image (URL)</Label>
              <Input
                id="image_url"
                type="url"
                placeholder="https://.../image.jpg"
                {...register('image_url')}
                disabled={!canUploadMedia}
              />
              <p className="text-xs text-gray-500">Formats acceptés: jpg, png, webp.</p>
            </div>
            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700">Aperçu</Label>
              <div className="h-40 w-full rounded-md border border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
                {watch('image_url') ? (
                  <img src={watch('image_url') || ''} alt="Preview" className="object-cover h-full w-full" />
                ) : (
                  <span className="text-sm text-gray-400">Aucune image</span>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="space-y-4">
            <h3 className="text-md font-medium text-gray-900">Synthèse</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Général</h4>
                <p className="text-sm text-gray-700"><span className="text-gray-500">Nom:</span> {watch('name') || '-'}</p>
                <p className="text-sm text-gray-700"><span className="text-gray-500">Catégorie:</span> {selectedCategory?.name || '-'}</p>
                <p className="text-sm text-gray-700"><span className="text-gray-500">Sous-catégorie:</span> {selectedSubcategory?.name || '-'}</p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Mode d'inventaire :</span> {inventoryCategory === 'series' ? 'Par numéros de série' : inventoryCategory === 'vrac' ? 'Stock en vrac' : 'Consommable'}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Tarification</h4>
                {!autoEntrepreneurMode && <p className="text-sm text-gray-700"><span className="text-gray-500">HT/j:</span> {watch('rental_price_ht') || 0} €</p>}
                {!autoEntrepreneurMode && <p className="text-sm text-gray-700"><span className="text-gray-500">TVA:</span> {tva}%</p>}
                <p className="text-sm text-gray-700"><span className="text-gray-500">TTC/j:</span> {ttcComputed.toFixed(2)} €</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Inventaire</h4>
                {inventoryCategory === 'series' ? (
                  <>
                    <p className="text-sm text-gray-700"><span className="text-gray-500">Quantité:</span> {quantity || 0}</p>
                    <p className="text-sm text-gray-700"><span className="text-gray-500">Numéros:</span> {serialRows.length ? serialRows.map(r => r.serial).join(', ') : '-'}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-700"><span className="text-gray-500">Stock initial:</span> {stockQuantity || 0}</p>
                    <p className="text-sm text-gray-700"><span className="text-gray-500">Entrepôt:</span> {stockWarehouseId === 'default' ? 'Entrepôt par défaut' : (warehouses.find((w) => w.id === stockWarehouseId)?.name || stockWarehouseId)}</p>
                  </>
                )}
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Stock</h4>
                {inventoryCategory === 'series'
                  ? (() => {
                      const counts = new Map<string, number>();
                      for (const r of serialRows) {
                        if (!r.warehouse_id) continue;
                        counts.set(r.warehouse_id, (counts.get(r.warehouse_id) || 0) + 1);
                      }
                      const entries = Array.from(counts.entries());
                      if (entries.length === 0) return <p className="text-sm text-gray-500">Aucune répartition définie</p>;
                      return (
                        <ul className="text-sm text-gray-700 list-disc ml-4">
                          {entries.map(([wid, qty]) => (
                            <li key={wid}>{wid === 'default' ? 'Défaut' : (warehouses.find(w => w.id === wid)?.name || wid)}: {qty}</li>
                          ))}
                        </ul>
                      );
                    })()
                  : (
                    <p className="text-sm text-gray-700">Stock géré globalement — ajustez la quantité depuis la fiche matériel.</p>
                  )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Média</h4>
                <div className="h-40 rounded border border-dashed flex items-center justify-center overflow-hidden bg-gray-50">
                  {watch('image_url') ? (
                    <img src={watch('image_url') || ''} alt="Preview" className="object-cover h-full w-full" />
                  ) : (
                    <span className="text-sm text-gray-400">Aucune image</span>
                  )}
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{watch('description') || '-'}</p>
              </div>
            </div>
          </div>
        )}

        {(() => {
          const q = quantity || 0;
          const allSerialsFilled = serialRows.length === q && serialRows.every(r => r.serial && r.serial.trim().length > 0);
          const allWarehousesSelected = serialRows.length === q && serialRows.every(r => !!r.warehouse_id);
          const disableSave = isSubmitting || (inventoryCategory === 'series' && q > 0 && (!allSerialsFilled || !allWarehousesSelected));
          return (
            <div className="flex justify-between items-center pt-2">
              <div className="text-sm text-gray-500">
                {autoEntrepreneurMode ? 'TTC' : 'TTC calculé'}: {ttcComputed.toFixed(2)} € / jour
              </div>
              <div className="space-x-3">
                {onCancel && (
                  <Button type="button" onClick={onCancel} variant="secondary" className="px-4 py-2">
                    <ArrowLeft className="h-4 w-4" />
                    Annuler
                  </Button>
                )}
                <Button type="submit" disabled={disableSave} className="px-4 py-2">
                  <Save className="h-4 w-4" />
                  Enregistrer
                </Button>
              </div>
            </div>
          );
        })()}
      </form>
    </div>
  );
};

export default EquipmentCreateTabs;
