import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Hash,
  Package,
  QrCode,
  Search,
  Wrench,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type EquipmentBaseRow = {
  id: string;
  name: string | null;
  type: string | null;
  subtype: string | null;
  inventory_category: string | null;
  status: string | null;
};

type EquipmentUnitRow = {
  id: string;
  equipment_id: string;
  serial_number: string | null;
  status: string | null;
  warehouse_id: string | null;
  qr_code_value: string | null;
  qr_code_generated_at: string | null;
};

type EquipmentStockRow = {
  equipment_id: string | null;
  quantity: number | null;
};

type EquipmentMaintenanceRow = {
  equipment_id: string | null;
  serial_number: string | null;
  status: string | null;
};

type WarehouseRow = {
  id: string;
  name: string | null;
};

type RentalRow = {
  id: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  reference_code: string | null;
  title: string | null;
};

type RentalItemRow = {
  equipment_id: string | null;
  rental_id: string | null;
  quantity: number | null;
};

type UnitHistoryRow = {
  equipment_unit_id: string | null;
  equipment_id: string | null;
  rental_id: string | null;
  reference_code: string | null;
  rental_title: string | null;
  client_name: string | null;
  event_type: string | null;
  event_at: string | null;
};

type RawDataset = {
  equipment: EquipmentBaseRow[];
  units: EquipmentUnitRow[];
  stock: EquipmentStockRow[];
  maintenance: EquipmentMaintenanceRow[];
  warehouses: WarehouseRow[];
  rentals: RentalRow[];
  rentalItems: RentalItemRow[];
  unitHistory: UnitHistoryRow[];
};

type EquipmentReportRow = {
  equipmentId: string;
  equipmentName: string;
  category: string;
  inventoryCategory: string;
  totalUnits: number;
  availableUnits: number;
  inUseUnits: number;
  maintenanceUnits: number;
  maintenanceOpen: number;
  qrMissing: number;
  rentalsInPeriod: number;
  rentalEventsInPeriod: number;
  avgRentalDurationDays: number;
  utilizationRate: number;
  rotationPerUnit: number;
  lastRentalAt: string | null;
};

type UnitReportRow = {
  unitId: string;
  equipmentId: string;
  equipmentName: string;
  category: string;
  serialNumber: string;
  status: string;
  warehouseName: string;
  hasQr: boolean;
  lastScanAt: string | null;
  preparedCount: number;
  returnedCount: number;
  uniqueRentals: number;
  latestRentalId: string | null;
  latestRentalRef: string | null;
  latestClient: string | null;
  currentlyOut: boolean;
  anomaly: string | null;
};

const ACTIVE_RENTAL_STATUSES = new Set([
  'confirmed',
  'preparing',
  'in_progress',
  'delivered',
  'return_delivery',
  'in_return',
]);

const MAINTENANCE_UNIT_STATUSES = new Set(['maintenance', 'broken']);

const toDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computeDurationDays = (startValue: string | null, endValue: string | null) => {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return 0;
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
};

