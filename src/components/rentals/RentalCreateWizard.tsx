import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, ArrowRight, Clock, MapPin, Navigation, Save } from 'lucide-react';

// Fix Leaflet default marker icons with Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});
import { RentalCreatePayload, RentalItem, RentalItemGroup, RentalType } from '../../types/rental';
import RentalEquipmentList from './RentalEquipmentList';
import { useVehicles } from '../../hooks/useVehicles';
import { usePersonnel } from '../../hooks/usePersonnel';
import { useDeliveryOffers } from '../../hooks/useDeliveryOffers';
import { useServices } from '../../hooks/useServices';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { AddressSearchInput, Button, ColorPickerButton, DateField, DateRangeField, Field, Input, ProgressBar, SearchableSelect, Select, StepTransition, Textarea } from '../ui-kit';
import { useTranslation } from '../../context/TranslationContext';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { computeRentalCoefficient, normalizeRentalCoefficientMode } from '../../utils/rentalCoefficient';

// ── Mini carte interactive OSM ───────────────────────────────────────────────
const MapFlyTo: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lon], 15, { duration: 0.8 }); }, [map, lat, lon]);
  return null;
};

const LocationMapPreview: React.FC<{ address: string; className?: string }> = ({ address, className }) => {
  const [state, setState] = React.useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [coords, setCoords] = React.useState<{ lat: number; lon: number } | null>(null);

  React.useEffect(() => {
    if (!address.trim()) { setState('idle'); setCoords(null); return; }
    setState('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=fr`,
          { headers: { 'Accept': 'application/json' } }
        );
        const json = await res.json();
        const f = json?.features?.[0];
        if (f) {
          const [lon, lat] = f.geometry.coordinates as [number, number];
          setCoords({ lat, lon });
          setState('ok');
        } else {
          setState('error');
        }
      } catch {
        setState('error');
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [address]);

  return (
    <div className={`rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 ${className ?? 'h-[200px]'}`}>
      {state === 'idle' && (
        <div className="h-full flex items-center justify-center text-xs text-slate-400">
          Entrez une adresse pour afficher la carte
        </div>
      )}
      {state === 'loading' && (
        <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
          Chargement…
        </div>
      )}
      {state === 'error' && (
        <div className="h-full flex items-center justify-center text-xs text-red-400">
          Adresse introuvable
        </div>
      )}
      {state === 'ok' && coords && (
        <MapContainer
          center={[coords.lat, coords.lon]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          <Marker position={[coords.lat, coords.lon]} />
          <MapFlyTo lat={coords.lat} lon={coords.lon} />
        </MapContainer>
      )}
    </div>
  );
};

// ── Card distance dépôt → lieu d'intervention ───────────────────────────────
const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m < 10 ? '0' : ''}${m}`;
};

const geocode = async (address: string) => {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=fr`,
    { headers: { 'Accept': 'application/json' } }
  );
  const data = await res.json();
  const f = data?.features?.[0];
  if (!f) throw new Error('not found');
  const [lon, lat] = f.geometry.coordinates as [number, number];
  return { lat, lon };
};

