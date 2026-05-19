import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Search, Filter, Image as ImageIcon, Boxes } from 'lucide-react';
import EquipmentList from '../components/equipment/EquipmentList';
import { Equipment, EquipmentStatus } from '../types/equipment';
import { useEquipment } from '../hooks/useEquipment';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EquipmentCreateWizard from '../components/equipment/EquipmentCreateWizard';
import CycleInventoryModal from '../components/equipment/CycleInventoryModal';
import PackCreateWizard from '../components/packs/PackCreateWizard';
import { useAuth } from '../context/AuthContext';
import { hasPerm } from '../utils/perm';
import { useEquipmentCategories } from '../hooks/useEquipmentCategories';
import { cn } from '../utils/cn';
import { useTranslation } from '../context/TranslationContext';
import { formatEquipmentStatusLabelForItem } from '../utils/equipmentStatus';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { isAutoEntrepreneurMode } from '../utils/accountingMode';
import { StepTransition } from '../components/ui-kit';

const EquipmentPage = () => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale]
  );

  const [createMode, setCreateMode] = useState<'equipment' | 'pack' | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showCycleInventoryModal, setShowCycleInventoryModal] = useState(false);
  const { equipment, loading, addEquipment, deleteEquipment, deleteEquipmentBulk } = useEquipment();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'equipment' | 'packs'>(() => {
    const t = searchParams.get('tab');
    return t === 'packs' ? 'packs' : 'equipment';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [statusFilters, setStatusFilters] = useState<Set<EquipmentStatus>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('');
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const { categories, loading: categoriesLoading, error: categoriesError } = useEquipmentCategories();
  const [hoveredEquipment, setHoveredEquipment] = useState<Equipment | null>(null);
  const showForm = createMode !== null;
  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(companySettings);

  const statusLabels = useMemo<Record<EquipmentStatus, string>>(
    () => ({
      available: t('equipment.common.status.available'),
      in_use: t('equipment.common.status.in_use'),
      maintenance: t('equipment.common.status.maintenance'),
      broken: t('equipment.common.status.broken'),
    }),
    [t]
  );
  const maintenanceDetailedLabel = useMemo(
    () => t('equipment.common.status.maintenanceDetailed'),
    [t]
  );

  const statusOptions = useMemo(
    () =>
      (['available', 'in_use', 'maintenance', 'broken'] as EquipmentStatus[]).map((value) => ({
        value,
        label: statusLabels[value],
      })),
    [statusLabels]
  );

  const statusDescriptions = useMemo<Record<EquipmentStatus, string>>(
    () => ({
      available: t('equipment.list.status.available'),
      in_use: t('equipment.list.status.in_use'),
      maintenance: t('equipment.list.status.maintenance'),
      broken: t('equipment.list.status.broken'),
    }),
    [t]
  );

  const statusMeta: Record<EquipmentStatus, { label: string; badge: string; description: string }> = useMemo(
    () => ({
      available: {
        label: statusLabels.available,
        badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        description: statusDescriptions.available,
      },
      in_use: {
        label: statusLabels.in_use,
        badge: 'bg-blue-100 text-blue-700 border border-blue-200',
        description: statusDescriptions.in_use,
      },
      maintenance: {
        label: statusLabels.maintenance,
        badge: 'bg-amber-100 text-amber-700 border border-amber-200',
        description: statusDescriptions.maintenance,
      },
      broken: {
        label: statusLabels.broken,
        badge: 'bg-rose-100 text-rose-700 border border-rose-200',
        description: statusDescriptions.broken,
      },
    }),
    [statusDescriptions, statusLabels]
  );

  const inventoryLabels = useMemo(
    () => ({
      series: t('equipment.common.inventoryCategory.series'),
      vrac: t('equipment.common.inventoryCategory.bulk'),
      consommable: t('equipment.common.inventoryCategory.consumable'),
    }),
    [t]
  );

  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const equipmentItems = useMemo(
    () => equipment.filter((item) => item.type !== 'Pack'),
    [equipment]
  );

  const packItems = useMemo(
    () => equipment.filter((item) => item.type === 'Pack'),
    [equipment]
  );

  const activeItems = useMemo(
    () => (activeTab === 'equipment' ? equipmentItems : packItems),
    [activeTab, equipmentItems, packItems]
  );

  const searchPlaceholder = activeTab === 'equipment'
    ? t('equipment.list.searchPlaceholder')
    : t('pack.list.searchPlaceholder');

  const availableSubcategories = useMemo(
    () => selectedCategory?.subcategories ?? [],
    [selectedCategory]
  );

  useEffect(() => {
    if (!availableSubcategories.some((sub) => sub.id === selectedSubcategoryId)) {
      setSelectedSubcategoryId('');
    }
  }, [availableSubcategories, selectedSubcategoryId]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, statusFilters, selectedCategoryId, selectedSubcategoryId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeItems.filter((item) => {
      if (q) {
        const haystacks = [item.name, item.type, item.subtype].filter(Boolean).map((value) => value!.toLowerCase());
        if (!haystacks.some((text) => text.includes(q))) {
          return false;
        }
      }

      if (statusFilters.size > 0 && !statusFilters.has(item.status)) {
        return false;
      }

      if (selectedCategoryId && item.category_id !== selectedCategoryId) {
        return false;
      }

      if (selectedSubcategoryId && item.subcategory_id !== selectedSubcategoryId) {
        return false;
      }

      return true;
    });
  }, [activeItems, query, selectedCategoryId, selectedSubcategoryId, statusFilters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const pageStartIndex = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEndIndex = filtered.length === 0 ? 0 : Math.min(page * pageSize, filtered.length);

  useEffect(() => {
    if (hoveredEquipment && !paginated.some((item) => item.id === hoveredEquipment.id)) {
      setHoveredEquipment(null);
    }
  }, [paginated, hoveredEquipment]);

  useEffect(() => {
    setHoveredEquipment(null);
    setShowFilters(false);
  }, [activeTab]);

  const toggleStatus = (value: EquipmentStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const resetFilters = () => {
    setStatusFilters(new Set());
    setSelectedCategoryId('');
    setSelectedSubcategoryId('');
  };

  const handleDelete = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        await deleteEquipment(id);
      } catch (error) {
        console.error(error);
      }
    },
    [deleteEquipment]
  );

  const handleDuplicate = useCallback(
    async (item: Equipment) => {
      if (!item) return;
      const baseName = item.name?.trim() || t('equipment.list.defaultName');
      let duplicateName = t('equipment.list.copyName', { name: baseName });
      if (equipment.some((eq) => eq.name === duplicateName)) {
        const timestamp = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        duplicateName = t('equipment.list.copyNameWithTime', { name: baseName, time: timestamp });
      }

      const payload: Partial<Equipment> = {
        name: duplicateName,
        type: item.type,
        subtype: item.subtype ?? null,
        rental_price_ht: autoEntrepreneurMode ? item.rental_price_ttc : item.rental_price_ht,
        rental_price_ttc: item.rental_price_ttc,
        status: item.status,
        inventory_category: item.inventory_category,
        image_url: item.image_url ?? null,
        description: item.description ?? null,
        category_id: item.category_id ?? null,
        subcategory_id: item.subcategory_id ?? null,
        internal_location: item.internal_location ?? null,
        purchase_date: item.purchase_date ?? null,
        purchase_price: item.purchase_price ?? undefined,
        qr_code_value: null,
        qr_code_url: null,
        qr_code_generated_at: null,
      };

      try {
        await addEquipment(payload, {
          successMessage: t('equipment.list.toast.duplicateSuccess'),
          errorMessage: t('equipment.list.toast.duplicateError'),
        });
      } catch (error) {
        console.error(error);
      }
    },
    [addEquipment, autoEntrepreneurMode, equipment, locale, t]
  );

  const canViewList = hasPerm(user, 'eq_view_list');
  const canCreate = hasPerm(user, 'eq_create');

  const handleSubmit = async (
    data: Partial<Equipment>,
    serials?: string[],
    stock?: { warehouse_id: string; quantity: number }[],
    serialRows?: { serial: string; warehouse_id: string; internal_location: string | null; internal_location_override: boolean }[],
    accessories?: { name: string; quantity: number; imageUrl?: string | null; description?: string | null }[]
  ) => {
    try {
      const resolvedTtc = Number(data.rental_price_ttc ?? 0);
      const normalizedData: Partial<Equipment> = {
        ...data,
        rental_price_ttc: resolvedTtc,
        rental_price_ht: autoEntrepreneurMode ? resolvedTtc : Number(data.rental_price_ht ?? 0),
      };
      const created = await addEquipment(normalizedData);
      if (created && stock && stock.length) {
        // Ensure default warehouse exists if needed
        let defaultWarehouseId: string | null = null;
        if (stock.some((s) => s.warehouse_id === 'default')) {
          const { data: existing, error: selErr } = await supabase
            .from('warehouses')
            .select('id,name')
            .eq('name', 'Défaut')
            .maybeSingle();
          if (selErr) throw selErr;
          if (existing?.id) {
            defaultWarehouseId = existing.id;
          } else {
            const { data: createdWh, error: insErr } = await supabase
              .from('warehouses')
              .insert([{ name: 'Défaut', address: 'Adresse par défaut' }])
              .select('id')
              .single();
            if (insErr) throw insErr;
            defaultWarehouseId = createdWh.id;
          }
        }

        // Normalize stock array: replace 'default' by actual id and group by warehouse
        const grouped = new Map<string, number>();
        for (const s of stock) {
          const wid = s.warehouse_id === 'default' && defaultWarehouseId ? defaultWarehouseId : s.warehouse_id;
          grouped.set(wid, (grouped.get(wid) || 0) + (s.quantity || 0));
        }

        const toInsert = Array.from(grouped.entries()).map(([wid, qty]) => ({
          equipment_id: created.id,
          warehouse_id: wid,
          quantity: qty,
        }));
        if (toInsert.length) {
          const { error } = await supabase.from('equipment_stock').insert(toInsert);
          if (error) throw error;
        }
      }

      // Insert equipment_units per serial row (sub-matos)
      if (created && serialRows && serialRows.length) {
        let defaultWarehouseId: string | null = null;
        if (serialRows.some((s) => s.warehouse_id === 'default')) {
          const { data: existing, error: selErr } = await supabase
            .from('warehouses')
            .select('id,name')
            .eq('name', 'Défaut')
            .maybeSingle();
          if (selErr) throw selErr;
          if (existing?.id) {
            defaultWarehouseId = existing.id;
          } else {
            const { data: createdWh, error: insErr } = await supabase
              .from('warehouses')
              .insert([{ name: 'Défaut', address: 'Adresse par défaut' }])
              .select('id')
              .single();
            if (insErr) throw insErr;
            defaultWarehouseId = createdWh.id;
          }
        }

        const unitsPayload = serialRows
          .map(r => {
            const resolvedWarehouseId = r.warehouse_id === 'default'
              ? defaultWarehouseId
              : r.warehouse_id;
            if (!resolvedWarehouseId) return null;
            const serial = r.serial?.trim();
            return {
              equipment_id: created.id,
              warehouse_id: resolvedWarehouseId,
              serial_number: serial && serial.length > 0 ? serial : null,
              status: 'available' as const,
              internal_location: r.internal_location,
              internal_location_override: r.internal_location_override,
            };
          })
          .filter(Boolean) as Array<{
            equipment_id: string;
            warehouse_id: string;
            serial_number: string | null;
            status: 'available';
            internal_location: string | null;
            internal_location_override: boolean;
          }>;
        if (unitsPayload.length) {
          const { error: unitsErr } = await supabase.from('equipment_units').insert(unitsPayload);
          if (unitsErr) throw unitsErr;
        }
      }
      if (created && accessories && accessories.length) {
        const rows = accessories.map((acc) => ({
          equipment_id: created.id,
          name: acc.name,
          description: acc.description ?? null,
          quantity: Math.max(1, Math.floor(acc.quantity || 1)),
          image_urls: acc.imageUrl ? [acc.imageUrl] : [],
        }));
        const { error: accErr } = await supabase.from('equipment_accessories').insert(rows);
        if (accErr) throw accErr;
      }
      setCreateMode(null);
    } catch (e) {
      console.error(e);
      toast.error(t('equipment.list.toast.saveError'));
    }
  };

  const handlePackSubmit = async (payload: {
    name: string;
    rental_price_ht: number;
    rental_price_ttc: number;
    image_url: string | null;
    overview: string | null;
    highlights: string | null;
    conditions: string | null;
    items: Array<{ equipment_id: string; quantity: number }>;
  }) => {
    try {
      const created = await addEquipment(
        {
          name: payload.name,
          type: 'Pack',
          subtype: null,
          rental_price_ht: autoEntrepreneurMode ? payload.rental_price_ttc : payload.rental_price_ht,
          rental_price_ttc: payload.rental_price_ttc,
          status: 'available',
          inventory_category: 'vrac',
          image_url: payload.image_url,
          description: null,
          category_id: null,
          subcategory_id: null,
        },
        {
          successMessage: t('pack.list.toast.created'),
          errorMessage: t('pack.list.toast.saveError'),
        },
      );
      if (!created) return;

      const { error: packErr } = await supabase
        .from('equipment_packs')
        .insert([{
          equipment_id: created.id,
          overview: payload.overview,
          highlights: payload.highlights,
          conditions: payload.conditions,
        }]);
      if (packErr) throw packErr;

      if (payload.items.length) {
        const itemsPayload = payload.items.map((item, index) => ({
          pack_id: created.id,
          equipment_id: item.equipment_id,
          quantity: Math.max(1, Math.floor(item.quantity || 1)),
          sort_order: index,
        }));
        const { error: itemErr } = await supabase.from('equipment_pack_items').insert(itemsPayload);
        if (itemErr) throw itemErr;
      }

      setCreateMode(null);
    } catch (e) {
      console.error(e);
      toast.error(t('pack.list.toast.saveError'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!canViewList) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">{t('equipment.list.title')}</h1>
        <div className="bg-white rounded-lg shadow p-6 text-gray-700">
          {t('equipment.list.accessDenied')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{t('equipment.list.title')}</h1>
          {!showForm && (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 pr-8 py-2 w-full rounded-md border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label={t('equipment.list.searchClear')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {!showForm && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFilters((s) => !s)}
                aria-haspopup="dialog"
                aria-expanded={showFilters}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50"
                title={t('equipment.list.filters.button')}
              >
                <Filter className="h-4 w-4" />
                {t('equipment.list.filters.button')}
              </button>

              {showFilters && (
                <div className="absolute z-20 mt-2 w-80 right-0 bg-white border border-gray-200 rounded-md shadow-lg">
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">{t('equipment.list.filters.title')}</div>
                      <button
                        type="button"
                        className="p-1 text-gray-400 hover:text-gray-600"
                        aria-label={t('common.close')}
                        onClick={() => setShowFilters(false)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2">{t('equipment.list.filters.statusTitle')}</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {statusOptions.map((option) => (
                          <label key={option.value} className="inline-flex items-center gap-2 text-gray-700">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-primary focus:ring-primary/40"
                              checked={statusFilters.has(option.value)}
                              onChange={() => toggleStatus(option.value)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2">{t('equipment.list.filters.category')}</div>
                      <select
                        className="block w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        disabled={categoriesLoading && categories.length === 0}
                      >
                        <option value="">{t('equipment.list.filters.categoryAll')}</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2">{t('equipment.list.filters.subcategory')}</div>
                      <select
                        className="block w-full rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                        value={selectedSubcategoryId}
                        onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                        disabled={!selectedCategoryId || availableSubcategories.length === 0}
                      >
                        <option value="">{t('equipment.list.filters.subcategoryAll')}</option>
                        {availableSubcategories.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        {t('equipment.list.filters.reset')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFilters(false)}
                        className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                      >
                        {t('common.closeAction')}
                      </button>
                    </div>
                    {categoriesLoading && (
                      <div className="text-xs text-gray-400 italic">{t('equipment.list.filters.loadingCategories')}</div>
                    )}
                    {categoriesError && (
                      <div className="text-xs text-red-500">{t('equipment.list.filters.error')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!showForm && activeTab === 'equipment' && (
            <button
              type="button"
              onClick={() => setShowCycleInventoryModal(true)}
              className="inline-flex items-center px-4 py-2 rounded-md border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Boxes className="h-5 w-5 mr-2" />
              Inventaires tournants
            </button>
          )}
          {!showForm && canCreate && (
            activeTab === 'equipment' ? (
              <button
                onClick={() => setCreateMode('equipment')}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                {t('equipment.list.actions.add')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCreateMode('pack')}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                {t('equipment.list.actions.addPack')}
              </button>
            )
          )}
          {showForm && (
            <button
              aria-label={t('equipment.list.actions.cancelAria')}
              title={t('equipment.list.actions.cancelAria')}
              onClick={() => setShowCancel(true)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          <button
            type="button"
            onClick={() => !showForm && setActiveTab('equipment')}
            disabled={showForm}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'equipment'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } ${showForm ? 'cursor-default opacity-60' : ''}`}
          >
            {t('equipment.list.tabs.equipment')}
          </button>
          <button
            type="button"
            onClick={() => !showForm && setActiveTab('packs')}
            disabled={showForm}
            className={`py-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'packs'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } ${showForm ? 'cursor-default opacity-60' : ''}`}
          >
            {t('equipment.list.tabs.packs')}
          </button>
        </nav>
      </div>

      <StepTransition stepKey={showForm ? `form-${createMode}` : activeTab} className="space-y-6">
        {showForm ? (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">
              {createMode === 'pack' ? t('pack.list.createWizard.title') : t('equipment.list.createWizard.title')}
            </h2>
            {canCreate ? (
              createMode === 'pack'
                ? <PackCreateWizard equipmentOptions={equipmentItems} onSubmit={handlePackSubmit} />
                : <EquipmentCreateWizard onSubmit={handleSubmit} />
            ) : (
              <div className="bg-white rounded-lg shadow p-6">{t('equipment.list.createWizard.noPermission')}</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <div className="xl:basis-[78%] xl:max-w-[78%] flex flex-col min-h-[calc(100vh-200px)] gap-4">
              <EquipmentList
                equipment={paginated}
                onBulkDelete={deleteEquipmentBulk}
                onHover={setHoveredEquipment}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                title={
                  activeTab === 'equipment'
                    ? t('equipment.list.table.title', { count: filtered.length })
                    : t('pack.list.table.title', { count: filtered.length })
                }
                emptyMessage={
                  activeTab === 'equipment'
                    ? t('equipment.list.table.empty')
                    : t('pack.list.table.empty')
                }
                bulkDeleteTitle={
                  activeTab === 'equipment'
                    ? t('equipment.list.table.bulkDeleteTitle')
                    : t('pack.list.table.bulkDeleteTitle')
                }
                singleDeleteTitle={
                  activeTab === 'equipment'
                    ? t('equipment.list.table.singleDeleteTitle')
                    : t('pack.list.table.singleDeleteTitle')
                }
                singleDeleteMessageUnnamed={
                  activeTab === 'equipment'
                    ? t('equipment.list.table.singleDeleteMessageUnnamed')
                    : t('pack.list.table.singleDeleteMessageUnnamed')
                }
                footer={
                  totalPages > 1 ? (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        {filtered.length === 0
                          ? t('equipment.list.pagination.empty')
                          : t('equipment.list.pagination.summary', {
                              start: pageStartIndex,
                              end: pageEndIndex,
                              total: filtered.length,
                            })}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                          disabled={page === 1}
                          className={cn(
                            'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition',
                            page === 1
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          {t('common.previous')}
                        </button>
                        <span className="text-xs font-medium text-slate-500">
                          {t('equipment.list.pagination.page', {
                            current: Math.min(page, totalPages),
                            total: totalPages,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                          disabled={page === totalPages || filtered.length === 0}
                          className={cn(
                            'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition',
                            page === totalPages || filtered.length === 0
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          {t('common.next')}
                        </button>
                      </div>
                    </div>
                  ) : null
                }
              />
            </div>
            <aside className="hidden xl:block xl:basis-[22%] xl:max-w-[22%] xl:self-start">
              <div className="sticky top-28">
                {filtered.length === 0 ? (
                  <div className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
                    <p className="text-sm font-medium text-slate-600">
                      {activeTab === 'equipment' ? t('equipment.list.sidebar.emptyResults') : t('pack.list.sidebar.emptyResults')}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {activeTab === 'equipment' ? t('equipment.list.sidebar.emptyHint') : t('pack.list.sidebar.emptyHint')}
                    </p>
                  </div>
                ) : hoveredEquipment ? (
                  (() => {
                    const detail = hoveredEquipment;
                    const category = detail.category_id
                      ? categories.find((cat) => cat.id === detail.category_id)
                      : null;
                    const subcategory = category && detail.subcategory_id
                      ? category.subcategories.find((sub) => sub.id === detail.subcategory_id)
                      : null;
                    const status = statusMeta[detail.status];
                    const statusLabel = formatEquipmentStatusLabelForItem(
                      detail,
                      detail.status === 'maintenance'
                        ? maintenanceDetailedLabel
                        : status.label,
                    );
                    const inventoryLabel = detail.type === 'Pack'
                      ? t('equipment.list.packLabel')
                      : inventoryLabels[detail.inventory_category];

                    return (
                      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="relative aspect-[4/3] bg-slate-100">
                          {detail.image_url ? (
                            <img
                              src={detail.image_url}
                              alt={detail.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                              <ImageIcon className="h-8 w-8" />
                              <span className="text-xs font-medium">{t('equipment.list.preview.noImage')}</span>
                            </div>
                          )}
                          <span className={cn('absolute left-4 top-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm', status.badge)}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="space-y-4 p-5">
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-slate-900 line-clamp-2">{detail.name}</h3>
                            <p className="text-xs uppercase tracking-wide text-slate-400">
                              {inventoryLabel}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                            {status.description}
                          </div>
                          <div className="space-y-3 text-sm text-slate-600">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">{t('equipment.list.preview.category')}</span>
                              <span className="font-medium text-slate-800">{category?.name ?? '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">{t('equipment.list.preview.subcategory')}</span>
                              <span className="font-medium text-slate-800">{subcategory?.name ?? '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">{t('equipment.list.preview.type')}</span>
                              <span className="font-medium text-slate-800">{detail.type || '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">{autoEntrepreneurMode ? t('equipment.list.preview.priceTtc') : t('equipment.list.preview.priceHt')}</span>
                              <span className="font-semibold text-slate-900">
                                {currencyFormatter.format(autoEntrepreneurMode ? (detail.rental_price_ttc ?? 0) : (detail.rental_price_ht ?? 0))}{' '}
                                {autoEntrepreneurMode ? t('equipment.common.price.ttcSuffix') : t('equipment.common.price.htSuffix')}
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">{t('equipment.list.preview.description')}</p>
                            <p className="mt-1 text-sm text-slate-600 line-clamp-4">
                              {detail.description?.trim() || t('equipment.list.preview.descriptionEmpty')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="relative aspect-[4/3] bg-slate-100">
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 text-center px-6">
                        <ImageIcon className="h-12 w-12" />
                        <span className="text-sm font-semibold tracking-wide uppercase text-slate-500">
                          {activeTab === 'equipment' ? t('equipment.list.preview.helperTitle') : t('pack.list.preview.helperTitle')}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {activeTab === 'equipment' ? t('equipment.list.preview.placeholderName') : t('pack.list.preview.placeholderName')}
                        </h3>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          {activeTab === 'equipment' ? t('equipment.list.preview.placeholderCategory') : t('pack.list.preview.placeholderCategory')}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                        {activeTab === 'equipment' ? t('equipment.list.preview.placeholderInfo') : t('pack.list.preview.placeholderInfo')}
                      </div>
                      <div className="space-y-3 text-sm text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{t('equipment.list.preview.category')}</span>
                          <span className="font-medium text-slate-800">—</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{t('equipment.list.preview.subcategory')}</span>
                          <span className="font-medium text-slate-800">—</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{t('equipment.list.preview.type')}</span>
                          <span className="font-medium text-slate-800">—</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{autoEntrepreneurMode ? t('equipment.list.preview.priceTtc') : t('equipment.list.preview.priceHt')}</span>
                          <span className="font-semibold text-slate-900">—</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">{t('equipment.list.preview.description')}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {activeTab === 'equipment' ? t('equipment.list.preview.helper') : t('pack.list.preview.helper')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </StepTransition>

      <ConfirmDialog
        isOpen={showCancel}
        title={t('equipment.list.createWizard.cancelTitle')}
        message={t('equipment.list.createWizard.cancelMessage')}
        confirmLabel={t('equipment.list.createWizard.cancelConfirm')}
        cancelLabel={t('equipment.list.createWizard.cancelKeep')}
        onConfirm={() => { setShowCancel(false); setCreateMode(null); }}
        onCancel={() => setShowCancel(false)}
      />

      <CycleInventoryModal
        isOpen={showCycleInventoryModal}
        onClose={() => setShowCycleInventoryModal(false)}
      />
    </div>
  );
};

export default EquipmentPage;