const formatDateTime = (value: string | null) => {
  const parsed = toDate(value);
  if (!parsed) return '—';
  return parsed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatDateOnly = (value: string | null) => {
  const parsed = toDate(value);
  if (!parsed) return '—';
  return parsed.toLocaleDateString('fr-FR', { dateStyle: 'short' });
};

const formatStatus = (status: string) => {
  switch (status) {
    case 'available':
      return 'Disponible';
    case 'in_use':
      return 'En usage';
    case 'maintenance':
      return 'Maintenance';
    case 'broken':
      return 'HS';
    default:
      return status;
  }
};

const unitStatusClass = (status: string) => {
  switch (status) {
    case 'available':
      return 'bg-emerald-100 text-emerald-700';
    case 'in_use':
      return 'bg-blue-100 text-blue-700';
    case 'maintenance':
      return 'bg-amber-100 text-amber-700';
    case 'broken':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const EquipmentTab: React.FC = () => {
  const [windowDays, setWindowDays] = useState<number>(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [serialSearch, setSerialSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('all');
  const [unitStatusFilter, setUnitStatusFilter] = useState('all');
  const [equipmentSort, setEquipmentSort] = useState<'rentals' | 'utilization' | 'maintenance' | 'name'>('rentals');

  const [dataset, setDataset] = useState<RawDataset>({
    equipment: [],
    units: [],
    stock: [],
    maintenance: [],
    warehouses: [],
    rentals: [],
    rentalItems: [],
    unitHistory: [],
  });

  const loadReporting = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sb: any = supabase;
      const since = new Date();
      since.setDate(since.getDate() - windowDays);
      const sinceIso = since.toISOString();

      const [
        equipmentRes,
        unitsRes,
        stockRes,
        maintenanceRes,
        warehousesRes,
        rentalsRes,
        unitHistoryRes,
      ] = await Promise.all([
        supabase
          .from('equipment')
          .select('id, name, type, subtype, inventory_category, status')
          .order('name', { ascending: true }),
        sb
          .from('equipment_units')
          .select('id, equipment_id, serial_number, status, warehouse_id, qr_code_value, qr_code_generated_at'),
        supabase
          .from('equipment_stock')
          .select('equipment_id, quantity'),
        supabase
          .from('equipment_unit_maintenance_history')
          .select('equipment_id, serial_number, status')
          .in('status', ['scheduled', 'in_progress']),
        supabase
          .from('warehouses')
          .select('id, name'),
        supabase
          .from('rentals')
          .select('id, start_date, end_date, status, reference_code, title')
          .gte('start_date', sinceIso),
        sb
          .from('equipment_unit_rental_history')
          .select('equipment_unit_id, equipment_id, rental_id, reference_code, rental_title, client_name, event_type, event_at'),
      ]);

      if (equipmentRes.error) throw equipmentRes.error;
      if (stockRes.error) throw stockRes.error;
      if (maintenanceRes.error) throw maintenanceRes.error;
      if (warehousesRes.error) throw warehousesRes.error;
      if (rentalsRes.error) throw rentalsRes.error;

      if (unitsRes.error) {
        console.warn('equipment reporting units query failed', unitsRes.error);
      }
      if (unitHistoryRes.error) {
        console.warn('equipment reporting unit history query failed', unitHistoryRes.error);
      }

      const rentals = (rentalsRes.data || []) as RentalRow[];
      const rentalIds = rentals.map((row) => row.id).filter(Boolean);

      let rentalItems: RentalItemRow[] = [];
      if (rentalIds.length > 0) {
        const rentalItemsRes = await supabase
          .from('rental_items')
          .select('equipment_id, rental_id, quantity')
          .in('rental_id', rentalIds);

        if (rentalItemsRes.error) {
          throw rentalItemsRes.error;
        }
        rentalItems = (rentalItemsRes.data || []) as RentalItemRow[];
      }

      setDataset({
        equipment: (equipmentRes.data || []) as EquipmentBaseRow[],
        units: (unitsRes.data || []) as EquipmentUnitRow[],
        stock: (stockRes.data || []) as EquipmentStockRow[],
        maintenance: (maintenanceRes.data || []) as EquipmentMaintenanceRow[],
        warehouses: (warehousesRes.data || []) as WarehouseRow[],
        rentals,
        rentalItems,
        unitHistory: (unitHistoryRes.data || []) as UnitHistoryRow[],
      });
    } catch (err) {
      console.error('equipment reporting load error', err);
      setError('Impossible de charger le reporting matériel.');
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    void loadReporting();
  }, [loadReporting]);

  const equipmentById = useMemo(() => {
    const map = new Map<string, EquipmentBaseRow>();
    dataset.equipment.forEach((row) => map.set(row.id, row));
    return map;
  }, [dataset.equipment]);

  const warehouseById = useMemo(() => {
    const map = new Map<string, string>();
    dataset.warehouses.forEach((row) => {
      map.set(row.id, row.name || row.id);
    });
    return map;
  }, [dataset.warehouses]);

  const equipmentReports = useMemo<EquipmentReportRow[]>(() => {
    const unitsByEquipment = new Map<string, EquipmentUnitRow[]>();
    dataset.units.forEach((unit) => {
      const list = unitsByEquipment.get(unit.equipment_id) || [];
      list.push(unit);
      unitsByEquipment.set(unit.equipment_id, list);
    });

    const stockByEquipment = new Map<string, number>();
    dataset.stock.forEach((row) => {
      if (!row.equipment_id) return;
      stockByEquipment.set(
        row.equipment_id,
        (stockByEquipment.get(row.equipment_id) || 0) + parseNumber(row.quantity),
      );
    });

    const maintenanceByEquipment = new Map<string, number>();
    dataset.maintenance.forEach((row) => {
      if (!row.equipment_id) return;
      maintenanceByEquipment.set(
        row.equipment_id,
        (maintenanceByEquipment.get(row.equipment_id) || 0) + 1,
      );
    });

    const rentalsByEquipment = new Map<string, Set<string>>();
    const rentalEventsByEquipment = new Map<string, number>();
    const activeUsageByEquipment = new Map<string, number>();

    const rentalsById = new Map(dataset.rentals.map((row) => [row.id, row] as const));

    dataset.rentalItems.forEach((row) => {
      if (!row.equipment_id || !row.rental_id) return;

      const ids = rentalsByEquipment.get(row.equipment_id) || new Set<string>();
      ids.add(row.rental_id);
      rentalsByEquipment.set(row.equipment_id, ids);

      rentalEventsByEquipment.set(
        row.equipment_id,
        (rentalEventsByEquipment.get(row.equipment_id) || 0) + 1,
      );

      const linkedRental = rentalsById.get(row.rental_id);
      if (!linkedRental) return;
      if (!ACTIVE_RENTAL_STATUSES.has(linkedRental.status || '')) return;

      activeUsageByEquipment.set(
        row.equipment_id,
        (activeUsageByEquipment.get(row.equipment_id) || 0) + parseNumber(row.quantity),
      );
    });

    return dataset.equipment.map((equipment) => {
      const units = unitsByEquipment.get(equipment.id) || [];
      const trackedByUnits = units.length > 0;
      const stockTotal = stockByEquipment.get(equipment.id) || 0;

      const totalUnits = trackedByUnits ? units.length : stockTotal;
      const maintenanceOpen = maintenanceByEquipment.get(equipment.id) || 0;

      const inUseUnits = trackedByUnits
        ? units.filter((unit) => unit.status === 'in_use').length
        : Math.min(totalUnits, activeUsageByEquipment.get(equipment.id) || 0);

      const maintenanceUnits = trackedByUnits
        ? units.filter((unit) => MAINTENANCE_UNIT_STATUSES.has(unit.status || '')).length
        : Math.min(totalUnits, maintenanceOpen);

      const availableUnits = trackedByUnits
        ? units.filter((unit) => unit.status === 'available').length
        : Math.max(0, totalUnits - inUseUnits - maintenanceUnits);

      const rentalsSet = rentalsByEquipment.get(equipment.id) || new Set<string>();
      const rentalsInPeriod = rentalsSet.size;
      const rentalEventsInPeriod = rentalEventsByEquipment.get(equipment.id) || 0;

      const durations = Array.from(rentalsSet)
        .map((rentalId) => rentalsById.get(rentalId))
        .filter((rental): rental is RentalRow => Boolean(rental))
        .map((rental) => computeDurationDays(rental.start_date, rental.end_date))
        .filter((days) => days > 0);

      const avgRentalDurationDays = durations.length
        ? Number((durations.reduce((sum, days) => sum + days, 0) / durations.length).toFixed(1))
        : 0;

      const lastRentalAt = Array.from(rentalsSet)
        .map((rentalId) => rentalsById.get(rentalId)?.start_date || null)
        .filter(Boolean)
        .sort((a, b) => (toDate(b)?.getTime() || 0) - (toDate(a)?.getTime() || 0))[0] || null;

      const utilizationRate = totalUnits > 0 ? Math.round((inUseUnits / totalUnits) * 100) : 0;
      const rotationPerUnit = totalUnits > 0
        ? Number((rentalEventsInPeriod / totalUnits).toFixed(2))
        : 0;

      return {
        equipmentId: equipment.id,
        equipmentName: equipment.name || 'Matériel',
        category: [equipment.type, equipment.subtype].filter(Boolean).join(' / ') || '—',
        inventoryCategory: equipment.inventory_category || '—',
        totalUnits,
        availableUnits,
        inUseUnits,
        maintenanceUnits,
        maintenanceOpen,
        qrMissing: units.filter((unit) => !unit.qr_code_value).length,
        rentalsInPeriod,
        rentalEventsInPeriod,
        avgRentalDurationDays,
        utilizationRate,
        rotationPerUnit,
        lastRentalAt,
      };
    });
  }, [dataset]);

  const unitReports = useMemo<UnitReportRow[]>(() => {
    const historyByUnit = new Map<string, UnitHistoryRow[]>();

    dataset.unitHistory.forEach((row) => {
      if (!row.equipment_unit_id) return;
      const list = historyByUnit.get(row.equipment_unit_id) || [];
      list.push(row);
      historyByUnit.set(row.equipment_unit_id, list);
    });

    historyByUnit.forEach((list) => {
      list.sort((a, b) => (toDate(b.event_at)?.getTime() || 0) - (toDate(a.event_at)?.getTime() || 0));
    });

    const maintenanceBySerial = new Set(
      dataset.maintenance
        .map((row) => (row.serial_number || '').trim().toLowerCase())
        .filter(Boolean),
    );

    return dataset.units.map((unit) => {
      const equipment = equipmentById.get(unit.equipment_id);
      const history = historyByUnit.get(unit.id) || [];

      const preparedCount = history.filter((row) => row.event_type === 'prepared').length;
      const returnedCount = history.filter((row) => row.event_type === 'returned').length;
      const uniqueRentals = new Set(history.map((row) => row.rental_id).filter(Boolean)).size;
      const latest = history[0] || null;

      const lastPreparedAt = history
        .filter((row) => row.event_type === 'prepared' && row.event_at)
        .map((row) => row.event_at as string)
        .sort((a, b) => (toDate(b)?.getTime() || 0) - (toDate(a)?.getTime() || 0))[0] || null;

      const lastReturnedAt = history
        .filter((row) => row.event_type === 'returned' && row.event_at)
        .map((row) => row.event_at as string)
        .sort((a, b) => (toDate(b)?.getTime() || 0) - (toDate(a)?.getTime() || 0))[0] || null;

      const currentlyOutByHistory = Boolean(
        lastPreparedAt && (!lastReturnedAt || (toDate(lastPreparedAt)?.getTime() || 0) > (toDate(lastReturnedAt)?.getTime() || 0)),
      );
      const currentlyOut = unit.status === 'in_use' || currentlyOutByHistory;

      const serialNormalized = (unit.serial_number || '').trim().toLowerCase();
      let anomaly: string | null = null;

      if (unit.status === 'available' && currentlyOutByHistory) {
        anomaly = 'Sorti sans retour';
      } else if (unit.status === 'in_use' && !currentlyOutByHistory && returnedCount > 0) {
        anomaly = 'Statut en usage incohérent';
      }

      if (maintenanceBySerial.has(serialNormalized) && unit.status === 'in_use') {
        anomaly = anomaly ? `${anomaly} + maintenance` : 'En maintenance mais marqué en usage';
      }

      if (!unit.qr_code_value) {
        anomaly = anomaly ? `${anomaly} + QR manquant` : 'QR manquant';
      }

      return {
        unitId: unit.id,
        equipmentId: unit.equipment_id,
        equipmentName: equipment?.name || 'Matériel',
        category: [equipment?.type, equipment?.subtype].filter(Boolean).join(' / ') || '—',
        serialNumber: unit.serial_number || unit.id.slice(0, 8),
        status: unit.status || 'unknown',
        warehouseName: unit.warehouse_id ? (warehouseById.get(unit.warehouse_id) || unit.warehouse_id) : '—',
        hasQr: Boolean(unit.qr_code_value),
        lastScanAt: latest?.event_at || null,
        preparedCount,
        returnedCount,
        uniqueRentals,
        latestRentalId: latest?.rental_id || null,
        latestRentalRef: latest?.reference_code || latest?.rental_title || null,
        latestClient: latest?.client_name || null,
        currentlyOut,
        anomaly,
      };
    });
  }, [dataset.maintenance, dataset.unitHistory, dataset.units, equipmentById, warehouseById]);

  const typeOptions = useMemo(() => {
    return Array.from(new Set(equipmentReports.map((row) => row.category).filter(Boolean))).sort();
  }, [equipmentReports]);

  const filteredEquipment = useMemo(() => {
    const query = equipmentSearch.trim().toLowerCase();

    const rows = equipmentReports.filter((row) => {
      const matchType = typeFilter === 'all' || row.category === typeFilter;
      if (!matchType) return false;

      if (!query) return true;
      const haystack = `${row.equipmentName} ${row.category} ${row.inventoryCategory}`.toLowerCase();
      return haystack.includes(query);
    });

    rows.sort((a, b) => {
      switch (equipmentSort) {
        case 'rentals':
          return b.rentalEventsInPeriod - a.rentalEventsInPeriod;
        case 'utilization':
          return b.utilizationRate - a.utilizationRate;
        case 'maintenance':
          return b.maintenanceOpen - a.maintenanceOpen;
        case 'name':
        default:
          return a.equipmentName.localeCompare(b.equipmentName);
      }
    });

    return rows;
  }, [equipmentReports, equipmentSearch, typeFilter, equipmentSort]);

  const filteredUnits = useMemo(() => {
    const query = serialSearch.trim().toLowerCase();

    const rows = unitReports.filter((row) => {
      if (selectedEquipmentId !== 'all' && row.equipmentId !== selectedEquipmentId) {
        return false;
      }

      if (unitStatusFilter !== 'all') {
        if (unitStatusFilter === 'out' && !row.currentlyOut) return false;
        if (unitStatusFilter === 'anomaly' && !row.anomaly) return false;
        if (unitStatusFilter === 'no_qr' && row.hasQr) return false;
        if (
          unitStatusFilter !== 'out' &&
          unitStatusFilter !== 'anomaly' &&
          unitStatusFilter !== 'no_qr' &&
          row.status !== unitStatusFilter
        ) {
          return false;
        }
      }

      if (!query) return true;
      const haystack = `${row.serialNumber} ${row.equipmentName} ${row.category} ${row.warehouseName}`.toLowerCase();
      return haystack.includes(query);
    });

    rows.sort((a, b) => {
      const dateDiff = (toDate(b.lastScanAt)?.getTime() || 0) - (toDate(a.lastScanAt)?.getTime() || 0);
      if (dateDiff !== 0) return dateDiff;
      return a.serialNumber.localeCompare(b.serialNumber);
    });

    return rows;
  }, [unitReports, selectedEquipmentId, unitStatusFilter, serialSearch]);

  const displayedUnits = filteredUnits;

  const globalKpis = useMemo(() => {
    const totalModels = equipmentReports.length;
    const totalUnits = equipmentReports.reduce((sum, row) => sum + row.totalUnits, 0);
    const totalInUse = equipmentReports.reduce((sum, row) => sum + row.inUseUnits, 0);
    const totalMaintenance = equipmentReports.reduce((sum, row) => sum + row.maintenanceUnits, 0);
    const totalQrMissing = equipmentReports.reduce((sum, row) => sum + row.qrMissing, 0);
    const totalAnomalies = unitReports.filter((row) => Boolean(row.anomaly)).length;

    return {
      totalModels,
      totalUnits,
      totalInUse,
      totalMaintenance,
      totalQrMissing,
      totalAnomalies,
    };
  }, [equipmentReports, unitReports]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">
        Chargement du reporting matériel...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button
          type="button"
          onClick={() => {
            void loadReporting();
          }}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Recharger
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">Période d'analyse</span>
            <select
              value={windowDays}
              onChange={(event) => setWindowDays(Number(event.target.value))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value={30}>30 jours</option>
              <option value={90}>90 jours</option>
              <option value={180}>180 jours</option>
              <option value={365}>365 jours</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm lg:col-span-2">
            <span className="text-gray-600">Recherche matériel</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={equipmentSearch}
                onChange={(event) => setEquipmentSearch(event.target.value)}
                placeholder="Nom, type, catégorie..."
                className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">Tous</option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">Tri</span>
            <select
              value={equipmentSort}
              onChange={(event) => setEquipmentSort(event.target.value as 'rentals' | 'utilization' | 'maintenance' | 'name')}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="rentals">Plus utilisé</option>
              <option value="utilization">Taux d'usage</option>
              <option value="maintenance">Maintenance</option>
              <option value="name">Nom</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Modèles</p>
            <Package className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-xl font-semibold text-gray-900">{globalKpis.totalModels}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Unités totales</p>
            <Hash className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-xl font-semibold text-gray-900">{globalKpis.totalUnits}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">En usage</p>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-xl font-semibold text-gray-900">{globalKpis.totalInUse}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Maintenance</p>
            <Wrench className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-xl font-semibold text-gray-900">{globalKpis.totalMaintenance}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">QR manquants</p>
            <QrCode className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-2 text-xl font-semibold text-gray-900">{globalKpis.totalQrMissing}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Anomalies unités</p>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </div>
          <p className="mt-2 text-xl font-semibold text-gray-900">{globalKpis.totalAnomalies}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">Reporting précis par matériel</h3>
          <p className="mt-1 text-xs text-gray-500">
            Période: {windowDays} jours · {filteredEquipment.length} matériel(s)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Matériel</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Stock</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Usage</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Maintenance</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Prestas</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rotation</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Dernière sortie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredEquipment.map((row) => (
                <tr
                  key={row.equipmentId}
                  className={`hover:bg-gray-50 ${selectedEquipmentId === row.equipmentId ? 'bg-blue-50/40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">
                        <Link to={`/equipment/${row.equipmentId}`} className="hover:text-blue-700">
                          {row.equipmentName}
                        </Link>
                      </div>
                      <div className="text-xs text-gray-500">{row.category}</div>
                      <button
                        type="button"
                        onClick={() => setSelectedEquipmentId((prev) => (prev === row.equipmentId ? 'all' : row.equipmentId))}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {selectedEquipmentId === row.equipmentId ? 'Voir toutes les unités' : 'Filtrer les unités'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>{row.totalUnits} unité(s)</div>
                    <div className="text-xs text-gray-500">
                      Dispo {row.availableUnits} · QR manquant {row.qrMissing}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>{row.inUseUnits} en usage</div>
                    <div className="text-xs text-gray-500">Taux {row.utilizationRate}%</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>{row.maintenanceUnits} unité(s)</div>
                    <div className="text-xs text-gray-500">{row.maintenanceOpen} ticket(s) ouverts</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>{row.rentalsInPeriod} prestation(s)</div>
                    <div className="text-xs text-gray-500">{row.rentalEventsInPeriod} ligne(s) matériel</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>{row.rotationPerUnit}/unité</div>
                    <div className="text-xs text-gray-500">Durée moy. {row.avgRentalDurationDays} j</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatDateOnly(row.lastRentalAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">Reporting unitaire par numéro de série</h3>
          <p className="mt-1 text-xs text-gray-500">
            {filteredUnits.length} unité(s) trouvée(s)
          </p>
        </div>

        <div className="border-b border-gray-200 px-6 py-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600">Recherche série</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={serialSearch}
                  onChange={(event) => setSerialSearch(event.target.value)}
                  placeholder="Série, matériel, entrepôt..."
                  className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600">Filtre matériel</span>
              <select
                value={selectedEquipmentId}
                onChange={(event) => setSelectedEquipmentId(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">Tous les matériels</option>
                {equipmentReports.map((row) => (
                  <option key={row.equipmentId} value={row.equipmentId}>
                    {row.equipmentName}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600">Statut unité</span>
              <select
                value={unitStatusFilter}
                onChange={(event) => setUnitStatusFilter(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">Tous</option>
                <option value="available">Disponible</option>
                <option value="in_use">En usage</option>
                <option value="maintenance">Maintenance</option>
                <option value="broken">HS</option>
                <option value="out">Sorti actuellement</option>
                <option value="anomaly">Anomalies</option>
                <option value="no_qr">Sans QR</option>
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  void loadReporting();
                }}
                className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Recalculer le reporting
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Numéro de série</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Matériel</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Entrepôt</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Historique scans</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Dernière presta</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Alerte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {displayedUnits.map((row) => (
                <tr key={row.unitId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-gray-900">{row.serialNumber}</div>
                    <div className="mt-1 text-xs text-gray-500">{row.hasQr ? 'QR OK' : 'QR manquant'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/equipment/${row.equipmentId}`} className="text-sm font-medium text-gray-900 hover:text-blue-700">
                      {row.equipmentName}
                    </Link>
                    <div className="text-xs text-gray-500">{row.category}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${unitStatusClass(row.status)}`}>
                      {formatStatus(row.status)}
                    </span>
                    {row.currentlyOut && (
                      <div className="mt-1 text-xs font-medium text-blue-700">Sorti actuellement</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.warehouseName}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>Prépa {row.preparedCount} · Retour {row.returnedCount}</div>
                    <div className="text-xs text-gray-500">{row.uniqueRentals} presta(s) unique(s)</div>
                    <div className="text-xs text-gray-500">Dernier scan: {formatDateTime(row.lastScanAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.latestRentalId ? (
                      <Link to={`/rentals/${row.latestRentalId}`} className="text-blue-700 hover:text-blue-800">
                        {row.latestRentalRef || row.latestRentalId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span>—</span>
                    )}
                    <div className="text-xs text-gray-500">{row.latestClient || 'Client —'}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {row.anomaly ? (
                      <span className="inline-flex rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                        {row.anomaly}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Aucune</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EquipmentTab;