const DepotDistanceCard: React.FC<{ companyAddress: string; deliveryAddress: string }> = ({
  companyAddress,
  deliveryAddress,
}) => {
  const [state, setState] = React.useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [info, setInfo] = React.useState<{ distance: number; duration: number } | null>(null);

  React.useEffect(() => {
    if (!companyAddress.trim() || !deliveryAddress.trim()) { setState('idle'); setInfo(null); return; }
    setState('loading');
    const timer = setTimeout(async () => {
      try {
        const [a, b] = await Promise.all([geocode(companyAddress), geocode(deliveryAddress)]);
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`
        );
        const data = await res.json() as { routes?: Array<{ distance: number; duration: number }> };
        if (data.routes?.[0]) {
          setInfo({ distance: data.routes[0].distance, duration: data.routes[0].duration });
          setState('ok');
        } else {
          setState('error');
        }
      } catch {
        setState('error');
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [companyAddress, deliveryAddress]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3 flex items-center justify-center min-h-[52px]">
      {state === 'idle' && (
        <p className="text-xs text-slate-400">Entrez une adresse pour estimer la distance depuis le dépôt</p>
      )}
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-3 w-3 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
          Calcul en cours…
        </div>
      )}
      {state === 'error' && (
        <p className="text-xs text-red-400">Impossible de calculer la distance</p>
      )}
      {state === 'ok' && info && (
        <div className="flex items-center gap-5 w-full">
          <div className="flex items-center gap-1.5">
            <Navigation className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800">{(info.distance / 1000).toFixed(1)} km</span>
            <span className="text-xs text-slate-400">route</span>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800">{formatDuration(info.duration)}</span>
            <span className="text-xs text-slate-400">estimé</span>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500 truncate">{companyAddress}</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface Props {
  onSubmit: (data: RentalCreatePayload) => Promise<void> | void;
  clients: Array<{ id: string; name: string; company?: string | null }>;
}

type StepId = 'basic' | 'delivery' | 'items' | 'personnel' | 'pricing' | 'summary';

interface RentalItemDraft extends RentalItem {
  position: number;
  group_id?: string | null;
}

interface RentalItemGroupDraft extends Pick<RentalItemGroup, 'id' | 'name' | 'position'> {
  color?: string | null;
}

interface PersonnelServiceDraft {
  id: string;
  service_record_id: string;
  quantity: number;
  days: number;
  discount_percent: number;
}

type MoveGroupPayload = {
  groupId: string;
  beforeGroupId: string | null;
};

type MoveItemPayload = {
  itemId: string;
  targetGroupId: string | null;
  beforeItemId?: string | null;
};

const uuid = () => (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : `tmp-${Math.random().toString(36).slice(2, 10)}`);

const RentalCreateWizard: React.FC<Props> = ({ onSubmit, clients }) => {
  const [step, setStep] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [type, setType] = useState<RentalType>('rental');
  const [clientId, setClientId] = useState('');
  const [clientRepresentsCompany, setClientRepresentsCompany] = useState(false);
  const [clientRepresentsTouched, setClientRepresentsTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [confirmedLocation, setConfirmedLocation] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>('#111827');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [usageStartDate, setUsageStartDate] = useState('');
  const [usageEndDate, setUsageEndDate] = useState('');
  const [singleDay, setSingleDay] = useState(false);
  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);
  const minDate = useMemo(() => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return day;
  }, []);
  const [itemGroups, setItemGroups] = useState<RentalItemGroupDraft[]>([]);
  const [items, setItems] = useState<RentalItemDraft[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [discountType, setDiscountType] = useState<'' | 'percentage' | 'fixed'>('');
  const [discountValue, setDiscountValue] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const { vehicles = [] } = useVehicles();
  const [vehicleRows, setVehicleRows] = useState<Array<{
    id: string;
    vehicle_id: string;
    delivery_at?: string;
    appointment_at?: string;
    return_delivery_at?: string;
    return_appointment_at?: string;
  }>>([]);
  const { offers: deliveryOffers = [], loading: deliveryOffersLoading } = useDeliveryOffers();
  const [deliveryOfferId, setDeliveryOfferId] = useState('');
  const [deliveryQuantity, setDeliveryQuantity] = useState('');
  const [deliveryTripType, setDeliveryTripType] = useState<'one_way' | 'round_trip'>('one_way');
  const [assignedPersonnelIds, setAssignedPersonnelIds] = useState<string[]>([]);
  const { personnel = [] } = usePersonnel();
  const { services = [], loading: servicesLoading } = useServices();
  const [personnelServiceRows, setPersonnelServiceRows] = useState<PersonnelServiceDraft[]>([]);
  const { settings } = useCompanySettings();
  const { t, language } = useTranslation();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const dateLocale = language === 'fr' ? fr : enUS;
  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId) || null, [clients, clientId]);
  const selectedClientCompany = selectedClient?.company?.trim() || '';
  const hasClientCompany = Boolean(selectedClientCompany);

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

  const formatCurrency = useCallback((value: number) => currencyFormatter.format(value), [currencyFormatter]);

  const formatDateDisplay = useCallback(
    (value: string) => {
      if (!value) return '—';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return dateTimeFormatter.format(parsed);
    },
    [dateTimeFormatter]
  );

  useEffect(() => {
    if (!hasClientCompany) {
      setClientRepresentsCompany(false);
      setClientRepresentsTouched(false);
      return;
    }
    if (!clientRepresentsTouched) {
      setClientRepresentsCompany(true);
    }
  }, [hasClientCompany, clientRepresentsTouched]);

  useEffect(() => {
    if (type === 'sale') {
      setSingleDay(false);
    }
  }, [type]);

  const activeDeliveryOffers = useMemo(
    () => deliveryOffers.filter((offer) => offer.is_active),
    [deliveryOffers]
  );

  const selectedDeliveryOffer = useMemo(
    () => activeDeliveryOffers.find((offer) => offer.id === deliveryOfferId) || null,
    [activeDeliveryOffers, deliveryOfferId]
  );
  const personnelServices = useMemo(
    () => services.filter((service) => service.category === 'personnel'),
    [services]
  );
  const personnelServiceLookup = useMemo(
    () => new Map(personnelServices.map((service) => [service.id, service])),
    [personnelServices]
  );
  const clientProfileLabel = useMemo(() => {
    if (!clientId) return '—';
    if (!hasClientCompany) return t('rentals.wizard.clientProfile.personal');
    return clientRepresentsCompany ? t('rentals.wizard.clientProfile.company') : t('rentals.wizard.clientProfile.personal');
  }, [clientId, clientRepresentsCompany, hasClientCompany, t]);

  const parseNumber = useCallback((value: string) => {
    if (!value.trim()) return 0;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);
  const parsePercent = useCallback((value: string, fallback = 0) => {
    if (!value.trim()) return fallback;
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(100, Math.max(0, parsed));
  }, []);
  const parsePositiveInt = useCallback((value: string, fallback = 1, max?: number) => {
    if (!value.trim()) return fallback;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    const clamped = Math.max(1, parsed);
    return typeof max === 'number' ? Math.min(max, clamped) : clamped;
  }, []);
  const toEndOfDayValue = useCallback((value?: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setHours(23, 59, 59, 0);
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    const hours = `${parsed.getHours()}`.padStart(2, '0');
    const minutes = `${parsed.getMinutes()}`.padStart(2, '0');
    const seconds = `${parsed.getSeconds()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }, []);
  const toStartOfDayValue = useCallback((value?: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    parsed.setHours(0, 0, 0, 0);
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    const hours = `${parsed.getHours()}`.padStart(2, '0');
    const minutes = `${parsed.getMinutes()}`.padStart(2, '0');
    const seconds = `${parsed.getSeconds()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }, []);

  const deliveryQuantityValue = useMemo(
    () => parseNumber(deliveryQuantity),
    [deliveryQuantity, parseNumber]
  );

  const deliveryQuantityMeta = useMemo(() => {
    if (!selectedDeliveryOffer) {
      return { label: '', unit: '', step: '1', show: false };
    }
    switch (selectedDeliveryOffer.pricing_type) {
      case 'per_km':
        return { label: t('rentals.wizard.delivery.forfait.quantityLabel.km'), unit: 'km', step: '0.1', show: true };
      case 'per_hour':
        return { label: t('rentals.wizard.delivery.forfait.quantityLabel.hour'), unit: 'h', step: '0.5', show: true };
      case 'per_day':
        return { label: t('rentals.wizard.delivery.forfait.quantityLabel.day'), unit: t('rentals.wizard.delivery.forfait.unit.day'), step: '1', show: true };
      case 'per_trip':
        return { label: t('rentals.wizard.delivery.forfait.quantityLabel.trip'), unit: t('rentals.wizard.delivery.forfait.unit.trip'), step: '1', show: true };
      case 'fixed':
      default:
        return { label: '', unit: '', step: '1', show: false };
    }
  }, [selectedDeliveryOffer, t]);

  const resolvedDeliveryQuantity = useMemo(() => {
    if (!selectedDeliveryOffer) return 0;
    if (deliveryQuantityValue > 0) return deliveryQuantityValue;
    if (selectedDeliveryOffer.pricing_type === 'fixed' || selectedDeliveryOffer.pricing_type === 'per_trip') {
      return 1;
    }
    return 0;
  }, [selectedDeliveryOffer, deliveryQuantityValue]);

  const deliveryTotal = useMemo(() => {
    if (!selectedDeliveryOffer) return 0;
    const base = Number(selectedDeliveryOffer.base_amount || 0);
    const rate = Number(selectedDeliveryOffer.rate_amount || 0);
    const subtotal = base + rate * resolvedDeliveryQuantity;
    const multiplier = deliveryTripType === 'round_trip' ? 2 : 1;
    return Math.max(0, subtotal * multiplier);
  }, [selectedDeliveryOffer, resolvedDeliveryQuantity, deliveryTripType]);

  const deliveryRateLabel = useMemo(() => {
    if (!selectedDeliveryOffer) return '';
    switch (selectedDeliveryOffer.pricing_type) {
      case 'per_km':
        return t('rentals.wizard.delivery.forfait.rateLabel.km');
      case 'per_hour':
        return t('rentals.wizard.delivery.forfait.rateLabel.hour');
      case 'per_day':
        return t('rentals.wizard.delivery.forfait.rateLabel.day');
      case 'per_trip':
        return t('rentals.wizard.delivery.forfait.rateLabel.trip');
      case 'fixed':
      default:
        return t('rentals.wizard.delivery.forfait.rateLabel.fixed');
    }
  }, [selectedDeliveryOffer, t]);

  const deliveryPricingDetails = useMemo(() => {
    if (!selectedDeliveryOffer) return '';
    const rate = formatCurrency(Number(selectedDeliveryOffer.rate_amount || 0));
    const base = Number(selectedDeliveryOffer.base_amount || 0);
    if (base > 0) {
      return t('rentals.wizard.delivery.forfait.rateWithBase', {
        rateLabel: deliveryRateLabel,
        rate,
        base: formatCurrency(base),
      });
    }
    return t('rentals.wizard.delivery.forfait.rateOnly', {
      rateLabel: deliveryRateLabel,
      rate,
    });
  }, [selectedDeliveryOffer, formatCurrency, deliveryRateLabel, t]);

  const deliverySummaryValue = useMemo(() => {
    if (!selectedDeliveryOffer) return '';
    const tripLabel = deliveryTripType === 'round_trip'
      ? t('rentals.wizard.delivery.forfait.trip.roundTrip')
      : t('rentals.wizard.delivery.forfait.trip.oneWay');
    const quantityLabel = deliveryQuantityMeta.show
      ? `${resolvedDeliveryQuantity} ${deliveryQuantityMeta.unit}`.trim()
      : '';
    return [selectedDeliveryOffer.name, quantityLabel, tripLabel].filter(Boolean).join(' • ');
  }, [selectedDeliveryOffer, deliveryTripType, deliveryQuantityMeta, resolvedDeliveryQuantity, t]);

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
    const d = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(1, d);
  }, [startDate, endDate]);

  const usageWarning = useMemo(() => {
    if (!usageStartDate || !usageEndDate || !startDate || !endDate) return false;
    const billingMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    const usageMs = new Date(usageEndDate).getTime() - new Date(usageStartDate).getTime();
    return billingMs > 0 && usageMs < billingMs;
  }, [startDate, endDate, usageStartDate, usageEndDate]);
  const companyCoefficientMode = normalizeRentalCoefficientMode(settings?.rental_coefficient_mode);
  const companyCoefficient = useMemo(() => {
    if (!settings) return null;
    return computeRentalCoefficient(companyCoefficientMode, days || 1, settings.rental_coefficient_formula);
  }, [companyCoefficientMode, days, settings]);
  const baseEquipmentMultiplier = days > 0 ? days : 1;
  const equipmentCoefficient = type === 'sale'
    ? baseEquipmentMultiplier
    : (companyCoefficient ?? baseEquipmentMultiplier);
  const maxServiceDays = Math.max(1, days || 1);

  useEffect(() => {
    if (days <= 0) return;
    setPersonnelServiceRows((prev) =>
      prev.map((row) => (row.days > days ? { ...row, days } : row))
    );
  }, [days]);

  const sortGroups = (groups: RentalItemGroupDraft[]) => [...groups].sort((a, b) => (a.position || 0) - (b.position || 0));

  const resequenceGroups = (groups: RentalItemGroupDraft[]) => sortGroups(groups).map((group, index) => ({ ...group, position: index }));

  const resequenceItems = (list: RentalItemDraft[], groups: RentalItemGroupDraft[]) => {
    const bucket = new Map<string | null, RentalItemDraft[]>();
    list.forEach((item) => {
      const key = item.group_id || null;
      const arr = bucket.get(key) || [];
      arr.push(item);
      bucket.set(key, arr);
    });
    const ordered: RentalItemDraft[] = [];
    const ungrouped = bucket.get(null);
    if (ungrouped) {
      ungrouped
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .forEach((item, index) => ordered.push({ ...item, group_id: null, position: index }));
    }
    sortGroups(groups).forEach((group) => {
      const arr = bucket.get(group.id);
      if (!arr || arr.length === 0) return;
      arr
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .forEach((item, index) => ordered.push({ ...item, group_id: group.id, position: index }));
    });
    return ordered;
  };

  const updateItems = (updater: (prev: RentalItemDraft[]) => RentalItemDraft[], groupsOverride?: RentalItemGroupDraft[]) => {
    setItems((prev) => {
      const draft = updater(prev);
      return resequenceItems(draft, groupsOverride || itemGroups);
    });
  };

  useEffect(() => {
    if (itemGroups.length === 0) {
      setSelectedGroupId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemGroups.length]);

  useEffect(() => {
    if (!deliveryOfferId) {
      setDeliveryQuantity('');
      setDeliveryTripType('one_way');
    }
  }, [deliveryOfferId]);

  const itemsTotal = useMemo(() => {
    return items.reduce((sum, it) => {
      const base = (Number(it.price_per_day) || 0) * (Number(it.quantity) || 0) * equipmentCoefficient;
      const discount = Number.isFinite(it.discount_percent)
        ? Math.min(100, Math.max(0, Number(it.discount_percent)))
        : 0;
      return sum + base * (1 - discount / 100);
    }, 0);
  }, [equipmentCoefficient, items]);

  const personnelServicesTotal = useMemo(() => {
    if (type !== 'service') return 0;
    return personnelServiceRows.reduce((sum, row) => {
      const service = personnelServiceLookup.get(row.service_record_id);
      if (!service) return sum;
      const unit = Number(service.cost_per_person || 0);
      const safeUnit = Number.isFinite(unit) ? unit : 0;
      const qty = Number(row.quantity || 0);
      const daysCount = Number(row.days || 0);
      const discount = Math.min(100, Math.max(0, Number(row.discount_percent) || 0));
      return sum + safeUnit * qty * daysCount * (1 - discount / 100);
    }, 0);
  }, [type, personnelServiceRows, personnelServiceLookup]);

  const baseTotal = useMemo(
    () => itemsTotal + deliveryTotal + personnelServicesTotal,
    [itemsTotal, deliveryTotal, personnelServicesTotal]
  );

  const totalPrice = useMemo(() => {
    if (!discountType || discountValue === undefined) return baseTotal;
    if (discountType === 'percentage') {
      const pct = Math.min(100, Math.max(0, discountValue));
      return Math.max(0, baseTotal * (1 - pct / 100));
    }
    return Math.max(0, baseTotal - Math.max(0, discountValue));
  }, [baseTotal, discountType, discountValue]);

  const orderedGroupsMemo = useMemo(() => sortGroups(itemGroups), [itemGroups]);
  const ungroupedForSummary = useMemo(
    () => items.filter(it => !it.group_id).sort((a, b) => (a.position || 0) - (b.position || 0)),
    [items]
  );
  const groupedForSummary = useMemo(
    () => orderedGroupsMemo.map(group => ({
      group,
      items: items
        .filter(it => it.group_id === group.id)
        .sort((a, b) => (a.position || 0) - (b.position || 0)),
    })),
    [items, orderedGroupsMemo]
  );

  const stepsDef = useMemo<StepId[]>(() => {
    const base: StepId[] = ['basic', 'delivery', 'items'];
    if (type === 'service') base.push('personnel');
    base.push('pricing', 'summary');
    return base;
  }, [type]);

  const typeLabels = useMemo(
    () => ({
      rental: t('rentals.type.rental'),
      service: t('rentals.type.service'),
      sale: t('rentals.type.sale'),
    }),
    [t]
  );

  const stepLabels = useMemo(
    () => ({
      basic: t('rentals.wizard.steps.basic'),
      delivery: t('rentals.wizard.steps.delivery'),
      items: t('rentals.wizard.steps.items'),
      personnel: t('rentals.wizard.steps.personnel'),
      pricing: t('rentals.wizard.steps.pricing'),
      summary: t('rentals.wizard.steps.summary'),
    }),
    [t]
  );

  const hasValidSchedule = () => !!startDate && !!endDate && new Date(endDate) >= new Date(startDate);

  const canNext = () => {
    const id = stepsDef[step];
    if (id === 'basic') return !!type && !!clientId && title.trim().length > 0 && hasValidSchedule();
    if (id === 'items') return items.length > 0;
    return true;
  };

  useEffect(() => {
    // Keep current step in range when available steps change with rental type
    setStep(s => Math.min(s, stepsDef.length - 1));
  }, [stepsDef.length]);

  const next = () => {
    if (!canNext()) return;
    setTransitionDirection('forward');
    setStep(s => Math.min(s + 1, stepsDef.length - 1));
  };
  const prev = () => {
    setTransitionDirection('backward');
    setStep(s => Math.max(s - 1, 0));
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    updateItems(prev => prev.map(it => it.id === itemId ? { ...it, quantity: newQuantity } : it));
  };

  const handleRemoveItem = (itemId: string) => {
    updateItems(prev => prev.filter(it => it.id !== itemId));
  };

  const handleDiscountChange = (itemId: string, newDiscount: number) => {
    const safeValue = Number.isFinite(newDiscount) ? Math.min(100, Math.max(0, newDiscount)) : 0;
    updateItems(prev => prev.map(it => (it.id === itemId ? { ...it, discount_percent: safeValue } : it)));
  };

  type Equipment = { id: string; name: string; type: string; rental_price_ttc: number };

  const handleAddItem = (equipment: Equipment, quantity: number, groupId?: string | null) => {
    const targetGroupId = typeof groupId === 'undefined' ? selectedGroupId : groupId;
    updateItems(prev => {
      const siblings = prev.filter(it => (it.group_id || null) === (targetGroupId || null));
      const position = siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.position || 0)) + 1;
      const newItem: RentalItemDraft = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        equipment_id: equipment.id,
        equipment_name: equipment.name,
        equipment_type: equipment.type,
        quantity,
        price_per_day: equipment.rental_price_ttc,
        discount_percent: 0,
        group_id: targetGroupId || null,
        position,
        is_external: false,
      };
      return [...prev, newItem];
    });
  };

  const handleAddExternalItem = (
    payload: { name: string; description?: string; type: string; subtype?: string; supplier?: string; price_per_day: number },
    quantity: number,
    groupId?: string | null,
  ) => {
    const targetGroupId = typeof groupId === 'undefined' ? selectedGroupId : groupId;
    updateItems(prev => {
      const siblings = prev.filter(it => (it.group_id || null) === (targetGroupId || null));
      const position = siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.position || 0)) + 1;
      const baseType = [payload.type, payload.subtype].filter(Boolean).join(' / ');
      const externalLabel = type === 'sale'
        ? t('rentals.wizard.items.externalLabelPurchase')
        : t('rentals.wizard.items.externalLabel');
      const displayType = baseType
        ? type === 'sale'
          ? t('rentals.wizard.items.externalTypePurchase', { type: baseType })
          : t('rentals.wizard.items.externalType', { type: baseType })
        : externalLabel;
      const newItem: RentalItemDraft = {
        id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        equipment_id: null,
        equipment_name: payload.name,
        equipment_type: displayType,
        quantity,
        price_per_day: payload.price_per_day,
        discount_percent: 0,
        group_id: targetGroupId || null,
        position,
        is_external: true,
        external_name: payload.name,
        external_type: payload.type,
        external_subtype: payload.subtype || null,
        external_supplier: payload.supplier || null,
        external_description: payload.description || null,
      };
      return [...prev, newItem];
    });
  };

  const handleAddGroup = (name: string, color?: string) => {
    setItemGroups(prev => {
      const next = resequenceGroups([...prev, { id: uuid(), name: name.trim(), position: prev.length, color: color || null }]);
      setItems(prevItems => resequenceItems(prevItems, next));
      const created = next[next.length - 1];
      setSelectedGroupId(created.id);
      return next;
    });
  };

  const handleRemoveGroup = (groupId: string) => {
    setItemGroups(prev => {
      const filtered = prev.filter(group => group.id !== groupId);
      const resequenced = resequenceGroups(filtered);
      setItems(prevItems => resequenceItems(prevItems.map(item => item.group_id === groupId ? { ...item, group_id: null } : item), resequenced));
      if (selectedGroupId === groupId) setSelectedGroupId(null);
      return resequenced;
    });
  };

  const handleMoveGroup = ({ groupId, beforeGroupId }: MoveGroupPayload) => {
    setItemGroups(prev => {
      const sorted = sortGroups(prev);
      const movingIndex = sorted.findIndex(g => g.id === groupId);
      if (movingIndex === -1) return prev;
      const moving = sorted[movingIndex];
      const filtered = sorted.filter(g => g.id !== groupId);
      const insertIndex = beforeGroupId ? filtered.findIndex(g => g.id === beforeGroupId) : filtered.length;
      const index = insertIndex < 0 ? filtered.length : insertIndex;
      filtered.splice(index, 0, moving);
      const resequenced = resequenceGroups(filtered);
      setItems(prevItems => resequenceItems(prevItems, resequenced));
      return resequenced;
    });
  };

  const handleMoveItem = ({ itemId, targetGroupId, beforeItemId }: MoveItemPayload) => {
    setItems(prevItems => {
      const currentGroups = itemGroups;
      const item = prevItems.find(it => it.id === itemId);
      if (!item) return prevItems;
      const remaining = prevItems.filter(it => it.id !== itemId);
      const map = new Map<string | null, RentalItemDraft[]>();
      remaining.forEach(it => {
        const key = it.group_id || null;
        const arr = map.get(key) || [];
        arr.push(it);
        map.set(key, arr);
      });
      const key = targetGroupId || null;
      if (!map.has(key)) map.set(key, []);
      const targetArr = map.get(key)!;
      const updatedItem = { ...item, group_id: key };
      if (beforeItemId) {
        const idx = targetArr.findIndex(it => it.id === beforeItemId);
        if (idx >= 0) targetArr.splice(idx, 0, updatedItem);
        else targetArr.push(updatedItem);
      } else {
        targetArr.push(updatedItem);
      }
      map.set(key, targetArr);
      const ordered: RentalItemDraft[] = [];
      const ungrouped = map.get(null);
      if (ungrouped) {
        ungrouped
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .forEach((it, index) => ordered.push({ ...it, group_id: null, position: index }));
      }
      sortGroups(currentGroups).forEach(group => {
        const arr = map.get(group.id);
        if (!arr) return;
        arr
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .forEach((it, index) => ordered.push({ ...it, group_id: group.id, position: index }));
      });
      return ordered;
    });
  };

  const addPersonnelServiceRow = () => {
    setPersonnelServiceRows((prev) => [
      ...prev,
      { id: uuid(), service_record_id: '', quantity: 1, days: 1, discount_percent: 0 },
    ]);
  };

  const updatePersonnelServiceRow = (rowId: string, updates: Partial<PersonnelServiceDraft>) => {
    setPersonnelServiceRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...updates } : row))
    );
  };

  const removePersonnelServiceRow = (rowId: string) => {
    setPersonnelServiceRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const submit = async () => {
    if (!canNext()) return;
    setSaving(true);
    try {
      const orderedGroupsPayload = orderedGroupsMemo.map(group => ({
        id: group.id,
        name: group.name,
        position: group.position,
        color: group.color || null,
      }));

      const personnelServicePayload = personnelServiceRows
        .filter((row) => row.service_record_id)
        .map((row) => ({
          service_record_id: row.service_record_id,
          quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
          days: Math.max(1, Math.min(maxServiceDays, Math.floor(Number(row.days) || 1))),
          discount_percent: Math.min(100, Math.max(0, Number(row.discount_percent) || 0)),
        }));

      const payload: RentalCreatePayload = {
        type,
        client_id: clientId,
        client_represents_company: hasClientCompany ? clientRepresentsCompany : false,
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        usage_start_date: usageStartDate || null,
        usage_end_date: usageEndDate || null,
        location,
        delivery_offer_id: selectedDeliveryOffer?.id || null,
        delivery_offer_name: selectedDeliveryOffer?.name || null,
        delivery_pricing_type: selectedDeliveryOffer?.pricing_type || null,
        delivery_rate_amount: selectedDeliveryOffer ? Number(selectedDeliveryOffer.rate_amount || 0) : null,
        delivery_base_amount: selectedDeliveryOffer ? Number(selectedDeliveryOffer.base_amount || 0) : null,
        delivery_quantity: selectedDeliveryOffer ? resolvedDeliveryQuantity : null,
        delivery_round_trip: selectedDeliveryOffer ? deliveryTripType === 'round_trip' : null,
        delivery_total_amount: selectedDeliveryOffer ? Number(deliveryTotal.toFixed(2)) : null,
        description,
        color: color || undefined,
        status: 'pending',
        total_price: Number(totalPrice.toFixed(2)),
        discount_type: (discountType || undefined) as any,
        discount_value: discountValue,
        items: items.map(item => ({
          ...item,
          group_id: item.group_id || null,
          position: item.position || 0,
          is_external: !!item.is_external,
          discount_percent: Number.isFinite(item.discount_percent)
            ? Math.min(100, Math.max(0, Number(item.discount_percent)))
            : 0,
          external_name: item.is_external ? (item.external_name || item.equipment_name) : null,
          external_type: item.is_external ? (item.external_type || item.equipment_type) : null,
          external_subtype: item.is_external ? item.external_subtype || null : null,
        external_description: item.is_external ? item.external_description || null : null,
        external_supplier: item.is_external ? item.external_supplier || null : null,
        })),
        assigned_personnel_ids: type === 'service' ? assignedPersonnelIds : undefined,
        vehicle_assignments: vehicleRows.map((row) => ({
          vehicle_id: row.vehicle_id,
          delivery_at: row.delivery_at || undefined,
          appointment_at: row.appointment_at || undefined,
          ...(deliveryTripType === 'round_trip'
            ? {
                return_delivery_at: row.return_delivery_at || undefined,
                return_appointment_at: row.return_appointment_at || undefined,
              }
            : {}),
        })),
        personnel_service_items: type === 'service' && personnelServicePayload.length > 0 ? personnelServicePayload : undefined,
      };
      if (orderedGroupsPayload.length) {
        (payload as any).item_groups = orderedGroupsPayload;
      }
      await onSubmit(payload);
    } finally {
      setSaving(false);
    }
  };

  const progress = ((step + 1) / stepsDef.length) * 100;
  const colorValue = color || '#111827';

  return (
    <>
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 pt-5">
          <ProgressBar value={progress} className="h-2 bg-gray-200" indicatorClassName="bg-blue-600" />
          <div className="mt-2 text-sm text-gray-600">
            {t('rentals.wizard.progress', {
              current: step + 1,
              total: stepsDef.length,
              label: stepLabels[stepsDef[step]],
            })}
          </div>
        </div>
        <div className="p-6">
          <StepTransition stepKey={step} direction={transitionDirection} className="space-y-6">
            {stepsDef[step] === 'basic' && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label={t('rentals.wizard.basic.typeLabel')} id="rental-type">
                        <Select
                          id="rental-type"
                          value={type}
                          onChange={(e) => setType(e.target.value as RentalType)}
                          aria-label={t('rentals.wizard.basic.typeLabel')}
                        >
                          <option value="rental">{t('rentals.type.rental')}</option>
                          <option value="service">{t('rentals.type.service')}</option>
                          <option value="sale">{t('rentals.type.sale')}</option>
                        </Select>
                      </Field>
                      <Field label={t('rentals.wizard.basic.clientLabel')} id="rental-client">
                        <SearchableSelect
                          id="rental-client"
                          value={clientId}
                          onChange={setClientId}
                          placeholder={t('rentals.wizard.basic.clientPlaceholder')}
                          searchPlaceholder={t('rentals.wizard.basic.clientSearchPlaceholder')}
                          emptyLabel={t('rentals.wizard.basic.clientEmpty')}
                          options={clients.map((c) => ({ value: c.id, label: c.name }))}
                        />
                      </Field>
                    </div>
                    <Field
                      label={t('rentals.wizard.basic.clientRepresentsCompanyLabel')}
                      id="client-represents-company"
                      helper={!hasClientCompany ? t('rentals.wizard.basic.clientRepresentsCompanyHelper') : undefined}
                    >
                      <label
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                          hasClientCompany ? 'border-slate-200 text-slate-700 hover:bg-slate-50' : 'border-slate-200 text-slate-400'
                        }`}
                      >
                        <input
                          id="client-represents-company"
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={clientRepresentsCompany}
                          disabled={!hasClientCompany}
                          onChange={(event) => {
                            setClientRepresentsCompany(event.target.checked);
                            setClientRepresentsTouched(true);
                          }}
                        />
                        <span>{t('rentals.wizard.basic.clientRepresentsCompanyChoice')}</span>
                      </label>
                    </Field>
                    <Field
                      label={t('rentals.wizard.basic.titleLabel')}
                      id="rental-title"
                      helper={t('rentals.wizard.basic.titleHelper')}
                    >
                      <Input
                        id="rental-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t('rentals.wizard.basic.titlePlaceholder')}
                      />
                    </Field>
                    <Field
                      label={t('rentals.wizard.basic.descriptionLabel')}
                      id="rental-description"
                    >
                      <Textarea
                        id="rental-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder={t('rentals.wizard.basic.descriptionPlaceholder')}
                      />
                    </Field>
                  </div>
                </div>
                <div className="lg:col-span-2 flex h-full flex-col">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-5">
                    {/* ── Période de Facturation ── */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Période de Facturation</span>
                        <div className="flex-1 h-px bg-blue-100" />
                        <span className="text-xs text-blue-400">Détermine le tarif</span>
                      </div>
                      {type === 'sale' ? (
                        <DateField
                          label={t('rentals.wizard.schedule.saleLabel')}
                          value={startDate}
                          minDate={minDate}
                          onChange={(value) => {
                            const startValue = value ? toStartOfDayValue(value) : '';
                            setStartDate(startValue);
                            setEndDate(startValue ? toEndOfDayValue(startValue) : '');
                          }}
                        />
                      ) : (
                        <DateRangeField
                          label=""
                          start={startDate}
                          end={endDate}
                          minDate={minDate}
                          onChange={({ start, end }) => {
                            if (singleDay) {
                              const startValue = start ? toStartOfDayValue(start) : '';
                              setStartDate(startValue);
                              setEndDate(startValue ? toEndOfDayValue(startValue) : '');
                              return;
                            }
                            setStartDate(start || '');
                            setEndDate(end || '');
                          }}
                          singleDay={singleDay}
                          singleDayLabel={t('rentals.wizard.schedule.singleDayToggle')}
                          onSingleDayChange={(checked) => {
                            setSingleDay(checked);
                            if (!checked) return;
                            const base = startDate || endDate;
                            if (!base) return;
                            const startValue = toStartOfDayValue(base);
                            setStartDate(startValue);
                            setEndDate(startValue ? toEndOfDayValue(startValue) : '');
                          }}
                        />
                      )}
                      <p className="text-xs text-slate-400">
                        {type === 'sale'
                          ? t('rentals.wizard.schedule.saleSummary', { date: startDate ? formatDateDisplay(startDate) : '—' })
                          : t('rentals.wizard.schedule.duration', { count: days })}
                      </p>
                    </div>

                    {/* ── Période d'Utilisation ── */}
                    {type !== 'sale' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">{"Période d'Utilisation"}</span>
                          <div className="flex-1 h-px bg-blue-100" />
                          <span className="text-xs text-blue-400 italic">Optionnelle — réservation matériel</span>
                        </div>
                        <p className="text-xs text-slate-400 -mt-1">{"Si renseignée, le matériel est réservé sur cette période plutôt que la période de facturation."}</p>
                        <DateRangeField
                          label=""
                          start={usageStartDate}
                          end={usageEndDate}
                          minDate={minDate}
                          onChange={({ start, end }) => {
                            setUsageStartDate(start || '');
                            setUsageEndDate(end || '');
                          }}
                        />
                        {usageWarning && (
                          <div className="flex items-start gap-1.5 text-xs text-amber-600">
                            <svg className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <span>{"La période d'utilisation est plus courte que la période de facturation."}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-1 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <Field label={t('rentals.wizard.basic.colorLabel')} className="flex flex-1 flex-col">
                      <div className="flex flex-1 items-center gap-4">
                        <ColorPickerButton
                          value={colorValue}
                          onChange={(next) => setColor(next)}
                          ariaLabel={t('rentals.wizard.basic.colorAria', { color: colorValue })}
                          size="lg"
                        />
                        <div className="h-8 w-px bg-gray-200" aria-hidden="true" />
                        <div className="flex items-center gap-3">
                          {['#2563eb', '#059669', '#DC2626', '#7C3AED', '#F59E0B', '#10B981', '#111827'].map((c) => (
                            <button
                              key={c}
                              type="button"
                              title={c}
                              onClick={() => setColor(c)}
                              className={`relative h-9 w-9 rounded-full border ${colorValue === c ? 'ring-2 ring-offset-2 ring-blue-500' : 'border-gray-300'}`}
                              style={{ backgroundColor: c }}
                              aria-label={t('rentals.wizard.basic.colorAria', { color: c })}
                            >
                              {colorValue === c && (
                                <span className="absolute inset-0 rounded-full border-2 border-white" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </Field>
                  </div>
                </div>
              </div>
            )}

          {stepsDef[step] === 'delivery' && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <Field
                      label={t('rentals.wizard.delivery.locationLabel')}
                      id="rental-location"
                      helper={t('rentals.wizard.delivery.locationHelper')}
                    >
                      <AddressSearchInput
                        id="rental-location"
                        value={location}
                        onChange={setLocation}
                        onSelect={setConfirmedLocation}
                        placeholder={t('rentals.wizard.delivery.locationPlaceholder')}
                        emptyLabel={t('rentals.wizard.delivery.addressEmpty')}
                        loadingLabel={t('common.loading')}
                      />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{t('rentals.wizard.delivery.forfait.title')}</div>
                      <div className="text-xs text-gray-500">{t('rentals.wizard.delivery.forfait.description')}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label={t('rentals.wizard.delivery.forfait.offerLabel')} id="delivery-offer">
                        <Select
                          id="delivery-offer"
                          value={deliveryOfferId}
                          onChange={(e) => setDeliveryOfferId(e.target.value)}
                          disabled={deliveryOffersLoading}
                        >
                          <option value="">{t('rentals.wizard.delivery.forfait.offerPlaceholder')}</option>
                          {activeDeliveryOffers.map((offer) => (
                            <option key={offer.id} value={offer.id}>
                              {offer.name}
                            </option>
                          ))}
                        </Select>
                        {!deliveryOffersLoading && activeDeliveryOffers.length === 0 && (
                          <p className="mt-1 text-xs text-gray-500">{t('rentals.wizard.delivery.forfait.offerEmpty')}</p>
                        )}
                      </Field>
                      {deliveryQuantityMeta.show && (
                        <Field label={deliveryQuantityMeta.label} id="delivery-quantity">
                          <Input
                            id="delivery-quantity"
                            type="number"
                            min={0}
                            step={deliveryQuantityMeta.step}
                            value={deliveryQuantity}
                            onChange={(e) => setDeliveryQuantity(e.target.value)}
                          />
                        </Field>
                      )}
                      {selectedDeliveryOffer && (
                        <Field label={t('rentals.wizard.delivery.forfait.tripLabel')} id="delivery-trip">
                          <Select
                            id="delivery-trip"
                            value={deliveryTripType}
                            onChange={(e) => setDeliveryTripType(e.target.value as 'one_way' | 'round_trip')}
                          >
                            <option value="one_way">{t('rentals.wizard.delivery.forfait.trip.oneWay')}</option>
                            <option value="round_trip">{t('rentals.wizard.delivery.forfait.trip.roundTrip')}</option>
                          </Select>
                        </Field>
                      )}
                      {selectedDeliveryOffer && (
                        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
                          <div className="text-sm text-gray-700">{deliveryPricingDetails}</div>
                          <div className="text-sm font-medium text-gray-900">
                            {t('rentals.wizard.delivery.forfait.totalLabel', { amount: formatCurrency(deliveryTotal) })}
                          </div>
                          {selectedDeliveryOffer.description && (
                            <div className="text-xs text-gray-500">{selectedDeliveryOffer.description}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{t('rentals.wizard.delivery.vehiclesTitle')}</div>
                        <div className="text-xs text-gray-500">{t('rentals.wizard.delivery.hint')}</div>
                      </div>
                      <Button
                        type="button"
                        className="px-3 py-1.5 text-sm"
                        onClick={() =>
                          setVehicleRows((prev) => [
                            ...prev,
                            { id: String(Date.now() + Math.random()), vehicle_id: '' },
                          ])
                        }
                      >
                        {t('rentals.wizard.delivery.addVehicle')}
                      </Button>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                              {t('rentals.wizard.delivery.table.vehicle')}
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                              {t('rentals.wizard.delivery.table.delivery')}
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                              {t('rentals.wizard.delivery.table.appointment')}
                            </th>
                            {deliveryTripType === 'round_trip' && (
                              <>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                  Retour livraison
                                </th>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                                  RDV retour
                                </th>
                              </>
                            )}
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                              {t('rentals.wizard.delivery.table.actions')}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {vehicleRows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-3 py-2">
                                <Select
                                  value={row.vehicle_id}
                                  onChange={(e) =>
                                    setVehicleRows((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id ? { ...r, vehicle_id: e.target.value } : r
                                      )
                                    )
                                  }
                                  className="text-sm"
                                >
                                  <option value="">{t('rentals.wizard.delivery.table.vehiclePlaceholder')}</option>
                                  {vehicles.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name} — {v.license_plate}
                                    </option>
                                  ))}
                                </Select>
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="datetime-local"
                                  min={minDateTime}
                                  value={row.delivery_at || ''}
                                  onChange={(e) =>
                                    setVehicleRows((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id ? { ...r, delivery_at: e.target.value } : r
                                      )
                                    )
                                  }
                                  className="text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="datetime-local"
                                  min={minDateTime}
                                  value={row.appointment_at || ''}
                                  onChange={(e) =>
                                    setVehicleRows((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id ? { ...r, appointment_at: e.target.value } : r
                                      )
                                    )
                                  }
                                  className="text-sm"
                                />
                              </td>
                              {deliveryTripType === 'round_trip' && (
                                <>
                                  <td className="px-3 py-2">
                                    <Input
                                      type="datetime-local"
                                      min={minDateTime}
                                      value={row.return_delivery_at || ''}
                                      onChange={(e) =>
                                        setVehicleRows((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id ? { ...r, return_delivery_at: e.target.value } : r
                                          )
                                        )
                                      }
                                      className="text-sm"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <Input
                                      type="datetime-local"
                                      min={minDateTime}
                                      value={row.return_appointment_at || ''}
                                      onChange={(e) =>
                                        setVehicleRows((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id ? { ...r, return_appointment_at: e.target.value } : r
                                          )
                                        )
                                      }
                                      className="text-sm"
                                    />
                                  </td>
                                </>
                              )}
                              <td className="px-3 py-2 text-right">
                                <Button
                                  type="button"
                                  onClick={() =>
                                    setVehicleRows((prev) => prev.filter((r) => r.id !== row.id))
                                  }
                                  variant="ghost"
                                  className="px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                >
                                  {t('rentals.wizard.delivery.table.remove')}
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {vehicleRows.length === 0 && (
                            <tr>
                              <td className="px-3 py-4 text-sm text-gray-500" colSpan={deliveryTripType === 'round_trip' ? 6 : 4}>
                                {t('rentals.wizard.delivery.table.empty')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-2 flex flex-col gap-3">
                  <LocationMapPreview address={confirmedLocation} className="flex-1 min-h-[160px]" />
                  <DepotDistanceCard companyAddress={settings?.address ?? ''} deliveryAddress={confirmedLocation} />
                </div>
              </div>
          )}

            {stepsDef[step] === 'items' && (
              <div>
              <RentalEquipmentList
                items={items}
                groups={itemGroups}
                onQuantityChange={handleQuantityChange}
                onDiscountChange={handleDiscountChange}
                onRemoveItem={handleRemoveItem}
                onAddItem={handleAddItem}
                onAddExternalItem={handleAddExternalItem}
                onAddGroup={handleAddGroup}
                onRemoveGroup={handleRemoveGroup}
                onMoveGroup={handleMoveGroup}
                onMoveItem={handleMoveItem}
                  startDate={startDate}
                  endDate={endDate}
                  externalTabLabel={type === 'sale' ? t('rentals.selection.tabs.purchase') : undefined}
                  skipAvailability={type === 'sale'}
                  coefficient={equipmentCoefficient}
                />
              </div>
            )}

            {stepsDef[step] === 'personnel' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="text-sm text-gray-700">{t('rentals.wizard.personnel.instructions')}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto border rounded p-2">
                    {personnel.map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={assignedPersonnelIds.includes(p.id)}
                          onChange={(e) => {
                            setAssignedPersonnelIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id));
                          }}
                        />
                        <span>{p.first_name} {p.last_name}</span>
                      </label>
                    ))}
                    {personnel.length === 0 && (
                      <div className="text-xs text-gray-500">{t('rentals.wizard.personnel.empty')}</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{t('rentals.wizard.personnel.services.title')}</div>
                      <div className="text-xs text-gray-500">{t('rentals.wizard.personnel.services.description')}</div>
                    </div>
                    <Button
                      type="button"
                      className="px-3 py-1.5 text-sm"
                      onClick={addPersonnelServiceRow}
                    >
                      {t('rentals.wizard.personnel.services.add')}
                    </Button>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                            {t('rentals.wizard.personnel.services.serviceLabel')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                            {t('rentals.wizard.personnel.services.costLabel')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                            {t('rentals.wizard.personnel.services.quantityLabel')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                            {t('rentals.wizard.personnel.services.daysLabel', { count: maxServiceDays })}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                            {t('rentals.wizard.personnel.services.discountLabel')}
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                            {t('rentals.wizard.delivery.table.actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {personnelServiceRows.map((row) => {
                          const selectedService = personnelServiceLookup.get(row.service_record_id);
                          const costLabel = selectedService?.cost_per_person != null
                            ? formatCurrency(Number(selectedService.cost_per_person))
                            : '-';
                          return (
                            <tr key={row.id}>
                              <td className="px-3 py-2">
                                <Select
                                  value={row.service_record_id}
                                  onChange={(e) =>
                                    updatePersonnelServiceRow(row.id, { service_record_id: e.target.value })
                                  }
                                  className="text-sm"
                                  disabled={servicesLoading}
                                >
                                  <option value="">
                                    {servicesLoading
                                      ? t('common.loading')
                                      : t('rentals.wizard.personnel.services.servicePlaceholder')}
                                  </option>
                                  {personnelServices.map((service) => (
                                    <option key={service.id} value={service.id}>
                                      {service.title}
                                      {service.cost_per_person != null
                                        ? ` - ${formatCurrency(Number(service.cost_per_person))}`
                                        : ''}
                                    </option>
                                  ))}
                                </Select>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700">
                                {costLabel}
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={row.quantity}
                                  onChange={(e) =>
                                    updatePersonnelServiceRow(
                                      row.id,
                                      { quantity: parsePositiveInt(e.target.value, row.quantity || 1) }
                                    )
                                  }
                                  className="text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={1}
                                  max={maxServiceDays}
                                  step={1}
                                  value={row.days}
                                  onChange={(e) =>
                                    updatePersonnelServiceRow(
                                      row.id,
                                      { days: parsePositiveInt(e.target.value, row.days || 1, maxServiceDays) }
                                    )
                                  }
                                  className="text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={row.discount_percent}
                                  onChange={(e) =>
                                    updatePersonnelServiceRow(
                                      row.id,
                                      { discount_percent: parsePercent(e.target.value, row.discount_percent || 0) }
                                    )
                                  }
                                  className="text-sm"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  type="button"
                                  onClick={() => removePersonnelServiceRow(row.id)}
                                  variant="ghost"
                                  className="px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                >
                                  {t('rentals.wizard.delivery.table.remove')}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        {personnelServiceRows.length === 0 && (
                          <tr>
                            <td className="px-3 py-4 text-sm text-gray-500" colSpan={6}>
                              {t('rentals.wizard.personnel.services.empty')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {!servicesLoading && personnelServices.length === 0 && (
                    <div className="text-xs text-gray-500">
                      {t('rentals.wizard.personnel.services.optionsEmpty')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {stepsDef[step] === 'pricing' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-3">
                  <div className="text-sm text-gray-600 mb-2">
                    {t('rentals.wizard.pricing.base', { amount: formatCurrency(baseTotal) })}
                  </div>
                  {selectedDeliveryOffer && deliveryTotal > 0 && (
                    <div className="text-xs text-gray-500">
                      {t('rentals.wizard.pricing.delivery', { amount: formatCurrency(deliveryTotal) })}
                    </div>
                  )}
                </div>
                <Field label={t('rentals.wizard.pricing.discountType')} id="discount-type">
                  <Select
                    id="discount-type"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                  >
                    <option value="">{t('rentals.wizard.pricing.discount.none')}</option>
                    <option value="percentage">{t('rentals.wizard.pricing.discount.percentage')}</option>
                    <option value="fixed">{t('rentals.wizard.pricing.discount.fixed')}</option>
                  </Select>
                </Field>
                {discountType && (
                  <Field label={t('rentals.wizard.pricing.discountValue')} id="discount-value">
                    <Input
                      id="discount-value"
                      type="number"
                      min={0}
                      step={discountType === 'percentage' ? 1 : 0.01}
                      value={discountValue ?? ''}
                      onChange={(e) =>
                        setDiscountValue(e.target.value === '' ? undefined : Number(e.target.value))
                      }
                    />
                  </Field>
                )}

                <div className="md:col-span-3 text-sm text-gray-900 font-medium">
                  {t('rentals.wizard.pricing.total', { amount: formatCurrency(totalPrice) })}
                </div>
              </div>
            )}

            {stepsDef[step] === 'summary' && (
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">{t('rentals.wizard.summary.title')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded p-4">
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.details.title', { value: title || '—' })}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.details.type', {
                        value: typeLabels[type],
                      })}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.details.client', {
                        value: clients.find((c) => c.id === clientId)?.name || '—',
                      })}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.details.clientProfile', {
                        value: clientProfileLabel,
                      })}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.details.period', {
                        value: t('rentals.wizard.summary.periodValue', {
                          start: formatDateDisplay(startDate),
                          end: formatDateDisplay(endDate),
                        }),
                      })}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.details.location', { value: location || '—' })}
                    </div>
                    {deliverySummaryValue && (
                      <div className="text-sm text-gray-700">
                        {t('rentals.wizard.summary.details.delivery', { value: deliverySummaryValue })}
                      </div>
                    )}
                  </div>
                  <div className="border rounded p-4">
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.financial.items', { count: items.length })}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.financial.base', { amount: formatCurrency(baseTotal) })}
                    </div>
                    {selectedDeliveryOffer && deliveryTotal > 0 && (
                      <div className="text-sm text-gray-700">
                        {t('rentals.wizard.summary.financial.delivery', { amount: formatCurrency(deliveryTotal) })}
                      </div>
                    )}
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.financial.discount', {
                        value: discountType
                          ? discountType === 'percentage'
                            ? t('rentals.wizard.summary.financial.discountPercentage', {
                                value: discountValue ?? 0,
                              })
                            : t('rentals.wizard.summary.financial.discountFixed', {
                                amount: formatCurrency(discountValue ?? 0),
                              })
                          : t('rentals.wizard.summary.financial.discountNone'),
                      })}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('rentals.wizard.summary.financial.total', { amount: formatCurrency(totalPrice) })}
                    </div>
                  </div>
                </div>
                <div className="border rounded p-4">
                  <div className="text-sm font-medium text-gray-900 mb-2">{t('rentals.wizard.summary.material.title')}</div>
                  <div className="space-y-2 text-sm text-gray-700">
                    {ungroupedForSummary.length > 0 && (
                      <div>
                        <div className="text-xs uppercase text-gray-500">{t('rentals.wizard.summary.material.ungrouped')}</div>
                        <ul className="mt-1 space-y-1">
                          {ungroupedForSummary.map((item) => (
                            <li key={item.id} className="flex items-center justify-between">
                              <span>{item.equipment_name}</span>
                              <span className="text-xs text-gray-500">
                                {t('rentals.wizard.summary.material.quantity', { count: item.quantity })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {groupedForSummary.map(({ group, items: grouped }) => (
                      <div key={group.id} className="space-y-1">
                        <div className="text-xs uppercase text-gray-500">{group.name}</div>
                        {grouped.length === 0 ? (
                          <div className="text-xs text-gray-400">{t('rentals.wizard.summary.material.emptyGroup')}</div>
                        ) : (
                          <ul className="space-y-1 pl-3 border-l border-gray-200">
                            {grouped.map((item) => (
                              <li key={item.id} className="flex items-center justify-between">
                                <span>{item.equipment_name}</span>
                                <span className="text-xs text-gray-500">
                                  {t('rentals.wizard.summary.material.quantity', { count: item.quantity })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className="text-xs text-gray-500">{t('rentals.wizard.summary.material.none')}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </StepTransition>
        </div>
        <div className="px-6 pb-5 flex justify-between">
          <Button
            type="button"
            onClick={prev}
            disabled={step === 0}
            variant="ghost"
            className={`px-4 py-2 border ${
              step === 0 ? 'border-gray-200 text-gray-300' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('rentals.wizard.buttons.previous')}
          </Button>
          {step < stepsDef.length - 1 ? (
            <Button
              type="button"
              onClick={next}
              disabled={!canNext()}
              className={`px-4 py-2 ${canNext() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}
            >
              {t('rentals.wizard.buttons.next')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={submit}
              disabled={saving || !canNext()}
              className={`px-4 py-2 ${saving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? t('rentals.wizard.buttons.saving') : t('rentals.wizard.buttons.save')}
            </Button>
          )}
        </div>
      </div>

    </>
  );
};

export default RentalCreateWizard;
