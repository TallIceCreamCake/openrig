import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Edit, Save, Package, Euro, History, Settings, Plus, Trash2, ImagePlus, QrCode, Loader2, X, ListChecks, ShieldCheck, Globe } from 'lucide-react';
import MaintenanceProcedureWizard from '../components/maintenance/MaintenanceProcedureWizard';
import toast from 'react-hot-toast';
import { Equipment } from '../types/equipment';
import { useEquipment } from '../hooks/useEquipment';
import { supabase } from '../lib/supabase';
import type { EquipmentUnitFormRow } from '../components/equipment/EquipmentForm';
import EquipmentReservationGantt from '../components/equipment/EquipmentReservationGantt';
import EquipmentStockTable from '../components/equipment/EquipmentStockTable';
import { Button, Field, Input, Select, Text, Textarea } from '../components/ui-kit';
import EquipmentImageModal from '../components/equipment/EquipmentImageModal';
import EquipmentImageField from '../components/equipment/EquipmentImageField';
import PackEquipmentSelectionModal from '../components/packs/PackEquipmentSelectionModal';
import { useEquipmentCategories } from '../hooks/useEquipmentCategories';
import { useWarehouses } from '../hooks/useWarehouses';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTranslation } from '../context/TranslationContext';
import { formatEquipmentStatusLabel } from '../utils/equipmentStatus';
import { isAutoEntrepreneurMode } from '../utils/accountingMode';
import { buildEquipmentUnitQrUrl, buildEquipmentUnitQrValue } from '../utils/equipmentUnitTracking';
import EquipmentComplianceTab from '../components/equipment/EquipmentComplianceTab';
import { completeMaintenanceTask, deleteMaintenanceTask } from '../utils/maintenanceActions';


type EquipmentReservationEvent = {
  id: string;
  rentalId: string;
  startDate: string;
  endDate: string;
  status: string;
  reference: string;
  clientName: string;
  quantity: number;
  color?: string | null;
  location?: string | null;
  type?: string | null;
};

type EquipmentUnitReservation = {
  id: string;
  unitId: string;
  rentalId: string;
  startDate: string;
  endDate: string;
  serialNumber: string | null;
  status: string;
  reference: string;
  clientName: string;
  color?: string | null;
  location?: string | null;
};

type EquipmentUnit = {
  id: string;
  serial_number: string | null;
  status: string | null;
  warehouse_id: string | null;
  internal_location: string | null;
  internal_location_override: boolean;
  custom_status_id: string | null;
  logistics_weight_kg: number | null;
  logistics_volume_m3: number | null;
  qr_code_value: string | null;
  qr_code_url: string | null;
  qr_code_generated_at: string | null;
};

type EquipmentCustomStatus = {
  id: string;
  code: string;
  name: string;
  color: string;
  applies_to: 'all' | 'series_unit' | 'non_series_equipment';
  is_active: boolean;
  sort_order: number;
};

type EquipmentUnitHistoryEvent = {
  source_id: string;
  equipment_unit_id: string;
  rental_id: string | null;
  reference_code: string | null;
  rental_title: string | null;
  client_name: string | null;
  event_type: string;
  event_at: string;
  scan_result: string;
  forced: boolean;
  metadata: Record<string, unknown> | null;
};

type RentalMeta = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  reference: string;
  clientName: string;
  color?: string | null;
  location?: string | null;
  type?: string | null;
};

type EditableEquipmentFields = {
  name: string;
  type: string;
  subtype: string;
  status: Equipment['status'];
  custom_status_id: string | null;
  inventory_category: Equipment['inventory_category'];
  rental_price_ht: string;
  rental_price_ttc: string;
  unit_weight_kg: string;
  unit_volume_m3: string;
  description: string;
  category_id: string | null;
  subcategory_id: string | null;
  internal_location: string;
  image_url: string;
  is_public: boolean;
};

type StockDraftRow = {
  id: string;
  warehouse_id: string | null;
  quantity: string;
};

type PackProfile = {
  overview: string | null;
  highlights: string | null;
  conditions: string | null;
};

type PackItem = {
  id: string;
  equipment_id: string;
  quantity: number;
  sort_order?: number | null;
  equipment?: { id: string; name: string; type: string; image_url: string | null } | null;
};

type PackItemDraft = {
  id: string;
  equipment_id: string;
  quantity: string;
};

type PackForm = {
  name: string;
  rental_price_ht: string;
  rental_price_ttc: string;
  image_url: string;
  overview: string;
  highlights: string;
  conditions: string;
};

type EquipmentAccessory = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  image_urls: string[] | null;
};

type AccessoryForm = {
  name: string;
  description: string;
  quantity: string;
  imageUrl: string;
};

type AccessoryModalMode = 'create' | 'edit' | 'view';

type PriceDraft = {
  ht: string;
  ttc: string;
  vat: string;
  source: 'ht' | 'ttc';
};

type TabId = 'overview' | 'history' | 'maintenance' | 'compliance' | 'accessories' | 'stock' | 'contents';

const generateTempId = () => `temp-${Math.random().toString(36).slice(2, 10)}`;
const DEFAULT_EQUIPMENT_IMAGE = 'https://images.unsplash.com/photo-1606857521015-7f9fcf423740?w=600&auto=format&fit=crop';
const DEFAULT_VAT_RATE = 20;
const DEFAULT_ACCESSORY_FORM: AccessoryForm = {
  name: '',
  description: '',
  quantity: '1',
  imageUrl: '',
};

const parseNumberInput = (value: string) => {
  const normalized = value.replace(',', '.').trim();
  if (!normalized.length) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseSingleImageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const [first] = trimmed.split(/[\n,]+/);
  const normalized = first.trim();
  return normalized.length ? normalized : null;
};

const roundToCents = (value: number) => Math.round(value * 100) / 100;
const formatPriceValue = (value: number) => roundToCents(value).toFixed(2);

const computeVatRate = (ht: number, ttc: number) => {
  if (ht <= 0 || ttc <= 0) return null;
  const rate = (ttc / ht - 1) * 100;
  if (!Number.isFinite(rate) || rate < 0) return null;
  return roundToCents(rate);
};

const formatUnitHistoryEventLabel = (eventType: string) => {
  if (eventType === 'prepared') return 'Préparation';
  if (eventType === 'returned') return 'Retour';
  return eventType || 'Événement';
};

const EquipmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { singleEquipment: equipment, updateEquipment, loading, error, refetch } = useEquipment(id);
  const { t, language } = useTranslation();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const currencyFormatter = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }), [locale]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get('tab') as TabId | null;
    const valid: TabId[] = ['overview', 'history', 'maintenance', 'compliance', 'accessories', 'stock', 'contents'];
    return valid.includes(t as TabId) ? t as TabId : 'overview';
  });
  useEffect(() => { setSearchParams({ tab: activeTab }, { replace: true }); }, [activeTab]);
  const [formValues, setFormValues] = useState<EditableEquipmentFields | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [stocks, setStocks] = useState<Array<{
    warehouse_id: string;
    warehouse_name: string;
    quantity: number;
    units: EquipmentUnit[];
  }>>([]);
  const [unitList, setUnitList] = useState<EquipmentUnit[]>([]);
  const [unitRowsDraft, setUnitRowsDraft] = useState<EquipmentUnitFormRow[]>([]);
  const [stockRowsDraft, setStockRowsDraft] = useState<StockDraftRow[]>([]);
  const [accessories, setAccessories] = useState<EquipmentAccessory[]>([]);
  const [accessoriesLoading, setAccessoriesLoading] = useState(false);
  const [isAccessoryModalOpen, setIsAccessoryModalOpen] = useState(false);
  const [accessoryModalMode, setAccessoryModalMode] = useState<AccessoryModalMode>('create');
  const [selectedAccessory, setSelectedAccessory] = useState<EquipmentAccessory | null>(null);
  const [isAccessorySaving, setIsAccessorySaving] = useState(false);
  const [accessoryForm, setAccessoryForm] = useState<AccessoryForm>(DEFAULT_ACCESSORY_FORM);
  const [packProfile, setPackProfile] = useState<PackProfile | null>(null);
  const [packItems, setPackItems] = useState<PackItem[]>([]);
  const [packItemsDraft, setPackItemsDraft] = useState<PackItemDraft[]>([]);
  const [packItemOptions, setPackItemOptions] = useState<Equipment[]>([]);
  const [packForm, setPackForm] = useState<PackForm | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packAvailability, setPackAvailability] = useState<Record<string, number>>({});
  const [isPackSelectionOpen, setIsPackSelectionOpen] = useState(false);
  const [maintenanceOpenCount, setMaintenanceOpenCount] = useState<number>(0);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [rentalHistory, setRentalHistory] = useState<{
    id: string;
    client: string;
    startDate: string;
    endDate: string;
    duration: number;
    revenue: number;
    status: string;
  }[]>([]);
  const [maintenanceHistory, setMaintenanceHistory] = useState<{
    id: string;
    type: string;
    date: string;
    description: string | null;
    cost: number;
    status: string;
  }[]>([]);
  const [maintenanceActionId, setMaintenanceActionId] = useState<string | null>(null);
  const [maintenanceActionKind, setMaintenanceActionKind] = useState<'complete' | 'delete' | null>(null);
  const [showMaintenanceWizard, setShowMaintenanceWizard] = useState(false);
  const [reservations, setReservations] = useState<EquipmentReservationEvent[]>([]);
  const [unitReservations, setUnitReservations] = useState<EquipmentUnitReservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [unitReservationsLoading, setUnitReservationsLoading] = useState(false);
  const [rentalMeta, setRentalMeta] = useState<Record<string, RentalMeta>>({});
  const [isSavingOverlayVisible, setIsSavingOverlayVisible] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [priceTarget, setPriceTarget] = useState<'equipment' | 'pack' | null>(null);
  const [priceDraft, setPriceDraft] = useState<PriceDraft | null>(null);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [unitHistoryByUnitId, setUnitHistoryByUnitId] = useState<Record<string, EquipmentUnitHistoryEvent[]>>({});
  const [unitHistoryLoading, setUnitHistoryLoading] = useState(false);
  const [unitQrRefreshingId, setUnitQrRefreshingId] = useState<string | null>(null);
  const [customStatuses, setCustomStatuses] = useState<EquipmentCustomStatus[]>([]);

  const { settings: companySettings } = useCompanySettings();
  const autoEntrepreneurMode = isAutoEntrepreneurMode(companySettings);
  const { categories, loading: categoriesLoading } = useEquipmentCategories();
  const { warehouses } = useWarehouses();
  const isPack = equipment?.type === 'Pack';

  const selectedCategory = useMemo(() => {
    if (!formValues) return null;
    return categories.find((cat) => cat.id === formValues.category_id) || null;
  }, [categories, formValues]);

  const availableSubcategories = selectedCategory?.subcategories ?? [];

  const selectedSubcategory = useMemo(() => {
    if (!formValues) return null;
    return availableSubcategories.find((sub) => sub.id === formValues.subcategory_id) || null;
  }, [availableSubcategories, formValues]);

  const statusOptions: Equipment['status'][] = ['available', 'in_use', 'maintenance', 'broken'];
  const statusLabels = useMemo<Record<Equipment['status'], string>>(() => ({
    available: t('equipment.common.status.available'),
    in_use: t('equipment.common.status.in_use'),
    maintenance: t('equipment.common.status.maintenance'),
    broken: t('equipment.common.status.broken'),
  }), [t]);
  const maintenanceDetailedLabel = useMemo(
    () => t('equipment.common.status.maintenanceDetailed'),
    [t]
  );
  const customStatusById = useMemo(
    () => new Map(customStatuses.map((status) => [status.id, status] as const)),
    [customStatuses],
  );
  const seriesUnitCustomStatuses = useMemo(
    () => customStatuses.filter((status) => status.applies_to === 'all' || status.applies_to === 'series_unit'),
    [customStatuses],
  );
  const equipmentCustomStatuses = useMemo(
    () => customStatuses.filter((status) => status.applies_to === 'all' || status.applies_to === 'non_series_equipment'),
    [customStatuses],
  );
  const inventoryCategoryLabels = useMemo<Record<Equipment['inventory_category'], string>>(() => ({
    series: t('equipment.common.inventoryCategory.series'),
    vrac: t('equipment.common.inventoryCategory.bulk'),
    consommable: t('equipment.common.inventoryCategory.consumable'),
  }), [t]);
  const rentalStatusLabels = useMemo<Record<string, string>>(() => ({
    completed: t('equipment.detail.history.status.completed'),
    pending: t('equipment.detail.history.status.pending'),
    confirmed: t('equipment.detail.history.status.confirmed'),
    cancelled: t('equipment.detail.history.status.cancelled'),
    preparing: t('rentals.status.preparing'),
    in_progress: t('rentals.status.in_progress'),
    delivered: t('rentals.status.delivered'),
    return_delivery: t('rentals.status.return_delivery'),
    in_return: t('rentals.status.in_return'),
    returned: t('rentals.status.returned'),
    paid: t('rentals.status.paid'),
    archived: t('rentals.status.archived'),
  }), [t]);
  const maintenanceStatusLabels = useMemo<Record<string, string>>(() => ({
    completed: t('equipment.detail.maintenance.status.completed'),
    pending: t('equipment.detail.maintenance.status.pending'),
    open: t('equipment.detail.maintenance.status.open'),
  }), [t]);
  const categoryAppliedNameRef = useRef<string | null>(null);
  const subcategoryAppliedNameRef = useRef<string | null>(null);

  const equipmentTabs = useMemo<Array<{ id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }>>(() => ([
    { id: 'overview', name: t('equipment.detail.tabs.overview'), icon: Package },
    { id: 'history', name: t('equipment.detail.tabs.history'), icon: History },
    { id: 'maintenance', name: t('equipment.detail.tabs.maintenance'), icon: Settings },
    { id: 'compliance', name: 'Conformité', icon: ShieldCheck },
    { id: 'accessories', name: t('equipment.detail.tabs.accessories'), icon: ImagePlus },
    { id: 'stock', name: t('equipment.detail.tabs.stock'), icon: Euro }
  ]), [t]);

  const packTabs = useMemo<Array<{ id: TabId; name: string; icon: React.ComponentType<{ className?: string }> }>>(() => ([
    { id: 'overview', name: t('pack.detail.tabs.overview'), icon: Package },
    { id: 'contents', name: t('pack.detail.tabs.contents'), icon: ListChecks },
  ]), [t]);

  const tabs = useMemo(() => (isPack ? packTabs : equipmentTabs), [equipmentTabs, isPack, packTabs]);

  useEffect(() => {
    let cancelled = false;
    const loadCustomStatuses = async () => {
      try {
        const sb: any = supabase;
        const { data, error: customStatusError } = await sb
          .from('equipment_custom_statuses')
          .select('id, code, name, color, applies_to, is_active, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });
        if (customStatusError) throw customStatusError;
        if (cancelled) return;
        const rows = (data || []).map((row: any) => ({
          id: row.id as string,
          code: row.code as string,
          name: row.name as string,
          color: row.color as string,
          applies_to: (row.applies_to as EquipmentCustomStatus['applies_to']) || 'all',
          is_active: !!row.is_active,
          sort_order: Number(row.sort_order || 100),
        }));
        setCustomStatuses(rows);
      } catch (customStatusError) {
        console.error('Error loading equipment custom statuses', customStatusError);
        if (!cancelled) setCustomStatuses([]);
      }
    };

    void loadCustomStatuses();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isPack && activeTab !== 'overview' && activeTab !== 'contents') {
      setActiveTab('overview');
    } else if (!isPack && activeTab === 'contents') {
      setActiveTab('overview');
    }
  }, [activeTab, isPack]);

  useEffect(() => {
    if (!loading && !equipment && !error) {
      navigate('/equipment');
    }
  }, [loading, equipment, error, navigate]);

  useEffect(() => {
    if (!equipment) return;
    setFormValues({
      name: equipment.name || '',
      type: equipment.type || '',
      subtype: equipment.subtype || '',
      status: equipment.status || 'available',
      custom_status_id: equipment.custom_status_id || null,
      inventory_category: equipment.inventory_category || 'series',
      rental_price_ht:
        equipment.rental_price_ht !== undefined && equipment.rental_price_ht !== null
          ? String(equipment.rental_price_ht)
          : '',
      rental_price_ttc:
        equipment.rental_price_ttc !== undefined && equipment.rental_price_ttc !== null
          ? String(equipment.rental_price_ttc)
          : '',
      unit_weight_kg:
        equipment.unit_weight_kg !== undefined && equipment.unit_weight_kg !== null
          ? String(equipment.unit_weight_kg)
          : '',
      unit_volume_m3:
        equipment.unit_volume_m3 !== undefined && equipment.unit_volume_m3 !== null
          ? String(equipment.unit_volume_m3)
          : '',
      description: equipment.description || '',
      category_id: equipment.category_id || null,
      subcategory_id: equipment.subcategory_id || null,
      internal_location: equipment.internal_location || '',
      image_url: equipment.image_url || '',
      is_public: equipment.is_public ?? false,
    });
    categoryAppliedNameRef.current = equipment.type || null;
    subcategoryAppliedNameRef.current = equipment.subtype || null;
  }, [equipment]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues || categories.length === 0) return;
    if (formValues.category_id) return;
    const firstCategory = categories[0];
    setFormValues((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        category_id: firstCategory.id,
        subcategory_id: firstCategory.subcategories[0]?.id ?? null,
      };
    });
  }, [categories, formValues]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    if (!formValues.category_id) {
      if (formValues.subcategory_id) {
        setFormValues((prev) => (prev ? { ...prev, subcategory_id: null } : prev));
      }
      return;
    }
    const category = categories.find((cat) => cat.id === formValues.category_id);
    if (!category) return;
    if (category.subcategories.length === 0) {
      if (formValues.subcategory_id) {
        setFormValues((prev) => (prev ? { ...prev, subcategory_id: null } : prev));
      }
      return;
    }
    if (!category.subcategories.some((sub) => sub.id === formValues.subcategory_id)) {
      setFormValues((prev) => (prev ? { ...prev, subcategory_id: category.subcategories[0].id } : prev));
    }
  }, [categories, formValues?.category_id, formValues?.subcategory_id]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    const categoryName = selectedCategory?.name;
    if (!categoryName) return;

    if (!formValues.type.trim()) {
      categoryAppliedNameRef.current = categoryName;
      setFormValues((prev) => (prev ? { ...prev, type: categoryName } : prev));
      return;
    }

    if (
      categoryAppliedNameRef.current &&
      formValues.type === categoryAppliedNameRef.current &&
      categoryAppliedNameRef.current !== categoryName
    ) {
      categoryAppliedNameRef.current = categoryName;
      setFormValues((prev) => (prev ? { ...prev, type: categoryName } : prev));
    }
  }, [selectedCategory, formValues?.type]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    const subcategoryName = selectedSubcategory?.name;
    if (!subcategoryName) {
      if (
        subcategoryAppliedNameRef.current &&
        formValues.subtype &&
        formValues.subtype === subcategoryAppliedNameRef.current
      ) {
        subcategoryAppliedNameRef.current = null;
        setFormValues((prev) => (prev ? { ...prev, subtype: '' } : prev));
      }
      return;
    }

    if (!formValues.subtype.trim()) {
      subcategoryAppliedNameRef.current = subcategoryName;
      setFormValues((prev) => (prev ? { ...prev, subtype: subcategoryName } : prev));
      return;
    }

    if (
      subcategoryAppliedNameRef.current &&
      formValues.subtype === subcategoryAppliedNameRef.current &&
      subcategoryAppliedNameRef.current !== subcategoryName
    ) {
      subcategoryAppliedNameRef.current = subcategoryName;
      setFormValues((prev) => (prev ? { ...prev, subtype: subcategoryName } : prev));
    }
  }, [selectedSubcategory, formValues?.subtype]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    if (formValues.inventory_category !== 'series') return;
    setUnitRowsDraft(
      unitList.map((u) => ({
        id: u.id,
        serial: u.serial_number || '',
        status: (u.status as EquipmentUnitFormRow['status']) || 'available',
        warehouse_id: u.warehouse_id || null,
        internal_location: u.internal_location || null,
        internal_location_override: u.internal_location_override === true,
        custom_status_id: u.custom_status_id || null,
      })),
    );
  }, [unitList, formValues?.inventory_category]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    if (formValues.inventory_category !== 'series') return;
    const inheritedLocation = formValues.internal_location.trim();
    setUnitRowsDraft((prev) =>
      prev.map((row) =>
        row.internal_location_override
          ? row
          : { ...row, internal_location: inheritedLocation || null },
      ),
    );
  }, [formValues?.internal_location, formValues?.inventory_category, isPack]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    if (formValues.inventory_category === 'series') return;
    if (stocks.length === 0) {
      setStockRowsDraft([{ id: generateTempId(), warehouse_id: null, quantity: '0' }]);
      return;
    }
    setStockRowsDraft(
      stocks.map((entry) => ({
        id: entry.warehouse_id || generateTempId(),
        warehouse_id: entry.warehouse_id === 'unassigned' ? null : entry.warehouse_id,
        quantity: String(entry.quantity ?? 0),
      })),
    );
  }, [stocks, formValues?.inventory_category]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    if (formValues.inventory_category !== 'series') return;
    setUnitRowsDraft((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          serial: '',
          status: 'available',
          warehouse_id: warehouses[0]?.id || null,
          custom_status_id: null,
        },
      ] as EquipmentUnitFormRow[];
    });
  }, [formValues?.inventory_category, warehouses]);

  useEffect(() => {
    if (isPack) return;
    if (!formValues) return;
    if (formValues.inventory_category === 'series') return;
    setStockRowsDraft((prev) => {
      if (prev.length > 0) return prev;
      return [{ id: generateTempId(), warehouse_id: warehouses[0]?.id || null, quantity: '0' }];
    });
  }, [formValues?.inventory_category, warehouses]);

  const loadStocks = useCallback(async () => {
    if (!id || isPack) return;
    try {
      setLoadingStocks(true);
      const { data: units, error: unitErr } = await supabase
        .from('equipment_units')
        .select('id, warehouse_id, serial_number, status, internal_location, internal_location_override, custom_status_id, logistics_weight_kg, logistics_volume_m3, qr_code_value, qr_code_url, qr_code_generated_at, created_at')
        .eq('equipment_id', id)
        .order('created_at', { ascending: true });
      if (unitErr) throw unitErr;

      const flatUnits = (units || []).map((u) => ({
        id: u.id as string,
        warehouse_id: (u.warehouse_id as string | null) || null,
        serial_number: (u.serial_number as string | null) ?? null,
        status: (u.status as string | null) ?? null,
        internal_location: (u.internal_location as string | null) ?? null,
        internal_location_override: u.internal_location_override === true,
        custom_status_id: (u.custom_status_id as string | null) ?? null,
        logistics_weight_kg: u.logistics_weight_kg === null || u.logistics_weight_kg === undefined ? null : Number(u.logistics_weight_kg),
        logistics_volume_m3: u.logistics_volume_m3 === null || u.logistics_volume_m3 === undefined ? null : Number(u.logistics_volume_m3),
        qr_code_value: (u.qr_code_value as string | null) ?? null,
        qr_code_url: (u.qr_code_url as string | null) ?? null,
        qr_code_generated_at: (u.qr_code_generated_at as string | null) ?? null,
      }));
      setUnitList(flatUnits);

      if (flatUnits.length === 0) {
        const { data: es, error: esErr } = await supabase
          .from('equipment_stock')
          .select('warehouse_id, quantity')
          .eq('equipment_id', id);
        if (esErr) throw esErr;
        const fallbackWarehouseIds = Array.from(new Set((es || []).map((r) => r.warehouse_id).filter(Boolean))) as string[];
        let fallbackWarehouses: Array<{ id: string; name: string }> = [];
        if (fallbackWarehouseIds.length) {
          const { data: ws, error: wErr } = await supabase
            .from('warehouses')
            .select('id,name')
            .in('id', fallbackWarehouseIds);
          if (wErr) throw wErr;
          fallbackWarehouses = ws || [];
        }
        const fallbackNameMap = new Map(fallbackWarehouses.map((w) => [w.id, w.name] as const));
        const fallbackStocks = (es || []).map((row) => ({
          warehouse_id: row.warehouse_id || 'unassigned',
          warehouse_name: row.warehouse_id
            ? (fallbackNameMap.get(row.warehouse_id as string) || (row.warehouse_id as string))
            : t('equipment.detail.stock.noWarehouseOption'),
          quantity: (row.quantity as number) || 0,
          units: [],
        }));
        setStocks(fallbackStocks);
        return;
      }

      const warehouseIds = Array.from(new Set(flatUnits.map((u) => u.warehouse_id).filter(Boolean))) as string[];
      let warehouseRows: Array<{ id: string; name: string }> = [];
      if (warehouseIds.length) {
        const { data: ws, error: wErr } = await supabase
          .from('warehouses')
          .select('id,name')
          .in('id', warehouseIds);
        if (wErr) throw wErr;
        warehouseRows = ws || [];
      }
      const nameMap = new Map(warehouseRows.map((w) => [w.id, w.name] as const));

      const distribution = new Map<string, {
        warehouse_id: string;
        warehouse_name: string;
        units: EquipmentUnit[];
      }>();

      flatUnits.forEach((u) => {
        const key = u.warehouse_id || 'unassigned';
        const entry = distribution.get(key) || {
          warehouse_id: key,
          warehouse_name: key === 'unassigned'
            ? t('equipment.detail.stock.noWarehouseOption')
            : (nameMap.get(key) || key),
          units: [],
        };
        entry.units.push(u);
        distribution.set(key, entry);
      });

      const merged = Array.from(distribution.values()).map((entry) => ({
        warehouse_id: entry.warehouse_id,
        warehouse_name: entry.warehouse_name,
        quantity: entry.units.length,
        units: entry.units,
      }));

      setStocks(merged);
    } catch (e) {
      console.error('Error loading stocks', e);
      setStocks([]);
      setUnitList([]);
    } finally {
      setLoadingStocks(false);
    }
  }, [id, isPack, t]);

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

  useEffect(() => {
    setSelectedUnitId((prev) => {
      if (!unitList.length) return null;
      if (prev && unitList.some((unit) => unit.id === prev)) return prev;
      return unitList[0].id;
    });
  }, [unitList]);

  useEffect(() => {
    const loadUnitHistory = async () => {
      if (!id || isPack || equipment?.inventory_category !== 'series') {
        setUnitHistoryByUnitId({});
        setUnitHistoryLoading(false);
        return;
      }

      const unitIds = unitList.map((unit) => unit.id).filter(Boolean);
      if (!unitIds.length) {
        setUnitHistoryByUnitId({});
        setUnitHistoryLoading(false);
        return;
      }

      setUnitHistoryLoading(true);
      try {
        const sb: any = supabase;
        const { data, error } = await sb
          .from('equipment_unit_rental_history')
          .select(
            'source_id, equipment_unit_id, rental_id, reference_code, rental_title, client_name, event_type, event_at, scan_result, forced, metadata',
          )
          .in('equipment_unit_id', unitIds)
          .order('event_at', { ascending: false });

        if (error) throw error;

        const grouped: Record<string, EquipmentUnitHistoryEvent[]> = {};
        (data || []).forEach((row: Record<string, unknown>) => {
          const unitId = typeof row.equipment_unit_id === 'string' ? row.equipment_unit_id : '';
          if (!unitId) return;
          if (!grouped[unitId]) grouped[unitId] = [];
          grouped[unitId].push({
            source_id: typeof row.source_id === 'string' ? row.source_id : `${unitId}-${grouped[unitId].length}`,
            equipment_unit_id: unitId,
            rental_id: typeof row.rental_id === 'string' ? row.rental_id : null,
            reference_code: typeof row.reference_code === 'string' ? row.reference_code : null,
            rental_title: typeof row.rental_title === 'string' ? row.rental_title : null,
            client_name: typeof row.client_name === 'string' ? row.client_name : null,
            event_type: typeof row.event_type === 'string' ? row.event_type : 'event',
            event_at: typeof row.event_at === 'string' ? row.event_at : new Date().toISOString(),
            scan_result: typeof row.scan_result === 'string' ? row.scan_result : 'unknown',
            forced: row.forced === true,
            metadata: typeof row.metadata === 'object' && row.metadata !== null ? (row.metadata as Record<string, unknown>) : null,
          });
        });
        setUnitHistoryByUnitId(grouped);
      } catch (historyError) {
        console.error('Error loading unit rental history', historyError);
        setUnitHistoryByUnitId({});
      } finally {
        setUnitHistoryLoading(false);
      }
    };

    void loadUnitHistory();
  }, [equipment?.inventory_category, id, isPack, unitList]);

  const loadAccessories = useCallback(async () => {
    if (!equipment?.id || isPack) return;
    try {
      setAccessoriesLoading(true);
      const { data, error } = await supabase
        .from('equipment_accessories')
        .select('id, name, description, quantity, image_urls, created_at')
        .eq('equipment_id', equipment.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setAccessories((data || []) as EquipmentAccessory[]);
    } catch (error) {
      console.error('Error loading accessories', error);
      setAccessories([]);
    } finally {
      setAccessoriesLoading(false);
    }
  }, [equipment?.id, isPack]);

  useEffect(() => {
    void loadAccessories();
  }, [loadAccessories]);

  const loadPackData = useCallback(async () => {
    if (!equipment?.id || !isPack) return;
    setPackLoading(true);
    try {
      const { data: packRow, error: packErr } = await supabase
        .from('equipment_packs')
        .select('overview, highlights, conditions')
        .eq('equipment_id', equipment.id)
        .maybeSingle();
      if (packErr) throw packErr;

      const { data: itemRows, error: itemErr } = await supabase
        .from('equipment_pack_items')
        .select('id, equipment_id, quantity, sort_order, created_at')
        .eq('pack_id', equipment.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (itemErr) throw itemErr;

      const itemIds = Array.from(new Set((itemRows || []).map((row) => row.equipment_id).filter(Boolean))) as string[];
      let itemEquipment: Array<{ id: string; name: string; type: string; image_url: string | null }> = [];
      if (itemIds.length) {
        const { data: eqRows, error: eqErr } = await supabase
          .from('equipment')
          .select('id, name, type, image_url')
          .in('id', itemIds);
        if (eqErr) throw eqErr;
        itemEquipment = (eqRows || []) as Array<{ id: string; name: string; type: string; image_url: string | null }>;
      }
      const equipmentMap = new Map(itemEquipment.map((row) => [row.id, row] as const));

      const items = (itemRows || []).map((row) => ({
        id: row.id as string,
        equipment_id: row.equipment_id as string,
        quantity: (row.quantity as number) || 1,
        sort_order: row.sort_order as number,
        equipment: equipmentMap.get(row.equipment_id as string) || null,
      })) as PackItem[];

      setPackItems(items);
      setPackProfile({
        overview: packRow?.overview ?? null,
        highlights: packRow?.highlights ?? null,
        conditions: packRow?.conditions ?? null,
      });
      if (!isEditing) {
        setPackForm({
          name: equipment.name || '',
          rental_price_ht:
            equipment.rental_price_ht !== undefined && equipment.rental_price_ht !== null
              ? String(equipment.rental_price_ht)
              : '',
          rental_price_ttc:
            equipment.rental_price_ttc !== undefined && equipment.rental_price_ttc !== null
              ? String(equipment.rental_price_ttc)
              : '',
          image_url: equipment.image_url || '',
          overview: packRow?.overview ?? '',
          highlights: packRow?.highlights ?? '',
          conditions: packRow?.conditions ?? '',
        });
        setPackItemsDraft(
          items.map((item) => ({
            id: item.id,
            equipment_id: item.equipment_id,
            quantity: String(item.quantity ?? 1),
          })),
        );
      } else if (packItemsDraft.length === 0 && items.length > 0) {
        setPackItemsDraft(
          items.map((item) => ({
            id: item.id,
            equipment_id: item.equipment_id,
            quantity: String(item.quantity ?? 1),
          })),
        );
      }

      const { data: options, error: optionsErr } = await supabase
        .from('equipment')
        .select('id, name, type, image_url')
        .neq('type', 'Pack')
        .order('name', { ascending: true });
      if (optionsErr) throw optionsErr;
      setPackItemOptions((options || []) as Equipment[]);
    } catch (error) {
      console.error('Error loading pack data', error);
      setPackItems([]);
      setPackProfile(null);
      setPackItemsDraft([]);
      setPackItemOptions([]);
      setPackForm(null);
    } finally {
      setPackLoading(false);
    }
  }, [
    equipment?.id,
    equipment?.image_url,
    equipment?.name,
    equipment?.rental_price_ht,
    equipment?.rental_price_ttc,
    isEditing,
    isPack,
    packItemsDraft.length,
  ]);

  useEffect(() => {
    void loadPackData();
  }, [loadPackData]);

  const loadPackAvailability = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setPackAvailability({});
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
      setPackAvailability(map);
    } catch (error) {
      console.error('pack availability error', error);
    }
  }, []);

  useEffect(() => {
    if (!isPack || !isEditing) {
      setPackAvailability({});
      return;
    }
    const ids = Array.from(new Set(packItemsDraft.map((item) => item.equipment_id).filter(Boolean)));
    void loadPackAvailability(ids);
  }, [isEditing, isPack, loadPackAvailability, packItemsDraft]);

  useEffect(() => {
    if (isPack) return;
    setPackItems([]);
    setPackProfile(null);
    setPackItemsDraft([]);
    setPackItemOptions([]);
    setPackForm(null);
    setPackLoading(false);
  }, [isPack]);

  const resetAccessoryForm = () => {
    setAccessoryForm(DEFAULT_ACCESSORY_FORM);
  };

  const setAccessoryFormFromRow = (accessory: EquipmentAccessory) => {
    const imageUrl = (accessory.image_urls || []).find(Boolean) || '';
    setAccessoryForm({
      name: accessory.name || '',
      description: accessory.description || '',
      quantity: String(accessory.quantity ?? 1),
      imageUrl,
    });
  };

  const openAccessoryCreate = () => {
    resetAccessoryForm();
    setSelectedAccessory(null);
    setAccessoryModalMode('create');
    setIsAccessoryModalOpen(true);
  };

  const openAccessoryView = (accessory: EquipmentAccessory) => {
    setSelectedAccessory(accessory);
    setAccessoryFormFromRow(accessory);
    setAccessoryModalMode('view');
    setIsAccessoryModalOpen(true);
  };

  const openAccessoryEdit = (accessory: EquipmentAccessory) => {
    setSelectedAccessory(accessory);
    setAccessoryFormFromRow(accessory);
    setAccessoryModalMode('edit');
    setIsAccessoryModalOpen(true);
  };

  const closeAccessoryModal = () => {
    setIsAccessoryModalOpen(false);
    setAccessoryModalMode('create');
    setSelectedAccessory(null);
    setIsAccessorySaving(false);
    resetAccessoryForm();
  };

  const handleAccessorySave = async () => {
    if (!equipment?.id) return;
    if (accessoryModalMode === 'view') return;
    const trimmedName = accessoryForm.name.trim();
    if (!trimmedName.length) {
      toast.error(t('equipment.detail.accessories.form.errors.nameRequired'));
      return;
    }
    const quantityValue = Math.max(1, Math.floor(parseNumberInput(accessoryForm.quantity) ?? 1));
    const imageUrl = parseSingleImageUrl(accessoryForm.imageUrl);

    setIsAccessorySaving(true);
    try {
      const payload = {
        equipment_id: equipment.id,
        name: trimmedName,
        description: accessoryForm.description.trim() ? accessoryForm.description.trim() : null,
        quantity: quantityValue,
        image_urls: imageUrl ? [imageUrl] : [],
      };
      if (accessoryModalMode === 'edit' && selectedAccessory?.id) {
        const { error } = await supabase
          .from('equipment_accessories')
          .update(payload)
          .eq('id', selectedAccessory.id);
        if (error) throw error;
        toast.success(t('equipment.detail.accessories.form.toast.updated'));
      } else {
        const { error } = await supabase
          .from('equipment_accessories')
          .insert([payload]);
        if (error) throw error;
        toast.success(t('equipment.detail.accessories.form.toast.created'));
      }
      await loadAccessories();
      closeAccessoryModal();
    } catch (error) {
      console.error('Error saving accessory', error);
      toast.error(t('equipment.detail.accessories.form.toast.error'));
    } finally {
      setIsAccessorySaving(false);
    }
  };

  const handleAccessoryDelete = async () => {
    if (!selectedAccessory?.id) return;
    const confirmed = window.confirm(t('equipment.detail.accessories.form.confirm.delete'));
    if (!confirmed) return;

    setIsAccessorySaving(true);
    try {
      const { error } = await supabase
        .from('equipment_accessories')
        .delete()
        .eq('id', selectedAccessory.id);
      if (error) throw error;
      await loadAccessories();
      closeAccessoryModal();
      toast.success(t('equipment.detail.accessories.form.toast.deleted'));
    } catch (error) {
      console.error('Error deleting accessory', error);
      toast.error(t('equipment.detail.accessories.form.toast.deleteError'));
    } finally {
      setIsAccessorySaving(false);
    }
  };

  useEffect(() => {
    if (!isEditing) {
      setIsImageModalOpen(false);
      setIsPriceModalOpen(false);
      setPriceTarget(null);
      setPriceDraft(null);
      setIsAccessoryModalOpen(false);
      setIsPackSelectionOpen(false);
      setAccessoryModalMode('create');
      setSelectedAccessory(null);
      resetAccessoryForm();
    }
  }, [isEditing]);

  const updateFormValue = <K extends keyof EditableEquipmentFields>(field: K, value: EditableEquipmentFields[K]) => {
    if (field === 'type') {
      categoryAppliedNameRef.current = null;
    }
    if (field === 'subtype') {
      subcategoryAppliedNameRef.current = null;
    }
    setFormValues((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updatePackFormValue = <K extends keyof PackForm>(field: K, value: PackForm[K]) => {
    setPackForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const openPriceModal = (target: 'equipment' | 'pack') => {
    const priceSource = target === 'pack' ? packForm : formValues;
    if (!priceSource) return;
    const htInput = priceSource.rental_price_ht ?? '';
    const ttcInput = priceSource.rental_price_ttc ?? '';
    if (autoEntrepreneurMode) {
      const baseValue = ttcInput.trim().length ? ttcInput : htInput;
      setPriceDraft({
        ht: baseValue,
        ttc: baseValue,
        vat: '0',
        source: 'ttc',
      });
      setPriceTarget(target);
      setIsPriceModalOpen(true);
      return;
    }
    const htValue = parseNumberInput(htInput);
    const ttcValue = parseNumberInput(ttcInput);
    const inferredVat = htValue !== null && ttcValue !== null ? computeVatRate(htValue, ttcValue) : null;
    const initialVat = inferredVat ?? DEFAULT_VAT_RATE;
    let nextHt = htInput;
    let nextTtc = ttcInput;
    let source: PriceDraft['source'] = htInput.trim().length ? 'ht' : 'ttc';

    if (!ttcInput.trim().length && htValue !== null) {
      nextTtc = formatPriceValue(htValue * (1 + initialVat / 100));
      source = 'ht';
    } else if (!htInput.trim().length && ttcValue !== null) {
      nextHt = formatPriceValue(ttcValue / (1 + initialVat / 100));
      source = 'ttc';
    }

    setPriceDraft({
      ht: nextHt,
      ttc: nextTtc,
      vat: String(initialVat),
      source,
    });
    setPriceTarget(target);
    setIsPriceModalOpen(true);
  };

  const closePriceModal = () => {
    setIsPriceModalOpen(false);
    setPriceDraft(null);
    setPriceTarget(null);
  };

  const handlePriceHtChange = (value: string) => {
    setPriceDraft((prev) => {
      if (!prev) return prev;
      const vatValue = Math.max(0, parseNumberInput(prev.vat) ?? 0);
      const htValue = parseNumberInput(value);
      const nextTtc = htValue === null ? '' : formatPriceValue(htValue * (1 + vatValue / 100));
      return { ...prev, ht: value, ttc: nextTtc, source: 'ht' };
    });
  };

  const handlePriceTtcChange = (value: string) => {
    setPriceDraft((prev) => {
      if (!prev) return prev;
      if (autoEntrepreneurMode) {
        return { ...prev, ht: value, ttc: value, vat: '0', source: 'ttc' };
      }
      const vatValue = Math.max(0, parseNumberInput(prev.vat) ?? 0);
      const ttcValue = parseNumberInput(value);
      const nextHt = ttcValue === null ? '' : formatPriceValue(ttcValue / (1 + vatValue / 100));
      return { ...prev, ht: nextHt, ttc: value, source: 'ttc' };
    });
  };

  const handlePriceVatChange = (value: string) => {
    setPriceDraft((prev) => {
      if (!prev) return prev;
      const vatValue = Math.max(0, parseNumberInput(value) ?? 0);
      let nextHt = prev.ht;
      let nextTtc = prev.ttc;

      if (prev.source === 'ttc') {
        const ttcValue = parseNumberInput(prev.ttc);
        nextHt = ttcValue === null ? '' : formatPriceValue(ttcValue / (1 + vatValue / 100));
      } else {
        const htValue = parseNumberInput(prev.ht);
        nextTtc = htValue === null ? '' : formatPriceValue(htValue * (1 + vatValue / 100));
      }

      return { ...prev, vat: value, ht: nextHt, ttc: nextTtc };
    });
  };

  const applyPriceDraft = () => {
    if (!priceDraft) return;
    const normalize = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed.length) return '';
      const parsed = parseNumberInput(trimmed);
      return parsed === null ? trimmed : formatPriceValue(parsed);
    };
    if (autoEntrepreneurMode) {
      const normalizedTtc = normalize(priceDraft.ttc);
      if (priceTarget === 'pack') {
        updatePackFormValue('rental_price_ht', normalizedTtc);
        updatePackFormValue('rental_price_ttc', normalizedTtc);
      } else {
        updateFormValue('rental_price_ht', normalizedTtc);
        updateFormValue('rental_price_ttc', normalizedTtc);
      }
      closePriceModal();
      return;
    }
    if (priceTarget === 'pack') {
      updatePackFormValue('rental_price_ht', normalize(priceDraft.ht));
      updatePackFormValue('rental_price_ttc', normalize(priceDraft.ttc));
    } else {
      updateFormValue('rental_price_ht', normalize(priceDraft.ht));
      updateFormValue('rental_price_ttc', normalize(priceDraft.ttc));
    }
    closePriceModal();
  };

  const handleUnitRowChange = (index: number, patch: Partial<EquipmentUnitFormRow>) => {
    setUnitRowsDraft((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const handleAddUnitRow = () => {
    setUnitRowsDraft((prev) => [
      ...prev,
      {
        serial: '',
        status: 'available',
        warehouse_id: warehouses[0]?.id || null,
        internal_location: formValues?.internal_location.trim() || null,
        internal_location_override: false,
        custom_status_id: null,
      } as EquipmentUnitFormRow,
    ]);
  };

  const handleRemoveUnitRow = (index: number) => {
    setUnitRowsDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleStockRowChange = (index: number, patch: Partial<StockDraftRow>) => {
    setStockRowsDraft((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const handleAddStockRow = () => {
    setStockRowsDraft((prev) => [
      ...prev,
      {
        id: generateTempId(),
        warehouse_id: warehouses[0]?.id || null,
        quantity: '0',
      },
    ]);
  };

  const handleRemoveStockRow = (index: number) => {
    setStockRowsDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handlePackItemChange = (index: number, patch: Partial<PackItemDraft>) => {
    setPackItemsDraft((prev) => prev.map((row, idx) => {
      if (idx !== index) return row;
      if (patch.quantity !== undefined) {
        const parsed = parseNumberInput(patch.quantity);
        if (parsed === null) {
          return { ...row, ...patch };
        }
        const maxAvailable = packAvailability[row.equipment_id];
        const allowedMax = typeof maxAvailable === 'number' ? Math.max(0, maxAvailable) : Infinity;
        const next = Math.max(1, Math.min(allowedMax, Math.floor(parsed)));
        return { ...row, ...patch, quantity: String(next) };
      }
      return { ...row, ...patch };
    }));
  };

  const handleAddPackItem = () => {
    setIsPackSelectionOpen(true);
  };

  const handleRemovePackItem = (index: number) => {
    setPackItemsDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const startPackEditing = () => {
    if (!equipment) return;
    setPackForm({
      name: equipment.name || '',
      rental_price_ht:
        equipment.rental_price_ht !== undefined && equipment.rental_price_ht !== null
          ? String(equipment.rental_price_ht)
          : '',
      rental_price_ttc:
        equipment.rental_price_ttc !== undefined && equipment.rental_price_ttc !== null
          ? String(equipment.rental_price_ttc)
          : '',
      image_url: equipment.image_url || '',
      overview: packProfile?.overview ?? '',
      highlights: packProfile?.highlights ?? '',
      conditions: packProfile?.conditions ?? '',
    });
    setPackItemsDraft(
      packItems.map((item) => ({
        id: item.id,
        equipment_id: item.equipment_id,
        quantity: String(item.quantity ?? 1),
      })),
    );
    setIsEditing(true);
  };

  const handleGenerateQrCode = useCallback(async () => {
    if (!equipment?.id) return;
    try {
      setQrGenerating(true);
      const payload = `equipment:${equipment.id}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('equipment')
        .update({
          qr_code_value: payload,
          qr_code_url: qrUrl,
          qr_code_generated_at: now,
        } as unknown as Record<string, unknown>)
        .eq('id', equipment.id);
      if (updateError) throw updateError;
      await refetch?.();
      toast.success(t('equipment.detail.toast.qrGenerated'));
    } catch (err) {
      console.error('Error generating QR code', err);
      toast.error(t('equipment.detail.toast.qrError'));
    } finally {
      setQrGenerating(false);
    }
  }, [equipment?.id, refetch, t]);

  const handleRegenerateUnitQrCode = useCallback(async (unitId: string) => {
    if (!unitId) return;
    try {
      setUnitQrRefreshingId(unitId);
      const payload = buildEquipmentUnitQrValue(unitId);
      const qrUrl = buildEquipmentUnitQrUrl(payload);
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('equipment_units')
        .update({
          qr_code_value: payload,
          qr_code_url: qrUrl,
          qr_code_generated_at: now,
        } as unknown as Record<string, unknown>)
        .eq('id', unitId);
      if (updateError) throw updateError;

      setUnitList((prev) =>
        prev.map((unit) =>
          unit.id === unitId
            ? {
                ...unit,
                qr_code_value: payload,
                qr_code_url: qrUrl,
                qr_code_generated_at: now,
              }
            : unit,
        ),
      );

      setStocks((prev) =>
        prev.map((entry) => ({
          ...entry,
          units: entry.units.map((unit) =>
            unit.id === unitId
              ? {
                  ...unit,
                  qr_code_value: payload,
                  qr_code_url: qrUrl,
                  qr_code_generated_at: now,
                }
              : unit,
          ),
        })),
      );

      toast.success('QR unitaire régénéré');
    } catch (unitQrError) {
      console.error('Error regenerating unit QR code', unitQrError);
      toast.error('Impossible de régénérer ce QR');
    } finally {
      setUnitQrRefreshingId(null);
    }
  }, []);

  const equipmentInventoryCategory = formValues?.inventory_category ?? equipment?.inventory_category ?? 'series';
  const isSerialTracked = equipmentInventoryCategory === 'series';
  const totalDraftQuantity = stockRowsDraft.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const primaryButtonLabel = isEditing ? t('equipment.detail.actions.save') : t('equipment.detail.actions.edit');
  const PrimaryButtonIcon = isEditing ? Save : Edit;
  const packSelectedEquipmentIds = useMemo(
    () => new Set(packItemsDraft.map((item) => item.equipment_id).filter(Boolean)),
    [packItemsDraft],
  );

  const handlePrimaryAction = () => {
    if (isSavingOverlayVisible || !formValues) return;
    if (!isEditing) {
      if (isPack) {
        startPackEditing();
      } else {
        setIsEditing(true);
      }
      return;
    }
    if (isPack) {
      void handlePackSave();
    } else {
      void handleSave();
    }
  };

  // Load rental history
  useEffect(() => {
    const loadHistory = async () => {
      if (!id || isPack) return;
      setReservationsLoading(true);
      try {
        const { data: items, error: itemsErr } = await supabase
          .from('rental_items')
          .select('id, rental_id, quantity, price_per_day')
          .eq('equipment_id', id);
        if (itemsErr) throw itemsErr;
        const itemRows = items || [];
        if (itemRows.length === 0) {
          setRentalHistory([]);
          setReservations([]);
          setRentalMeta({});
          return;
        }
        const rentalIds = Array.from(new Set(itemRows.map((i) => i.rental_id)));
        if (rentalIds.length === 0) {
          setRentalHistory([]);
          setReservations([]);
          setRentalMeta({});
          return;
        }
        const { data: rentals, error: rentalsErr } = await supabase
          .from('rentals')
          .select('id, client_id, start_date, end_date, status, color, reference_code, location, type')
          .in('id', rentalIds);
        if (rentalsErr) throw rentalsErr;
        const rentalRows = rentals || [];
        if (rentalRows.length === 0) {
          setRentalHistory([]);
          setReservations([]);
          setRentalMeta({});
          return;
        }
        const clientIds = Array.from(new Set((rentals || []).map((r) => r.client_id).filter(Boolean))) as string[];
        const { data: clients, error: clientsErr } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', clientIds.length ? clientIds : ['-']);
        if (clientsErr) throw clientsErr;
        const clientMap = new Map((clients || []).map((c) => [c.id as string, c.name as string] as const));
        const idToItems = new Map<string, any[]>();
        itemRows.forEach((i: any) => {
          const arr = idToItems.get(i.rental_id) || [];
          arr.push(i);
          idToItems.set(i.rental_id, arr);
        });
        const rentalMetaMap: Record<string, RentalMeta> = {};
        const rows = rentalRows.map((r: any) => {
          const days = Math.max(1, Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / (1000 * 60 * 60 * 24)));
          const arr = idToItems.get(r.id) || [];
          const revenue = arr.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price_per_day) || 0) * days, 0);
          const clientName = (r.client_id && clientMap.get(r.client_id)) || '-';
          rentalMetaMap[r.id] = {
            id: r.id,
            startDate: r.start_date,
            endDate: r.end_date,
            status: r.status || 'pending',
            reference: r.reference_code || (typeof r.id === 'string' ? r.id.slice(0, 6) : ''),
            clientName,
            color: r.color || null,
            location: r.location || null,
            type: r.type || null,
          };
          return {
            id: r.id,
            client: clientName,
            startDate: r.start_date,
            endDate: r.end_date,
            duration: days,
            revenue,
            status: r.status || 'pending',
          };
        });
        setRentalHistory(rows);
        setRentalMeta(rentalMetaMap);
        const aggregatedReservations = Array.from(idToItems.entries())
          .flatMap(([rentalId, rentalItems]) => {
            const meta = rentalMetaMap[rentalId];
            if (!meta) return [];
            return rentalItems.map((item: any) => ({
              id: item.id || `${rentalId}-${item.start_date || ''}`,
              rentalId,
              startDate: meta.startDate,
              endDate: meta.endDate,
              status: meta.status,
              reference: meta.reference,
              clientName: meta.clientName,
              quantity: Number(item.quantity) || 0,
              color: meta.color,
              location: meta.location,
              type: meta.type,
            })) as EquipmentReservationEvent[];
          })
          .sort(
            (a, b) =>
              new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
          );
        setReservations(aggregatedReservations);
      } catch (e) {
        console.error('Error loading rental history', e);
        setRentalHistory([]);
        setReservations([]);
        setRentalMeta({});
      } finally {
        setReservationsLoading(false);
      }
    };
    loadHistory();
  }, [id, isPack]);

  useEffect(() => {
    const loadUnitReservations = async () => {
      if (isPack || !id || !equipment || equipment.inventory_category !== 'series') {
        setUnitReservations([]);
        setUnitReservationsLoading(false);
        return;
      }
      if (!Object.keys(rentalMeta).length) {
        setUnitReservations([]);
        return;
      }
      const unitIds = unitList.map((u) => u.id).filter(Boolean);
      if (unitIds.length === 0) {
        setUnitReservations([]);
        setUnitReservationsLoading(false);
        return;
      }
      setUnitReservationsLoading(true);
      try {
        const { data, error } = await supabase
          .from('rental_unit_reservations')
          .select('id, rental_id, equipment_unit_id, start_date, end_date')
          .in('equipment_unit_id', unitIds);
        if (error) throw error;
        const unitLabelMap = new Map(unitList.map((u) => [u.id, u.serial_number || null] as const));
        const mapped = (data || [])
          .map((row: any) => {
            const meta = rentalMeta[row.rental_id];
            if (!meta) return null;
            return {
              id: row.id,
              unitId: row.equipment_unit_id,
              rentalId: row.rental_id,
              startDate: row.start_date,
              endDate: row.end_date,
              serialNumber: unitLabelMap.get(row.equipment_unit_id) || null,
              status: meta.status,
              reference: meta.reference,
              clientName: meta.clientName,
              color: meta.color,
              location: meta.location,
            } as EquipmentUnitReservation;
          })
          .filter(Boolean) as EquipmentUnitReservation[];
        setUnitReservations(mapped);
      } catch (e) {
        console.error('Error loading unit reservations', e);
        setUnitReservations([]);
      } finally {
        setUnitReservationsLoading(false);
      }
    };
    loadUnitReservations();
  }, [id, equipment, isPack, unitList, rentalMeta]);

  const loadMaintenanceState = useCallback(async () => {
    if (!id || isPack) {
      setMaintenanceHistory([]);
      setMaintenanceOpenCount(0);
      return;
    }
    try {
      const [
        { data, error: mErr },
        { count: mCount, error: countErr },
      ] = await Promise.all([
        supabase
          .from('maintenance_tasks')
          .select('id, type, description, scheduled_date, completed_date, status, cost')
          .eq('equipment_id', id)
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('equipment_unit_maintenance_history')
          .select('id', { count: 'exact', head: true })
          .eq('equipment_id', id)
          .in('status', ['scheduled', 'in_progress']),
      ]);

      if (mErr) throw mErr;
      if (countErr) throw countErr;

      const rows = (data || []).map((m: any) => ({
        id: m.id as string,
        type: m.type as string,
        date: (m.completed_date as string) || (m.scheduled_date as string),
        description: (m.description as string | null) ?? null,
        cost: (m.cost as number) || 0,
        status: (m.status as string) || 'pending',
      }));
      setMaintenanceHistory(rows);
      setMaintenanceOpenCount(mCount || 0);
    } catch (e) {
      console.error('Error loading maintenance', e);
      setMaintenanceHistory([]);
      setMaintenanceOpenCount(0);
    }
  }, [id, isPack]);

  useEffect(() => {
    void loadMaintenanceState();
  }, [loadMaintenanceState]);

  const handleCompleteMaintenance = useCallback(async (taskId: string) => {
    if (maintenanceActionId) return;
    try {
      setMaintenanceActionId(taskId);
      setMaintenanceActionKind('complete');
      await completeMaintenanceTask(taskId);
      toast.success('Maintenance terminée');
      await loadMaintenanceState();
      await loadStocks();
    } catch (error) {
      console.error('Error completing maintenance from equipment detail', error);
      toast.error('Impossible de terminer la maintenance');
    } finally {
      setMaintenanceActionId(null);
      setMaintenanceActionKind(null);
    }
  }, [loadMaintenanceState, loadStocks, maintenanceActionId]);

  const handleDeleteMaintenance = useCallback(async (taskId: string) => {
    if (maintenanceActionId) return;
    if (!window.confirm('Supprimer cette maintenance ?')) return;
    try {
      setMaintenanceActionId(taskId);
      setMaintenanceActionKind('delete');
      await deleteMaintenanceTask(taskId);
      toast.success('Maintenance supprimée');
      await loadMaintenanceState();
      await loadStocks();
    } catch (error) {
      console.error('Error deleting maintenance from equipment detail', error);
      toast.error('Impossible de supprimer la maintenance');
    } finally {
      setMaintenanceActionId(null);
      setMaintenanceActionKind(null);
    }
  }, [loadMaintenanceState, loadStocks, maintenanceActionId]);

  const handleEditSubmit = async ({
    data,
    units,
    stock,
  }: {
    data: Partial<Equipment>;
    units: EquipmentUnitFormRow[];
    stock?: { warehouse_id: string | null; quantity: number }[];
  }): Promise<boolean> => {
    if (!equipment) return false;
    try {
      const targetCategory = (data.inventory_category as Equipment['inventory_category']) || equipment.inventory_category || 'series';
      const normalizedUnits = units.map((row) => ({
        ...row,
        serial: row.serial.trim(),
      }));

      await updateEquipment(equipment.id, data);

      if (targetCategory === 'series') {
        const incomingIds = new Set(normalizedUnits.filter((row) => (row as any).id).map((row) => (row as any).id as string));

        const toDelete = unitList.filter((u) => !incomingIds.has(u.id)).map((u) => u.id);
        if (toDelete.length) {
          await supabase.from('equipment_units').delete().in('id', toDelete);
        }

        const toUpdate = normalizedUnits.filter((row) => (row as any).id);
        if (toUpdate.length) {
          await Promise.all(
            toUpdate.map((row) =>
              supabase
                .from('equipment_units')
                .update({
                  serial_number: row.serial,
                  status: row.status,
                  warehouse_id: row.warehouse_id,
                  internal_location: row.internal_location?.trim() || null,
                  internal_location_override: row.internal_location_override === true,
                  custom_status_id: row.custom_status_id || null,
                })
                .eq('id', (row as any).id as string),
            ),
          );
        }

        const toInsert = normalizedUnits.filter((row) => !(row as any).id);
        if (toInsert.length) {
          await supabase.from('equipment_units').insert(
            toInsert.map((row) => ({
              equipment_id: equipment.id,
              serial_number: row.serial,
              status: row.status,
              warehouse_id: row.warehouse_id,
              internal_location: row.internal_location?.trim() || null,
              internal_location_override: row.internal_location_override === true,
              custom_status_id: row.custom_status_id || null,
            })),
          );
        }

        const counts = new Map<string, number>();
        normalizedUnits.forEach((row) => {
          if (!row.warehouse_id) return;
          counts.set(row.warehouse_id, (counts.get(row.warehouse_id) || 0) + 1);
        });
        await supabase.from('equipment_stock').delete().eq('equipment_id', equipment.id);
        const stockPayload = Array.from(counts.entries()).map(([warehouse_id, quantity]) => ({
          equipment_id: equipment.id,
          warehouse_id,
          quantity,
        }));
        if (stockPayload.length) {
          await supabase.from('equipment_stock').insert(stockPayload);
        }
      } else {
        await supabase.from('equipment_units').delete().eq('equipment_id', equipment.id);
        await supabase.from('equipment_stock').delete().eq('equipment_id', equipment.id);

        const rows = Array.isArray(stock) ? stock : [];
        if (rows.length) {
          let defaultWarehouseId: string | null = null;
          const resolvedStock: Array<{ warehouse_id: string; quantity: number }> = [];
          for (const row of rows) {
            const quantity = Math.max(0, Number(row.quantity) || 0);
            if (quantity === 0) continue;
            let warehouseId = row.warehouse_id;
            if (!warehouseId) {
              if (!defaultWarehouseId) {
                const { data: existing, error: defaultErr } = await supabase
                  .from('warehouses')
                  .select('id')
                  .eq('name', 'Défaut')
                  .maybeSingle();
                if (defaultErr) throw defaultErr;
                if (existing?.id) {
                  defaultWarehouseId = existing.id as string;
                } else {
                  const { data: created, error: createErr } = await supabase
                    .from('warehouses')
                    .insert([{ name: 'Défaut', address: 'Adresse par défaut' }])
                    .select('id')
                    .single();
                  if (createErr) throw createErr;
                  defaultWarehouseId = (created as any).id as string;
                }
              }
              warehouseId = defaultWarehouseId;
            }
            if (!warehouseId) continue;
            resolvedStock.push({ warehouse_id: warehouseId, quantity });
          }
          if (resolvedStock.length) {
            await supabase.from('equipment_stock').insert(
              resolvedStock.map((row) => ({
                equipment_id: equipment.id,
                warehouse_id: row.warehouse_id,
                quantity: row.quantity,
              })),
            );
          }
        }
      }

      await loadStocks();
      return true;
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast.error(t('equipment.detail.toast.updateError'));
      return false;
    }
  };

  const handlePackSave = async () => {
    if (!equipment || !packForm || !isEditing) return;

    const trimmedName = packForm.name.trim();
    if (!trimmedName) {
      toast.error(t('pack.detail.toast.nameRequired'));
      return;
    }

    const rentalHtInput = packForm.rental_price_ht.trim();
    const rentalTtcInput = packForm.rental_price_ttc.trim();
    const effectivePriceInput = autoEntrepreneurMode
      ? (rentalTtcInput.length ? rentalTtcInput : rentalHtInput)
      : rentalTtcInput;
    const rentalHtValue = autoEntrepreneurMode
      ? (effectivePriceInput.length ? Number(effectivePriceInput) : 0)
      : (rentalHtInput.length ? Number(rentalHtInput) : 0);
    const rentalTtcValue = effectivePriceInput.length ? Number(effectivePriceInput) : 0;

    if (!autoEntrepreneurMode && rentalHtInput.length && Number.isNaN(rentalHtValue)) {
      toast.error(t('pack.detail.toast.priceInvalid'));
      return;
    }

    if (effectivePriceInput.length && Number.isNaN(rentalTtcValue)) {
      toast.error(t('pack.detail.toast.priceInvalid'));
      return;
    }

    if (packItemsDraft.some((row) => !row.equipment_id)) {
      toast.error(t('pack.detail.toast.itemRequired'));
      return;
    }

    const normalizedItems = packItemsDraft.map((row, index) => {
      const quantityValue = parseNumberInput(row.quantity);
      if (quantityValue === null) {
        throw new Error('invalid_quantity');
      }
      return {
        equipment_id: row.equipment_id,
        quantity: Math.max(1, Math.floor(quantityValue)),
        sort_order: index,
      };
    });

    for (const item of normalizedItems) {
      const maxAvailable = packAvailability[item.equipment_id];
      if (typeof maxAvailable === 'number' && item.quantity > maxAvailable) {
        const eq = packItemOptions.find((opt) => opt.id === item.equipment_id);
        toast.error(t('rentals.selection.toast.insufficientStock', {
          name: eq?.name || t('pack.detail.contents.emptyValue'),
          count: maxAvailable,
        }));
        return;
      }
    }

    const uniqueIds = new Set(normalizedItems.map((item) => item.equipment_id));
    if (uniqueIds.size !== normalizedItems.length) {
      toast.error(t('pack.detail.toast.itemsDuplicate'));
      return;
    }

    setIsSavingOverlayVisible(true);
    try {
      await updateEquipment(equipment.id, {
        name: trimmedName,
        type: 'Pack',
        subtype: null,
        status: formValues?.status ?? equipment.status,
        rental_price_ht: Number.isNaN(rentalHtValue) ? 0 : (autoEntrepreneurMode ? rentalTtcValue : rentalHtValue),
        rental_price_ttc: Number.isNaN(rentalTtcValue) ? 0 : rentalTtcValue,
        image_url: packForm.image_url.trim() ? packForm.image_url.trim() : null,
      });

      const packPayload = {
        equipment_id: equipment.id,
        overview: packForm.overview.trim() ? packForm.overview.trim() : null,
        highlights: packForm.highlights.trim() ? packForm.highlights.trim() : null,
        conditions: packForm.conditions.trim() ? packForm.conditions.trim() : null,
      };
      const { error: packErr } = await supabase
        .from('equipment_packs')
        .upsert([packPayload], { onConflict: 'equipment_id' });
      if (packErr) throw packErr;

      await supabase.from('equipment_pack_items').delete().eq('pack_id', equipment.id);
      if (normalizedItems.length) {
        const { error: itemsErr } = await supabase
          .from('equipment_pack_items')
          .insert(
            normalizedItems.map((item) => ({
              pack_id: equipment.id,
              equipment_id: item.equipment_id,
              quantity: item.quantity,
              sort_order: item.sort_order,
            })),
          );
        if (itemsErr) throw itemsErr;
      }

      await loadPackData();
      setIsEditing(false);
    } catch (error) {
      if ((error as Error).message === 'invalid_quantity') {
        toast.error(t('pack.detail.toast.quantityInvalid'));
      } else {
        console.error('Error updating pack:', error);
        toast.error(t('pack.detail.toast.updateError'));
      }
    } finally {
      setTimeout(() => {
        setIsSavingOverlayVisible(false);
      }, 450);
    }
  };

  const handleSave = async () => {
    if (!equipment || !formValues || !isEditing) return;

    const trimmedName = formValues.name.trim();
    if (!trimmedName) {
      toast.error(t('equipment.detail.toast.nameRequired'));
      return;
    }

    const trimmedType = formValues.type.trim();
    if (!trimmedType) {
      toast.error(t('equipment.detail.toast.typeRequired'));
      return;
    }

    const trimmedSubtype = formValues.subtype.trim();

    const rentalHtInput = formValues.rental_price_ht.trim();
    const rentalTtcInput = formValues.rental_price_ttc.trim();
    const effectivePriceInput = autoEntrepreneurMode
      ? (rentalTtcInput.length ? rentalTtcInput : rentalHtInput)
      : rentalTtcInput;
    const rentalHtValue = autoEntrepreneurMode
      ? (effectivePriceInput.length ? Number(effectivePriceInput) : 0)
      : (rentalHtInput.length ? Number(rentalHtInput) : 0);
    const rentalTtcValue = effectivePriceInput.length ? Number(effectivePriceInput) : 0;

    if (!autoEntrepreneurMode && rentalHtInput.length && Number.isNaN(rentalHtValue)) {
      toast.error(t('equipment.detail.toast.rentalHtInvalid'));
      return;
    }

    if (effectivePriceInput.length && Number.isNaN(rentalTtcValue)) {
      toast.error(t('equipment.detail.toast.rentalTtcInvalid'));
      return;
    }

    const unitWeightInput = formValues.unit_weight_kg.trim();
    const unitVolumeInput = formValues.unit_volume_m3.trim();
    const unitWeightValue = unitWeightInput.length ? Number(unitWeightInput.replace(',', '.')) : null;
    const unitVolumeValue = unitVolumeInput.length ? Number(unitVolumeInput.replace(',', '.')) : null;

    if (unitWeightValue !== null && (!Number.isFinite(unitWeightValue) || unitWeightValue < 0)) {
      toast.error('Le poids unitaire logistique doit être un nombre positif.');
      return;
    }

    if (unitVolumeValue !== null && (!Number.isFinite(unitVolumeValue) || unitVolumeValue < 0)) {
      toast.error('Le volume unitaire logistique doit être un nombre positif.');
      return;
    }

    if (isSerialTracked) {
      const hasEmptySerial = unitRowsDraft.some((row) => row.serial.trim().length === 0);
      if (hasEmptySerial) {
        toast.error(t('equipment.detail.toast.serialsMissing'));
        return;
      }
    }

    const normalizedUnits = isSerialTracked
      ? unitRowsDraft.map((row) => ({
          ...row,
          serial: row.serial.trim(),
          internal_location: row.internal_location?.trim() || null,
          internal_location_override: row.internal_location_override === true,
        }))
      : [];

    const normalizedStock = !isSerialTracked
      ? stockRowsDraft
          .map((row) => ({
            warehouse_id: row.warehouse_id,
            quantity: Math.max(0, Number(row.quantity) || 0),
          }))
          .filter((row) => row.quantity > 0 || !!row.warehouse_id)
      : undefined;

    // ⚠️ Ne pas écrire un champ possiblement absent du type Equipment (ex: serial_number)
    const normalizedData: Partial<Equipment> = {
      name: trimmedName,
      type: trimmedType,
      subtype: trimmedSubtype ? trimmedSubtype : null,
      status: formValues.status,
      custom_status_id: formValues.inventory_category === 'series' ? null : (formValues.custom_status_id || null),
      inventory_category: formValues.inventory_category,
      rental_price_ht: Number.isNaN(rentalHtValue) ? 0 : (autoEntrepreneurMode ? rentalTtcValue : rentalHtValue),
      rental_price_ttc: Number.isNaN(rentalTtcValue) ? 0 : rentalTtcValue,
      unit_weight_kg: unitWeightValue,
      unit_volume_m3: unitVolumeValue,
      description: formValues.description.trim() ? formValues.description.trim() : null,
      category_id: formValues.category_id || null,
      subcategory_id: formValues.subcategory_id || null,
      internal_location: formValues.internal_location.trim() ? formValues.internal_location.trim() : null,
      image_url: formValues.image_url.trim() ? formValues.image_url.trim() : null,
      is_public: formValues.is_public,
    };

    setIsSavingOverlayVisible(true);
    let success = false;
    try {
      success = await handleEditSubmit({
        data: normalizedData,
        units: normalizedUnits as EquipmentUnitFormRow[],
        stock: normalizedStock,
      });
      if (success) {
        setIsEditing(false);
      }
    } finally {
      setTimeout(() => {
        setIsSavingOverlayVisible(false);
      }, 450);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !equipment) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">{t('equipment.detail.notFound.title')}</h3>
        <p className="mt-2 text-sm text-gray-500">{t('equipment.detail.notFound.description')}</p>
        <button
          onClick={() => navigate('/equipment')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          {t('equipment.detail.notFound.action')}
        </button>
      </div>
    );
  }

  if (!formValues) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const headerName = isPack
    ? (isEditing ? (packForm?.name || equipment.name) : equipment.name)
    : (isEditing ? formValues.name : equipment.name);

  const trimmedImageUrl = formValues.image_url?.trim() ?? '';
  const previewImageUrl = trimmedImageUrl.length > 0 ? trimmedImageUrl : DEFAULT_EQUIPMENT_IMAGE;
  const baseEquipmentImage = equipment.image_url ? equipment.image_url.trim() : '';
  const displayImageUrl = isEditing ? previewImageUrl : (baseEquipmentImage.length ? baseEquipmentImage : DEFAULT_EQUIPMENT_IMAGE);
  const packPreviewImageUrl = packForm?.image_url?.trim() ?? '';
  const packPreviewImage = packPreviewImageUrl.length > 0 ? packPreviewImageUrl : DEFAULT_EQUIPMENT_IMAGE;
  const packDisplayImage = isEditing ? packPreviewImage : (baseEquipmentImage.length ? baseEquipmentImage : DEFAULT_EQUIPMENT_IMAGE);
  const packItemsCount = isEditing ? packItemsDraft.length : packItems.length;

  const editingStatus = formValues.status;
  const displayStatus = isEditing ? editingStatus : equipment.status;
  const totalUnits = (() => {
    if (isPack) return equipment.total_units ?? 0;
    const category = (isEditing ? formValues?.inventory_category : equipment.inventory_category) ?? equipment.inventory_category;
    if (category === 'series') return unitList.length;
    return stocks.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  })();
  const maintenanceCount = maintenanceOpenCount || equipment.maintenance_count || 0;
  const effectiveDisplayStatus =
    displayStatus === 'broken'
      ? 'broken'
      : maintenanceCount > 0
        ? 'maintenance'
        : displayStatus;
  const effectiveEquipmentStatus =
    equipment.status === 'broken'
      ? 'broken'
      : maintenanceCount > 0
        ? 'maintenance'
        : equipment.status;
  const statusLabel = formatEquipmentStatusLabel(
    effectiveDisplayStatus,
    effectiveDisplayStatus === 'maintenance'
      ? maintenanceDetailedLabel
      : (statusLabels[effectiveDisplayStatus] ?? effectiveDisplayStatus),
    maintenanceCount,
    totalUnits
  );
  const equipmentStatusLabel = formatEquipmentStatusLabel(
    effectiveEquipmentStatus,
    effectiveEquipmentStatus === 'maintenance'
      ? maintenanceDetailedLabel
      : (statusLabels[effectiveEquipmentStatus] ?? effectiveEquipmentStatus),
    maintenanceCount,
    totalUnits
  );
  const displayCustomStatusId = isEditing
    ? (formValues.custom_status_id || null)
    : (equipment.custom_status_id || null);
  const displayCustomStatus = displayCustomStatusId ? (customStatusById.get(displayCustomStatusId) || null) : null;

  const currentInventoryCategory = (isEditing ? (formValues.inventory_category || equipment.inventory_category) : equipment.inventory_category) as Equipment['inventory_category'];
  const inventoryCategoryLabel = inventoryCategoryLabels[currentInventoryCategory];
  const rentalHtValue = parseNumberInput(formValues?.rental_price_ht ?? '');
  const rentalTtcValue = parseNumberInput(formValues?.rental_price_ttc ?? '');
  const rentalHtDisplay = rentalHtValue === null ? t('equipment.detail.view.empty') : `${formatPriceValue(rentalHtValue)} €`;
  const rentalTtcDisplay = rentalTtcValue === null ? t('equipment.detail.view.empty') : `${formatPriceValue(rentalTtcValue)} €`;
  const packHtValue = parseNumberInput(packForm?.rental_price_ht ?? '');
  const packTtcValue = parseNumberInput(packForm?.rental_price_ttc ?? '');
  const packHtDisplay = packHtValue === null ? t('equipment.detail.view.empty') : `${formatPriceValue(packHtValue)} €`;
  const packTtcDisplay = packTtcValue === null ? t('equipment.detail.view.empty') : `${formatPriceValue(packTtcValue)} €`;
  const unitWeightValue = isEditing
    ? parseNumberInput(formValues?.unit_weight_kg ?? '')
    : (equipment.unit_weight_kg === null || equipment.unit_weight_kg === undefined ? null : Number(equipment.unit_weight_kg));
  const unitVolumeValue = isEditing
    ? parseNumberInput(formValues?.unit_volume_m3 ?? '')
    : (equipment.unit_volume_m3 === null || equipment.unit_volume_m3 === undefined ? null : Number(equipment.unit_volume_m3));
  const totalWeightValue = (() => {
    if (isEditing) {
      if (unitWeightValue === null) return null;
      return Math.round(unitWeightValue * totalUnits * 1000) / 1000;
    }

    if (currentInventoryCategory === 'series') {
      if (unitList.length === 0) {
        if (unitWeightValue === null) return null;
        return Math.round(unitWeightValue * totalUnits * 1000) / 1000;
      }
      const hasWeightValue = unitList.some((unit) => unit.logistics_weight_kg !== null) || unitWeightValue !== null;
      if (!hasWeightValue) return null;
      const total = unitList.reduce(
        (sum, unit) => sum + (unit.logistics_weight_kg ?? unitWeightValue ?? 0),
        0,
      );
      return Math.round(total * 1000) / 1000;
    }

    if (unitWeightValue === null) return null;
    return Math.round(unitWeightValue * totalUnits * 1000) / 1000;
  })();
  const totalVolumeValue = (() => {
    if (isEditing) {
      if (unitVolumeValue === null) return null;
      return Math.round(unitVolumeValue * totalUnits * 100000) / 100000;
    }

    if (currentInventoryCategory === 'series') {
      if (unitList.length === 0) {
        if (unitVolumeValue === null) return null;
        return Math.round(unitVolumeValue * totalUnits * 100000) / 100000;
      }
      const hasVolumeValue = unitList.some((unit) => unit.logistics_volume_m3 !== null) || unitVolumeValue !== null;
      if (!hasVolumeValue) return null;
      const total = unitList.reduce(
        (sum, unit) => sum + (unit.logistics_volume_m3 ?? unitVolumeValue ?? 0),
        0,
      );
      return Math.round(total * 100000) / 100000;
    }

    if (unitVolumeValue === null) return null;
    return Math.round(unitVolumeValue * totalUnits * 100000) / 100000;
  })();
  const accessoryPreviewUrl = parseSingleImageUrl(accessoryForm.imageUrl);
  const accessoryModalTitle = accessoryModalMode === 'edit'
    ? t('equipment.detail.accessories.modal.editTitle')
    : accessoryModalMode === 'view'
      ? t('equipment.detail.accessories.modal.viewTitle')
      : t('equipment.detail.accessories.modal.createTitle');
  const accessoryModalSubtitle = accessoryModalMode === 'edit'
    ? t('equipment.detail.accessories.modal.editSubtitle')
    : accessoryModalMode === 'view'
      ? t('equipment.detail.accessories.modal.viewSubtitle')
      : t('equipment.detail.accessories.modal.createSubtitle');
  const isAccessoryReadOnly = accessoryModalMode === 'view';
  const accessoryModalCloseLabel = isAccessoryReadOnly ? t('common.close') : t('common.cancel');

  // Champs optionnels (non typés dans Equipment) sécurisés
  const qrCodeUrl = (equipment as any)?.qr_code_url as string | undefined;
  const qrCodeGeneratedAt = (equipment as any)?.qr_code_generated_at as string | undefined;
  const qrCodeValue = ((equipment as any)?.qr_code_value as string | undefined) ?? (equipment ? `equipment:${equipment.id}` : '—');
  const selectedUnit = selectedUnitId ? unitList.find((unit) => unit.id === selectedUnitId) || null : null;
  const selectedUnitHistory = selectedUnitId ? unitHistoryByUnitId[selectedUnitId] || [] : [];
  const unitHistoryCountByUnitId: Record<string, number> = {};
  Object.entries(unitHistoryByUnitId).forEach(([unitId, events]) => {
    unitHistoryCountByUnitId[unitId] = events.length;
  });
  const selectedUnitCustomStatus = selectedUnit?.custom_status_id ? (customStatusById.get(selectedUnit.custom_status_id) || null) : null;
  const selectedUnitStatusLabel = selectedUnitCustomStatus
    ? selectedUnitCustomStatus.name
    : selectedUnit?.status
      ? (statusLabels[selectedUnit.status as Equipment['status']] ?? selectedUnit.status)
      : '—';
  const selectedUnitQrValue = selectedUnit ? (selectedUnit.qr_code_value || buildEquipmentUnitQrValue(selectedUnit.id)) : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link
            to="/equipment"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{headerName}</h1>
          <span
            className={`px-3 py-1 rounded-full text-sm ${
              displayStatus === 'available'
                ? 'bg-green-100 text-green-800'
                : displayStatus === 'in_use'
                  ? 'bg-blue-100 text-blue-800'
                  : displayStatus === 'maintenance'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={isSavingOverlayVisible || !formValues}
          className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors ${
            isSavingOverlayVisible
              ? 'bg-blue-400 cursor-not-allowed'
              : isEditing
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          <PrimaryButtonIcon className="h-4 w-4 mr-2" />
          {primaryButtonLabel}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 px-4 sm:px-6">
        <nav className="-mb-px flex space-x-6 sm:space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="rounded-lg">
        {activeTab === 'overview' && (
          isPack ? (
            <div className="bg-gray-100 p-6 space-y-6">
              {packLoading || !packForm ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                  <div className="flex-1 space-y-6">
                    <div className="bg-white rounded-lg p-6 space-y-6">
                      <h3 className="text-lg font-semibold text-gray-900">{t('pack.detail.overview.title')}</h3>
                      {isEditing ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.name')}</label>
                            <Input
                              value={packForm.name}
                              onChange={(e) => updatePackFormValue('name', e.target.value)}
                              placeholder={t('pack.detail.overview.placeholders.name')}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.status')}</label>
                            <Select
                              value={formValues.status}
                              onChange={(e) => updateFormValue('status', e.target.value as Equipment['status'])}
                            >
                              {statusOptions.map((status) => (
                                <option key={status} value={status}>{statusLabels[status]}</option>
                              ))}
                            </Select>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-gray-600">{t('equipment.wizard.steps.pricing')}</label>
                            <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-col gap-3 text-sm">
                                {!autoEntrepreneurMode && (
                                  <div className="flex flex-col">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('pack.detail.overview.fields.priceHt')}</span>
                                    <span className="font-medium text-slate-900">
                                      {packHtDisplay}
                                      {packHtValue !== null && (
                                        <span className="ml-1 text-xs text-slate-500">{t('equipment.detail.view.perDay')}</span>
                                      )}
                                    </span>
                                  </div>
                                )}
                                <div className="flex flex-col">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('pack.detail.overview.fields.priceTtc')}</span>
                                  <span className="font-medium text-slate-900">
                                    {packTtcDisplay}
                                    {packTtcValue !== null && (
                                      <span className="ml-1 text-xs text-slate-500">{t('equipment.detail.view.perDay')}</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openPriceModal('pack')}
                                className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                              >
                                {t('equipment.detail.actions.edit')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.name')}</p>
                            <p className="text-sm text-gray-900">{equipment.name}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.status')}</p>
                            <p className="text-sm text-gray-900">{equipmentStatusLabel}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.type')}</p>
                            <p className="text-sm text-gray-900">{t('equipment.list.packLabel')}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.priceTtc')}</p>
                            <p className="text-sm text-gray-900">
                              {(equipment.rental_price_ttc ?? 0).toFixed(2)} €
                              <span className="ml-1 text-xs text-gray-500">{t('equipment.detail.view.perDay')}</span>
                            </p>
                          </div>
                          {!autoEntrepreneurMode && (
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.priceHt')}</p>
                              <p className="text-sm text-gray-900">
                                {(equipment.rental_price_ht ?? 0).toFixed(2)} €
                                <span className="ml-1 text-xs text-gray-500">{t('equipment.detail.view.perDay')}</span>
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="bg-white rounded-lg p-6 space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">{t('pack.detail.overview.sections.details')}</h3>
                      {isEditing ? (
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.overview')}</label>
                            <Textarea
                              rows={4}
                              value={packForm.overview}
                              onChange={(e) => updatePackFormValue('overview', e.target.value)}
                              placeholder={t('pack.detail.overview.placeholders.overview')}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.highlights')}</label>
                            <Textarea
                              rows={3}
                              value={packForm.highlights}
                              onChange={(e) => updatePackFormValue('highlights', e.target.value)}
                              placeholder={t('pack.detail.overview.placeholders.highlights')}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-600">{t('pack.detail.overview.fields.conditions')}</label>
                            <Textarea
                              rows={3}
                              value={packForm.conditions}
                              onChange={(e) => updatePackFormValue('conditions', e.target.value)}
                              placeholder={t('pack.detail.overview.placeholders.conditions')}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t('pack.detail.overview.fields.overview')}
                            </div>
                            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                              {packProfile?.overview?.trim() || t('pack.detail.overview.empty')}
                            </p>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t('pack.detail.overview.fields.highlights')}
                            </div>
                            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                              {packProfile?.highlights?.trim() || t('pack.detail.overview.empty')}
                            </p>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t('pack.detail.overview.fields.conditions')}
                            </div>
                            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                              {packProfile?.conditions?.trim() || t('pack.detail.overview.empty')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:w-1/3 lg:min-w-[240px] flex-shrink-0 self-stretch">
                    <div className="bg-white rounded-lg p-4 h-full flex flex-col gap-4">
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => setIsImageModalOpen(true)}
                          className="relative w-full aspect-square overflow-hidden rounded-lg bg-gray-200 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                          <img
                            src={packDisplayImage}
                            alt={packForm.name || equipment.name}
                            className="h-full w-full object-cover transition duration-200 group-hover:opacity-80"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <div className="flex items-center gap-2 rounded-full border border-dashed border-white/70 bg-white/10 px-3 py-1.5 text-white">
                              <ImagePlus className="h-4 w-4" />
                              <span className="text-xs font-medium">{t('equipment.detail.preview.actions.editImage')}</span>
                            </div>
                          </div>
                        </button>
                      ) : (
                        <div className="w-full aspect-square overflow-hidden rounded-lg bg-gray-200">
                          <img
                            src={packDisplayImage}
                            alt={equipment.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <div className="text-center space-y-1.5">
                        <h2 className="text-lg font-semibold text-gray-900">{isEditing ? packForm.name : equipment.name}</h2>
                        <p className="text-sm text-gray-600">{t('equipment.list.packLabel')}</p>
                        <p className="text-xs uppercase tracking-wide text-gray-400">
                          {t('pack.detail.sidebar.itemsCount', { count: packItemsCount })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-100 p-6 space-y-6">
              <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                <div className="flex-1">
                  <div className="bg-white rounded-lg p-6 h-full flex flex-col gap-6">
                    {isEditing ? (
                      <>
                        <div className="space-y-4">
                          <Text as="h3" variant="subtitle">
                            {t('equipment.detail.edit.sections.main')}
                          </Text>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Field label={t('equipment.detail.edit.fields.name')} id="equipment-name">
                              <Input
                                id="equipment-name"
                                value={formValues.name}
                                onChange={(e) => updateFormValue('name', e.target.value)}
                                placeholder={t('equipment.detail.edit.placeholders.name')}
                              />
                            </Field>
                            <Field label={t('equipment.detail.edit.fields.inventoryCategory')} id="equipment-inventory-category">
                              <Select
                                id="equipment-inventory-category"
                                value={formValues.inventory_category}
                                onChange={(e) => updateFormValue('inventory_category', e.target.value as Equipment['inventory_category'])}
                              >
                                <option value="series">{inventoryCategoryLabels.series}</option>
                                <option value="vrac">{inventoryCategoryLabels.vrac}</option>
                                <option value="consommable">{inventoryCategoryLabels.consommable}</option>
                              </Select>
                            </Field>
                            <Field label={t('equipment.detail.edit.fields.status')} id="equipment-status">
                              <Select
                                id="equipment-status"
                                value={formValues.status}
                                onChange={(e) => updateFormValue('status', e.target.value as Equipment['status'])}
                              >
                                {statusOptions.map((status) => (
                                  <option key={status} value={status}>{statusLabels[status]}</option>
                                ))}
                              </Select>
                            </Field>
                            {formValues.inventory_category !== 'series' ? (
                              <Field label="Statut personnalisé" id="equipment-custom-status">
                                <Select
                                  id="equipment-custom-status"
                                  value={formValues.custom_status_id || ''}
                                  onChange={(e) => updateFormValue('custom_status_id', e.target.value ? e.target.value : null)}
                                >
                                  <option value="">Aucun</option>
                                  {equipmentCustomStatuses.map((customStatus) => (
                                    <option key={customStatus.id} value={customStatus.id}>
                                      {customStatus.name}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                            ) : (
                              <Field label="Statut personnalisé" id="equipment-custom-status-series-info">
                                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                  En suivi série, le statut personnalisé se gère unité par unité dans l’onglet Stock.
                                </div>
                              </Field>
                            )}
                            <Field label={t('equipment.wizard.steps.pricing')} className="md:col-span-2">
                              <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-col gap-3 text-sm">
                                  {!autoEntrepreneurMode && (
                                    <div className="flex flex-col">
                                      <Text as="span" variant="muted" className="uppercase tracking-wide">
                                        {t('equipment.detail.edit.fields.rentalHt')}
                                      </Text>
                                      <Text as="span" variant="body" className="font-semibold text-slate-900">
                                        {rentalHtDisplay}
                                        {rentalHtValue !== null && (
                                          <Text as="span" variant="muted" className="ml-1 text-xs text-slate-500">
                                            {t('equipment.detail.view.perDay')}
                                          </Text>
                                        )}
                                      </Text>
                                    </div>
                                  )}
                                  <div className="flex flex-col">
                                    <Text as="span" variant="muted" className="uppercase tracking-wide">
                                      {t('equipment.detail.edit.fields.rentalTtc')}
                                    </Text>
                                    <Text as="span" variant="body" className="font-semibold text-slate-900">
                                      {rentalTtcDisplay}
                                      {rentalTtcValue !== null && (
                                        <Text as="span" variant="muted" className="ml-1 text-xs text-slate-500">
                                          {t('equipment.detail.view.perDay')}
                                        </Text>
                                      )}
                                    </Text>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => openPriceModal('equipment')}
                                  className="px-4 py-2"
                                >
                                  {t('equipment.detail.actions.edit')}
                                </Button>
                              </div>
                            </Field>
                            <Field label="Métriques logistiques (base unitaire)" className="md:col-span-2">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Text as="span" variant="muted" className="uppercase tracking-wide">
                                    Poids unitaire (kg)
                                  </Text>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min={0}
                                    inputMode="decimal"
                                    value={formValues.unit_weight_kg}
                                    onChange={(e) => updateFormValue('unit_weight_kg', e.target.value)}
                                    placeholder="0.000"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Text as="span" variant="muted" className="uppercase tracking-wide">
                                    Volume unitaire (m³)
                                  </Text>
                                  <Input
                                    type="number"
                                    step="0.00001"
                                    min={0}
                                    inputMode="decimal"
                                    value={formValues.unit_volume_m3}
                                    onChange={(e) => updateFormValue('unit_volume_m3', e.target.value)}
                                    placeholder="0.00000"
                                  />
                                </div>
                              </div>
                            </Field>
                          </div>
                        </div>

                        <Field label={t('equipment.detail.edit.fields.description')} id="equipment-description">
                          <Textarea
                            id="equipment-description"
                            rows={4}
                            value={formValues.description}
                            onChange={(e) => updateFormValue('description', e.target.value)}
                            placeholder={t('equipment.detail.edit.placeholders.description')}
                          />
                        </Field>
                        {companySettings?.features?.client_portal && (
                          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Globe className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">Produit public</p>
                                <p className="text-xs text-gray-500">Visible dans l'espace client pour les demandes de devis</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateFormValue('is_public', !formValues.is_public)}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${formValues.is_public ? 'bg-emerald-500' : 'bg-gray-200'}`}
                            >
                              <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${formValues.is_public ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="space-y-4">
                          <Text as="h3" variant="subtitle">
                            {t('equipment.detail.view.sections.main')}
                          </Text>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                              <Text as="p" variant="label">{t('equipment.detail.view.fields.type')}</Text>
                              <Text as="p" variant="body">{equipment.type || t('equipment.detail.view.empty')}</Text>
                            </div>
                            <div className="space-y-1">
                              <Text as="p" variant="label">{t('equipment.detail.view.fields.inventoryCategory')}</Text>
                              <Text as="p" variant="body">{inventoryCategoryLabel}</Text>
                            </div>
                            <div className="space-y-1">
                              <Text as="p" variant="label">{t('equipment.detail.view.fields.subtype')}</Text>
                              <Text as="p" variant="body">{equipment.subtype || t('equipment.detail.view.empty')}</Text>
                            </div>
                            <div className="space-y-1">
                              <Text as="p" variant="label">{t('equipment.detail.view.fields.status')}</Text>
                              <Text as="p" variant="body">{equipmentStatusLabel}</Text>
                            </div>
                            {displayCustomStatus && (
                              <div className="space-y-1">
                                <Text as="p" variant="label">Statut personnalisé</Text>
                                <Text as="p" variant="body">{displayCustomStatus.name}</Text>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1">
                            <Text as="p" variant="label">{t('equipment.detail.view.fields.rentalTtc')}</Text>
                            <Text as="p" variant="body">
                              {(equipment.rental_price_ttc ?? 0).toFixed(2)} €
                              <Text as="span" variant="muted" className="ml-1 text-xs text-gray-500">
                                {t('equipment.detail.view.perDay')}
                              </Text>
                            </Text>
                          </div>
                          {!autoEntrepreneurMode && (
                            <div className="space-y-1">
                              <Text as="p" variant="label">{t('equipment.detail.view.fields.rentalHt')}</Text>
                              <Text as="p" variant="body">
                                {(equipment.rental_price_ht ?? 0).toFixed(2)} €
                                <Text as="span" variant="muted" className="ml-1 text-xs text-gray-500">
                                  {t('equipment.detail.view.perDay')}
                                </Text>
                              </Text>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1">
                            <Text as="p" variant="label">Poids unitaire logistique</Text>
                            <Text as="p" variant="body">
                              {unitWeightValue === null ? t('equipment.detail.view.empty') : `${formatPriceValue(unitWeightValue)} kg`}
                            </Text>
                          </div>
                          <div className="space-y-1">
                            <Text as="p" variant="label">Volume unitaire logistique</Text>
                            <Text as="p" variant="body">
                              {unitVolumeValue === null ? t('equipment.detail.view.empty') : `${unitVolumeValue.toFixed(5)} m³`}
                            </Text>
                          </div>
                          <div className="space-y-1">
                            <Text as="p" variant="label">Poids total estimé</Text>
                            <Text as="p" variant="body">
                              {totalWeightValue === null ? t('equipment.detail.view.empty') : `${totalWeightValue.toFixed(3)} kg`}
                            </Text>
                          </div>
                          <div className="space-y-1">
                            <Text as="p" variant="label">Volume total estimé</Text>
                            <Text as="p" variant="body">
                              {totalVolumeValue === null ? t('equipment.detail.view.empty') : `${totalVolumeValue.toFixed(5)} m³`}
                            </Text>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Text as="p" variant="label">{t('equipment.detail.view.fields.description')}</Text>
                          <Text as="p" variant="body" className="leading-relaxed text-gray-700">
                            {equipment.description?.trim() || t('equipment.detail.view.description.empty')}
                          </Text>
                        </div>
                        {companySettings?.features?.client_portal && (
                          <div className="flex items-center gap-2.5">
                            <Globe className={`h-4 w-4 flex-shrink-0 ${equipment.is_public ? 'text-emerald-500' : 'text-gray-300'}`} />
                            <span className={`text-sm font-medium ${equipment.is_public ? 'text-emerald-700' : 'text-gray-400'}`}>
                              {equipment.is_public ? 'Produit public — visible dans l\'espace client' : 'Produit non public'}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    <div className="rounded-md bg-gray-50 p-4">
                      <Text as="span" variant="muted" className="uppercase tracking-wide">
                        {t('equipment.detail.view.maintenance.title')}
                      </Text>
                      <Text as="p" variant="body" className="mt-1.5 text-gray-700">
                        {maintenanceOpenCount > 0
                          ? t(
                            maintenanceOpenCount > 1
                              ? 'equipment.detail.view.maintenance.multiple'
                              : 'equipment.detail.view.maintenance.single',
                            { count: maintenanceOpenCount },
                          )
                          : t('equipment.detail.view.maintenance.none')}
                      </Text>
                    </div>
                  </div>
                </div>

              <div className="lg:w-1/4 lg:min-w-[240px] flex-shrink-0 self-stretch">
                <div className="bg-white rounded-lg p-4 h-full flex flex-col gap-4">
                  {isEditing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsImageModalOpen(true)}
                      className="group relative w-full aspect-square overflow-hidden rounded-lg bg-gray-200 p-0 text-white hover:bg-gray-200 focus:ring-blue-500"
                    >
                      <img
                        src={previewImageUrl}
                        alt={formValues.name || equipment.name}
                        className="h-full w-full object-cover transition duration-200 group-hover:opacity-80"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <div className="flex items-center gap-2 rounded-full border border-dashed border-white/70 bg-white/10 px-3 py-1.5 text-white">
                          <ImagePlus className="h-4 w-4" />
                          <Text as="span" variant="muted" className="text-xs font-medium text-white">
                            {t('equipment.detail.preview.actions.editImage')}
                          </Text>
                        </div>
                      </div>
                    </Button>
                  ) : (
                    <div className="w-full aspect-square overflow-hidden rounded-lg bg-gray-200">
                      <img
                        src={displayImageUrl}
                        alt={equipment.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="text-center space-y-1.5">
                    <Text as="h2" variant="subtitle">{isEditing ? formValues.name : equipment.name}</Text>
                    <Text as="p" variant="body" className="text-gray-600">
                      {(isEditing ? formValues.type : equipment.type) || t('equipment.detail.preview.typeUndefined')}
                    </Text>
                    {(isEditing ? formValues.subtype : equipment.subtype) && (
                      <Text as="p" variant="muted" className="text-xs uppercase tracking-wide text-gray-400">
                        {isEditing ? formValues.subtype : equipment.subtype}
                      </Text>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-1.5">
                      <Text as="p" variant="muted" className="uppercase tracking-wide">
                        Emplacement interne
                      </Text>
                      <Text as="p" variant="body" className="text-gray-800">
                        {equipment.internal_location?.trim() || t('equipment.detail.view.empty')}
                      </Text>
                    </div>
                  )}
                  {isEditing && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                      <Text as="p" variant="muted" className="uppercase tracking-wide">
                        Résumé infos
                      </Text>
                      <Field label={t('equipment.detail.edit.fields.category')} id="equipment-category-sidebar">
                        <Select
                          id="equipment-category-sidebar"
                          value={formValues.category_id || ''}
                          onChange={(e) => updateFormValue('category_id', e.target.value ? e.target.value : null)}
                          disabled={categoriesLoading || categories.length === 0}
                        >
                          <option value="">{categoriesLoading ? t('common.loading') : t('equipment.detail.edit.placeholders.category')}</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t('equipment.detail.edit.fields.subcategory')} id="equipment-subcategory-sidebar">
                        <Select
                          id="equipment-subcategory-sidebar"
                          value={formValues.subcategory_id || ''}
                          onChange={(e) => updateFormValue('subcategory_id', e.target.value ? e.target.value : null)}
                          disabled={!selectedCategory || availableSubcategories.length === 0}
                        >
                          <option value="">{t('equipment.detail.edit.placeholders.subcategory')}</option>
                          {availableSubcategories.map((sub) => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Emplacement interne" id="equipment-internal-location-sidebar">
                        <Input
                          id="equipment-internal-location-sidebar"
                          value={formValues.internal_location}
                          onChange={(e) => updateFormValue('internal_location', e.target.value)}
                          placeholder="Ex: Rack A / Etage 2 / Bac 14"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <EquipmentReservationGantt
                equipmentName={formValues.name || equipment.name}
                inventoryCategory={formValues.inventory_category}
                aggregatedReservations={reservations}
                unitReservations={unitReservations}
                units={unitList}
                loading={reservationsLoading}
                unitLoading={unitReservationsLoading}
              />
            </div>
          </div>
          )
        )}

        {activeTab === 'history' && (
          <div className="bg-gray-100 p-6 space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('equipment.detail.history.title')}</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('equipment.detail.history.columns.client')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('equipment.detail.history.columns.period')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('equipment.detail.history.columns.duration')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('equipment.detail.history.columns.revenue')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('equipment.detail.history.columns.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rentalHistory.length === 0 && (
                      <tr>
                        <td className="px-6 py-4 text-center text-sm text-gray-500" colSpan={5}>
                          {t('equipment.detail.history.empty')}
                        </td>
                      </tr>
                    )}
                    {rentalHistory.map((rental) => (
                      <tr key={rental.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {rental.client}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {t('equipment.detail.history.period', {
                            start: new Date(rental.startDate).toLocaleDateString(locale),
                            end: new Date(rental.endDate).toLocaleDateString(locale),
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {t('equipment.detail.history.duration', { count: rental.duration })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {currencyFormatter.format(rental.revenue)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              rental.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {rentalStatusLabels[rental.status] ?? rental.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Performance tab removed: relied on mock data */}

        {activeTab === 'maintenance' && (
          <div className="bg-gray-100 p-6 space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900">{t('equipment.detail.maintenance.title')}</h3>
                <button
                  onClick={() => setShowMaintenanceWizard(true)}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  {t('equipment.detail.maintenance.startProcedure')}
                </button>
              </div>
              <div className="space-y-4">
                {maintenanceHistory.length === 0 && (
                  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                    {t('equipment.detail.maintenance.empty')}
                  </div>
                )}
                {maintenanceHistory.map((maintenance) => (
                  <div key={maintenance.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{t(`equipment.detail.maintenance.types.${maintenance.type}`)}</h4>
                        {maintenance.description && (
                          <p className="text-sm text-gray-600 mt-1">{maintenance.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>{t('equipment.detail.maintenance.meta.date', { date: new Date(maintenance.date).toLocaleDateString(locale) })}</span>
                          <span>{t('equipment.detail.maintenance.meta.cost', { amount: currencyFormatter.format(maintenance.cost) })}</span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          maintenance.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {maintenanceStatusLabels[maintenance.status] ?? maintenance.status}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Link
                        to={`/maintenance/${maintenance.id}`}
                        className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        Ouvrir
                      </Link>
                      {maintenance.status !== 'completed' && maintenance.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => void handleCompleteMaintenance(maintenance.id)}
                          disabled={maintenanceActionId === maintenance.id}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {maintenanceActionId === maintenance.id && maintenanceActionKind === 'complete' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                          )}
                          Terminer
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteMaintenance(maintenance.id)}
                        disabled={maintenanceActionId === maintenance.id}
                        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {maintenanceActionId === maintenance.id && maintenanceActionKind === 'delete' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'compliance' && !isPack && (
          <EquipmentComplianceTab
            equipmentId={equipment.id}
            units={unitList}
          />
        )}

        {activeTab === 'accessories' && (
          <div className="bg-gray-100 p-6 space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-gray-900">{t('equipment.detail.accessories.title')}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{accessories.length}</span>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={openAccessoryCreate}
                      className="inline-flex items-center rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      {t('equipment.detail.accessories.actions.add')}
                    </button>
                  )}
                </div>
              </div>
              {accessoriesLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('equipment.detail.accessories.columns.name')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('equipment.detail.accessories.columns.images')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('equipment.detail.accessories.columns.description')}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('equipment.detail.accessories.columns.quantity')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {accessories.length === 0 && (
                        <tr>
                          <td className="px-6 py-4 text-center text-sm text-gray-500" colSpan={4}>
                            {t('equipment.detail.accessories.empty')}
                          </td>
                        </tr>
                      )}
                      {accessories.map((accessory) => {
                        const imageUrl = (accessory.image_urls || []).find(Boolean) || '';
                        return (
                          <tr
                            key={accessory.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => (isEditing ? openAccessoryEdit(accessory) : openAccessoryView(accessory))}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {accessory.name}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {!imageUrl ? (
                                <span className="text-xs text-gray-400">{t('equipment.detail.accessories.images.empty')}</span>
                              ) : (
                                <div className="h-10 w-10 overflow-hidden rounded border border-gray-200 bg-gray-50">
                                  <img src={imageUrl} alt={accessory.name} className="h-full w-full object-cover" />
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {accessory.description?.trim() || t('equipment.detail.accessories.description.empty')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                              {accessory.quantity}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'contents' && (
          <div className="bg-gray-100 p-6 space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-gray-900">{t('pack.detail.contents.title')}</h3>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleAddPackItem}
                    className="inline-flex items-center rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  >
                    {t('pack.detail.contents.actions.add')}
                  </button>
                )}
              </div>
              {packLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('pack.detail.contents.columns.name')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('pack.detail.contents.columns.type')}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('pack.detail.contents.columns.image')}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('pack.detail.contents.columns.quantity')}
                        </th>
                        {isEditing && (
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {t('pack.detail.contents.columns.actions')}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {!isEditing && packItems.length === 0 && (
                        <tr>
                          <td className="px-6 py-4 text-center text-sm text-gray-500" colSpan={isEditing ? 5 : 4}>
                            {t('pack.detail.contents.empty')}
                          </td>
                        </tr>
                      )}
                      {isEditing && packItemsDraft.length === 0 && (
                        <tr>
                          <td className="px-6 py-4 text-center text-sm text-gray-500" colSpan={isEditing ? 5 : 4}>
                            {t('pack.detail.contents.empty')}
                          </td>
                        </tr>
                      )}
                      {isEditing ? (
                        packItemsDraft.map((row, idx) => {
                          const selectedEquipment = packItemOptions.find((option) => option.id === row.equipment_id);
                          const imageUrl = selectedEquipment?.image_url || '';
                          const maxAvailable = packAvailability[row.equipment_id];
                          const availabilityLabel = typeof maxAvailable === 'number'
                            ? (maxAvailable <= 0
                              ? t('rentals.selection.status.none')
                              : t('rentals.selection.status.available', { count: maxAvailable }))
                            : t('rentals.selection.status.checking');
                          return (
                            <tr key={row.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {selectedEquipment?.name || t('pack.detail.contents.emptyValue')}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {selectedEquipment?.type || t('pack.detail.contents.emptyValue')}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {imageUrl ? (
                                  <div className="h-10 w-10 overflow-hidden rounded border border-gray-200 bg-gray-50">
                                    <img src={imageUrl} alt={selectedEquipment?.name || ''} className="h-full w-full object-cover" />
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">{t('pack.detail.contents.imageEmpty')}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                                <div className="flex flex-col items-end gap-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    step="1"
                                    max={typeof maxAvailable === 'number' ? Math.max(1, maxAvailable) : undefined}
                                    value={row.quantity}
                                    onChange={(e) => handlePackItemChange(idx, { quantity: e.target.value })}
                                    className="h-10 w-24"
                                  />
                                  <span className="text-xs text-gray-400">{availabilityLabel}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePackItem(idx)}
                                  className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {t('pack.detail.contents.actions.remove')}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        packItems.map((item) => {
                          const imageUrl = item.equipment?.image_url || '';
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {item.equipment?.name || t('pack.detail.contents.emptyValue')}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {item.equipment?.type || t('pack.detail.contents.emptyValue')}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {imageUrl ? (
                                  <div className="h-10 w-10 overflow-hidden rounded border border-gray-200 bg-gray-50">
                                    <img src={imageUrl} alt={item.equipment?.name || ''} className="h-full w-full object-cover" />
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">{t('pack.detail.contents.imageEmpty')}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                                {item.quantity}
                              </td>
                              {isEditing && (
                                <td className="px-6 py-4 text-right text-sm text-gray-500">—</td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'stock' && (
          <div className="bg-gray-100 p-6">
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
              <div className="flex-1">
                <div className="bg-white rounded-lg p-6 shadow-sm space-y-6">
              {loadingStocks ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                isEditing ? (
                  <>
                    {isSerialTracked ? (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">{t('equipment.detail.stock.serials.title')}</h3>
                          <button
                            type="button"
                            onClick={handleAddUnitRow}
                            className="inline-flex items-center gap-2 rounded-md border border-dashed border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                          >
                            <Plus className="h-4 w-4" />
                            {t('equipment.detail.stock.actions.addRow')}
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">{t('equipment.detail.stock.serials.columns.serial')}</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">{t('equipment.detail.stock.serials.columns.warehouse')}</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">Emplacement</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">{t('equipment.detail.stock.serials.columns.status')}</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">Statut personnalisé</th>
                                <th className="px-4 py-2 text-right font-semibold text-gray-600">{t('equipment.detail.stock.serials.columns.actions')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {unitRowsDraft.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                                    {t('equipment.detail.stock.serials.empty')}
                                  </td>
                                </tr>
                              ) : (
                                unitRowsDraft.map((row, idx) => (
                                  <tr key={(row as any).id || `unit-${idx}`} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 align-top">
                                      <Input
                                        value={row.serial}
                                        onChange={(e) => handleUnitRowChange(idx, { serial: e.target.value })}
                                        placeholder={t('equipment.detail.stock.serials.placeholder')}
                                        className="h-10"
                                      />
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                      <Select
                                        value={row.warehouse_id || ''}
                                        onChange={(e) => handleUnitRowChange(idx, { warehouse_id: e.target.value ? e.target.value : null })}
                                        className="h-10"
                                      >
                                        <option value="">{t('equipment.detail.stock.noWarehouseOption')}</option>
                                        {warehouses.map((wh) => (
                                          <option key={wh.id} value={wh.id}>{wh.name}</option>
                                        ))}
                                      </Select>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                      <div className="space-y-2 min-w-[220px]">
                                        <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                                          <input
                                            type="checkbox"
                                            checked={row.internal_location_override === true}
                                            onChange={(e) =>
                                              handleUnitRowChange(idx, {
                                                internal_location_override: e.target.checked,
                                                internal_location: e.target.checked
                                                  ? (row.internal_location ?? formValues.internal_location.trim() ?? '')
                                                  : (formValues.internal_location.trim() || null),
                                              })
                                            }
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                          />
                                          Emplacement personnalisé
                                        </label>
                                        <Input
                                          value={row.internal_location || ''}
                                          onChange={(e) =>
                                            handleUnitRowChange(idx, {
                                              internal_location: e.target.value,
                                              internal_location_override: true,
                                            })
                                          }
                                          placeholder={formValues.internal_location.trim() || 'Même emplacement que le matériel'}
                                          disabled={row.internal_location_override !== true}
                                          className="h-10 disabled:bg-gray-50 disabled:text-gray-500"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                      <Select
                                        value={row.status}
                                        onChange={(e) => handleUnitRowChange(idx, { status: e.target.value as EquipmentUnitFormRow['status'] })}
                                        className="h-10"
                                      >
                                        {statusOptions.map((status) => (
                                          <option key={status} value={status}>{statusLabels[status]}</option>
                                        ))}
                                      </Select>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                      <Select
                                        value={row.custom_status_id || ''}
                                        onChange={(e) => handleUnitRowChange(idx, { custom_status_id: e.target.value ? e.target.value : null })}
                                        className="h-10"
                                      >
                                        <option value="">Aucun</option>
                                        {seriesUnitCustomStatuses.map((customStatus) => (
                                          <option key={customStatus.id} value={customStatus.id}>
                                            {customStatus.name}
                                          </option>
                                        ))}
                                      </Select>
                                    </td>
                                    <td className="px-4 py-3 text-right align-top">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveUnitRow(idx)}
                                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        {t('equipment.detail.stock.actions.remove')}
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">{t('equipment.detail.stock.distribution.title')}</h3>
                          <button
                            type="button"
                            onClick={handleAddStockRow}
                            className="inline-flex items-center gap-2 rounded-md border border-dashed border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                          >
                            <Plus className="h-4 w-4" />
                            {t('equipment.detail.stock.actions.addRow')}
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">{t('equipment.detail.stock.distribution.columns.warehouse')}</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">{t('equipment.detail.stock.distribution.columns.quantity')}</th>
                                <th className="px-4 py-2 text-right font-semibold text-gray-600">{t('equipment.detail.stock.distribution.columns.actions')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {stockRowsDraft.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                                    {t('equipment.detail.stock.distribution.empty')}
                                  </td>
                                </tr>
                              ) : (
                                stockRowsDraft.map((row, idx) => (
                                  <tr key={row.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 align-top">
                                      <Select
                                        value={row.warehouse_id || ''}
                                        onChange={(e) => handleStockRowChange(idx, { warehouse_id: e.target.value ? e.target.value : null })}
                                        className="h-10"
                                      >
                                        <option value="">{t('equipment.detail.stock.noWarehouseOption')}</option>
                                        {warehouses.map((wh) => (
                                          <option key={wh.id} value={wh.id}>{wh.name}</option>
                                        ))}
                                      </Select>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={row.quantity}
                                        onChange={(e) => handleStockRowChange(idx, { quantity: e.target.value })}
                                        className="h-10"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-right align-top">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveStockRow(idx)}
                                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        {t('equipment.detail.stock.actions.remove')}
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
                          <span>{t('equipment.detail.stock.distribution.totalLabel')}</span>
                          <span className="font-semibold text-gray-900">
                            {t('equipment.detail.stock.distribution.totalUnits', { count: totalDraftQuantity })}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <EquipmentStockTable
                    stocks={stocks}
                    maintenanceCount={maintenanceOpenCount}
                    inventoryCategory={equipment.inventory_category}
                    customStatuses={customStatuses.map((status) => ({
                      id: status.id,
                      name: status.name,
                      color: status.color,
                    }))}
                    equipmentCustomStatusId={equipment.custom_status_id || null}
                  />
                )
              )}
            </div>
          </div>

          <div className="lg:w-1/4 lg:min-w-[260px] flex-shrink-0 self-stretch">
            <div className="bg-white rounded-lg p-4 h-full flex flex-col gap-4">
              {isSerialTracked ? (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Suivi unitaire QR</h3>
                    <p className="mt-1 text-xs text-gray-600">
                      Un QR unique par numéro de suivi, avec historique des prestations scannées.
                    </p>
                  </div>

                  {unitList.length > 0 ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Numéro de suivi</label>
                        <Select
                          value={selectedUnitId || ''}
                          onChange={(event) => setSelectedUnitId(event.target.value || null)}
                          className="h-10"
                        >
                          {unitList.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {(unit.serial_number || unit.id.slice(0, 8)).trim()} · {unitHistoryCountByUnitId[unit.id] || 0} presta
                            </option>
                          ))}
                        </Select>
                      </div>

                      {selectedUnit && (
                        <>
                          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                            <p>
                              <span className="font-semibold">Statut :</span> {selectedUnitStatusLabel}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold">Entrepôt :</span>{' '}
                              {selectedUnit.warehouse_id
                                ? (warehouses.find((warehouse) => warehouse.id === selectedUnit.warehouse_id)?.name || selectedUnit.warehouse_id)
                                : t('equipment.detail.stock.noWarehouseOption')}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold">Poids unitaire :</span>{' '}
                              {selectedUnit.logistics_weight_kg !== null && selectedUnit.logistics_weight_kg !== undefined
                                ? `${selectedUnit.logistics_weight_kg.toFixed(3)} kg`
                                : (unitWeightValue !== null ? `${unitWeightValue.toFixed(3)} kg` : '—')}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold">Volume unitaire :</span>{' '}
                              {selectedUnit.logistics_volume_m3 !== null && selectedUnit.logistics_volume_m3 !== undefined
                                ? `${selectedUnit.logistics_volume_m3.toFixed(5)} m³`
                                : (unitVolumeValue !== null ? `${unitVolumeValue.toFixed(5)} m³` : '—')}
                            </p>
                          </div>

                          <div className="flex items-center justify-center">
                            {selectedUnit.qr_code_url ? (
                              <img
                                src={selectedUnit.qr_code_url}
                                alt={`QR ${selectedUnit.serial_number || selectedUnit.id}`}
                                className="w-full max-w-[220px] rounded-md border border-gray-200 bg-white p-2"
                              />
                            ) : (
                              <div className="flex w-full max-w-[220px] flex-col items-center justify-center aspect-square rounded-md border border-dashed border-gray-300 bg-gray-50 text-center">
                                <QrCode className="h-12 w-12 text-gray-300" />
                                <p className="mt-2 px-4 text-xs text-gray-500">
                                  QR unitaire en attente de génération
                                </p>
                              </div>
                            )}
                          </div>

                          {selectedUnit.qr_code_generated_at && (
                            <p className="text-xs text-gray-500">
                              Généré le {new Date(selectedUnit.qr_code_generated_at).toLocaleString(locale)}
                            </p>
                          )}

                          <div className="rounded-md bg-gray-50 px-3 py-2 text-xs font-mono text-gray-600 break-all">
                            {selectedUnitQrValue}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRegenerateUnitQrCode(selectedUnit.id)}
                            disabled={unitQrRefreshingId === selectedUnit.id}
                            className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white ${
                              unitQrRefreshingId === selectedUnit.id ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {unitQrRefreshingId === selectedUnit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                            Régénérer ce QR
                          </button>

                          <div className="pt-1 border-t border-gray-100 space-y-2">
                            <h4 className="text-sm font-semibold text-gray-900">Historique presta du numéro</h4>
                            {unitHistoryLoading ? (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                              </div>
                            ) : selectedUnitHistory.length === 0 ? (
                              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500">
                                Aucun scan de préparation/retour enregistré pour ce numéro.
                              </div>
                            ) : (
                              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                                {selectedUnitHistory.map((event) => (
                                  event.rental_id ? (
                                    <Link
                                      key={event.source_id}
                                      to={`/rentals/${event.rental_id}`}
                                      className="block rounded-md border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-semibold text-gray-900">
                                          {formatUnitHistoryEventLabel(event.event_type)}
                                        </p>
                                        {event.forced && (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                            Forcé
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-1 text-xs text-gray-700">
                                        {(event.reference_code || event.rental_title || 'Prestation')} · {event.client_name || 'Client inconnu'}
                                      </p>
                                      <p className="mt-1 text-[11px] text-gray-500">
                                        {new Date(event.event_at).toLocaleString(locale)} · {event.scan_result}
                                      </p>
                                    </Link>
                                  ) : (
                                    <div key={event.source_id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-semibold text-gray-900">
                                          {formatUnitHistoryEventLabel(event.event_type)}
                                        </p>
                                        {event.forced && (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                            Forcé
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-1 text-xs text-gray-700">
                                        {(event.reference_code || event.rental_title || 'Prestation')} · {event.client_name || 'Client inconnu'}
                                      </p>
                                      <p className="mt-1 text-[11px] text-gray-500">
                                        {new Date(event.event_at).toLocaleString(locale)} · {event.scan_result}
                                      </p>
                                    </div>
                                  )
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                      Aucun numéro de suivi disponible sur ce matériel.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{t('equipment.detail.qr.title')}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {t('equipment.detail.qr.encodedLabel')}&nbsp;
                      <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 break-all">
                        {equipment?.id ?? '—'}
                      </span>
                    </p>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt={t('equipment.detail.qr.alt', { name: equipment.name })}
                        className="w-full max-w-[220px] rounded-md border border-gray-200 bg-white p-2"
                      />
                    ) : (
                      <div className="flex w-full max-w-[220px] flex-col items-center justify-center aspect-square rounded-md border border-dashed border-gray-300 bg-gray-50 text-center">
                        <QrCode className="h-12 w-12 text-gray-300" />
                        <p className="mt-2 px-4 text-xs text-gray-500">
                          {t('equipment.detail.qr.emptyPlaceholder')}
                        </p>
                      </div>
                    )}
                  </div>
                  {qrCodeGeneratedAt && (
                    <p className="text-xs text-gray-500">
                      {t('equipment.detail.qr.generatedAt', {
                        date: new Date(qrCodeGeneratedAt).toLocaleString(locale),
                      })}
                    </p>
                  )}
                  <div className="rounded-md bg-gray-50 px-3 py-2 text-xs font-mono text-gray-600 break-all">
                    {qrCodeValue}
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateQrCode}
                    disabled={qrGenerating || !equipment}
                    className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white ${
                      qrGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {qrGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    {qrCodeUrl
                      ? t('equipment.detail.qr.buttons.regenerate')
                      : t('equipment.detail.qr.buttons.generate')}
                  </button>
                  <p className="text-xs text-gray-500">
                    {t('equipment.detail.qr.help')}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
        )}
      </div>

      <EquipmentImageModal
        isOpen={isImageModalOpen}
        initialUrl={isPack ? (packForm?.image_url ?? '') : formValues.image_url}
        onClose={() => setIsImageModalOpen(false)}
        onSubmit={(nextUrl) => {
          if (isPack) {
            updatePackFormValue('image_url', nextUrl);
          } else {
            updateFormValue('image_url', nextUrl);
          }
          setIsImageModalOpen(false);
        }}
      />
      {isPriceModalOpen && priceDraft && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closePriceModal} />
          <div className="relative w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={closePriceModal}
              className="absolute right-4 top-4 rounded-full p-1 text-gray-500 hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900">{t('equipment.wizard.steps.pricing')}</h3>
            <p className="mt-1 text-sm text-gray-600">{t('equipment.wizard.tips.pricing')}</p>
            {autoEntrepreneurMode ? (
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('equipment.detail.edit.fields.rentalTtc')}</label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={priceDraft.ttc}
                    onChange={(e) => handlePriceTtcChange(e.target.value)}
                    placeholder={t('equipment.detail.edit.placeholders.rentalAmount')}
                  />
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Mode auto-entrepreneur: saisie TTC uniquement.
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('equipment.detail.edit.fields.rentalHt')}</label>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={priceDraft.ht}
                      onChange={(e) => handlePriceHtChange(e.target.value)}
                      placeholder={t('equipment.detail.edit.placeholders.rentalAmount')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('equipment.wizard.fields.vat.label')}</label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      inputMode="decimal"
                      value={priceDraft.vat}
                      onChange={(e) => handlePriceVatChange(e.target.value)}
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('equipment.detail.edit.fields.rentalTtc')}</label>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={priceDraft.ttc}
                      onChange={(e) => handlePriceTtcChange(e.target.value)}
                      placeholder={t('equipment.detail.edit.placeholders.rentalAmount')}
                    />
                  </div>
                </div>
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  HT x (1 + TVA/100) = TTC
                </div>
              </>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePriceModal}
                className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={applyPriceDraft}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {isAccessoryModalOpen && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeAccessoryModal} />
          <div className="relative w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={closeAccessoryModal}
              className="absolute right-4 top-4 rounded-full p-1 text-gray-500 hover:bg-gray-100"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900">{accessoryModalTitle}</h3>
            <p className="mt-1 text-sm text-gray-600">{accessoryModalSubtitle}</p>
            {isAccessoryReadOnly ? (
              <div className="mt-5 space-y-5">
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
                  {accessoryPreviewUrl ? (
                    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                      <img
                        src={accessoryPreviewUrl}
                        alt={accessoryForm.name || t('equipment.detail.accessories.form.fields.name')}
                        className="h-48 w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center text-xs text-gray-400">
                      {t('equipment.detail.accessories.images.empty')}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {t('equipment.detail.accessories.form.fields.name')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{accessoryForm.name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {t('equipment.detail.accessories.form.fields.quantity')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{accessoryForm.quantity || '—'}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {t('equipment.detail.accessories.form.fields.description')}
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      {accessoryForm.description?.trim() || t('equipment.detail.accessories.description.empty')}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    {t('equipment.detail.accessories.form.fields.name')}
                  </label>
                  <Input
                    value={accessoryForm.name}
                    onChange={(e) => setAccessoryForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t('equipment.detail.accessories.form.placeholders.name')}
                  />
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      {t('equipment.detail.accessories.form.fields.quantity')}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      value={accessoryForm.quantity}
                      onChange={(e) => setAccessoryForm((prev) => ({ ...prev, quantity: e.target.value }))}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      {t('equipment.detail.accessories.form.fields.description')}
                    </label>
                    <Textarea
                      rows={4}
                      value={accessoryForm.description}
                      onChange={(e) => setAccessoryForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder={t('equipment.detail.accessories.form.placeholders.description')}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <EquipmentImageField
                      value={accessoryForm.imageUrl}
                      onChange={(nextValue) => setAccessoryForm((prev) => ({ ...prev, imageUrl: nextValue }))}
                      scope="accessory"
                      label={t('equipment.detail.accessories.form.fields.images')}
                      placeholder={t('equipment.detail.accessories.form.placeholders.images')}
                      helpText={t('equipment.detail.accessories.form.hints.image')}
                      emptyLabel={t('equipment.detail.accessories.images.empty')}
                      previewHeightClassName="h-40"
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              {accessoryModalMode === 'edit' && (
                <button
                  type="button"
                  onClick={handleAccessoryDelete}
                  className="inline-flex items-center rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed"
                  disabled={isAccessorySaving}
                >
                  {t('equipment.detail.accessories.form.actions.delete')}
                </button>
              )}
              <button
                type="button"
                onClick={closeAccessoryModal}
                className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                disabled={isAccessorySaving}
              >
                {accessoryModalCloseLabel}
              </button>
              {!isAccessoryReadOnly && (
                <button
                  type="button"
                  onClick={handleAccessorySave}
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                  disabled={isAccessorySaving}
                >
                  {accessoryModalMode === 'edit'
                    ? t('equipment.detail.accessories.form.actions.update')
                    : t('equipment.detail.accessories.form.actions.save')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <PackEquipmentSelectionModal
        isOpen={isPackSelectionOpen}
        onClose={() => setIsPackSelectionOpen(false)}
        existingEquipment={packSelectedEquipmentIds}
        alreadySelected={packItemsDraft.map((item) => ({
          equipment_id: item.equipment_id,
          quantity: Math.max(1, Math.floor(parseNumberInput(item.quantity) ?? 1)),
        }))}
        onSelect={(equipmentRow, quantity) => {
          setPackItemsDraft((prev) => [
            ...prev,
            {
              id: generateTempId(),
              equipment_id: equipmentRow.id,
              quantity: String(quantity),
            },
          ]);
          setIsPackSelectionOpen(false);
        }}
      />
      <MaintenanceProcedureWizard
        isOpen={showMaintenanceWizard}
        onClose={() => setShowMaintenanceWizard(false)}
        equipmentName={equipment.name}
        serialUnits={unitList}
        onSubmit={async ({ selectedUnitId, selectedSerial, type, description }) => {
          const targetUnit = selectedUnitId ? unitList.find((u) => u.id === selectedUnitId) : null;
          const serialValue = selectedSerial || targetUnit?.serial_number || null;
          let taskId: string | null = null;

          try {
            // Task type uses enum; map SAV/DEPOT to 'corrective'
            const { data: task, error } = await supabase
              .from('maintenance_tasks')
              .insert([{
                equipment_id: equipment.id,
                type: 'corrective',
                title: `Maintenance - ${equipment.name}${serialValue ? ` (${serialValue})` : ''}`,
                description,
                status: 'pending',
                scheduled_date: new Date().toISOString(),
              }])
              .select('id')
              .single();
            if (error) throw error;
            taskId = task?.id || null;
            // Track unit in equipment_maintenance
            const { error: emErr } = await supabase
              .from('equipment_maintenance')
              .insert([{
                equipment_id: equipment.id,
                serial_number: serialValue,
                warehouse_id: targetUnit?.warehouse_id || null,
                maintenance_type: type === 'SAV' ? 'SAV' : 'Réparation dépôt',
                status: 'open',
                task_id: task?.id || null,
              }]);
            if (emErr) {
              if (taskId) {
                const { error: rollbackErr } = await supabase
                  .from('maintenance_tasks')
                  .delete()
                  .eq('id', taskId);
                if (rollbackErr) {
                  console.error('Error rolling back maintenance task after equipment_maintenance failure', rollbackErr);
                }
              }
              throw emErr;
            }
            if (selectedUnitId) {
              const { error: unitErr } = await supabase
                .from('equipment_units')
                .update({ status: 'maintenance' })
                .eq('id', selectedUnitId);
              if (unitErr) {
                console.error('Error updating equipment unit status after maintenance creation', unitErr);
              }
            }
          } catch (e) {
            console.error(e);
            toast.error(t('equipment.detail.toast.maintenanceError'));
            return;
          }

          toast.success(t('equipment.detail.toast.maintenanceCreated'));

          try {
            await loadMaintenanceState();
            await loadStocks();
          } catch (refreshError) {
            console.error('Error refreshing equipment maintenance state after creation', refreshError);
          }
        }}
      />

      {isSavingOverlayVisible && (
        <div className="fixed inset-0 z-[12040] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
          <div className="flex flex-col items-center space-y-3 rounded-lg bg-white/90 px-6 py-5 shadow-xl">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
            <p className="text-sm font-medium text-gray-700">{t('equipment.detail.overlay.saving')}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentDetail;
