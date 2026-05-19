import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronDown, ChevronRight, Loader2, QrCode, X } from 'lucide-react';
import EmptyTableRow from '../common/EmptyTableRow';
import { useTranslation } from '../../context/TranslationContext';
import { supabase } from '../../lib/supabase';
import { StatusBadge, type BadgeTone, type BadgeVariant } from '../ui-kit';

interface StockUnit {
  id: string;
  serial_number: string | null;
  status: string | null;
  internal_location?: string | null;
  internal_location_override?: boolean;
  custom_status_id?: string | null;
  qr_code_value?: string | null;
  qr_code_url?: string | null;
  qr_code_generated_at?: string | null;
}

interface StockEntry {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  units: StockUnit[];
}

interface EquipmentStockTableProps {
  stocks: StockEntry[];
  maintenanceCount?: number;
  inventoryCategory?: 'series' | 'vrac' | 'consommable';
  customStatuses?: Array<{ id: string; name: string; color: string }>;
  equipmentCustomStatusId?: string | null;
}

interface UnitOperationalStateRow {
  equipment_unit_id: string;
  operational_status: string;
  pending_return_validation: boolean;
  delayed_return: boolean;
  has_invalid_reservation: boolean;
  reservation_conflict_count: number;
  current_rental_id: string | null;
  current_rental_reference_code: string | null;
  pending_rental_id: string | null;
  pending_rental_reference_code: string | null;
  open_maintenance_count: number;
  scan_error_count: number;
  last_scan_error_at: string | null;
  last_scan_error_result: string | null;
  last_scan_error_message: string | null;
}

interface UnitRentalHistoryRow {
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
}

interface UnitMaintenanceHistoryRow {
  id: string;
  equipment_unit_id: string;
  maintenance_type: string;
  status: string;
  issue_description: string | null;
  action_taken: string | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_cost: number;
  currency: string | null;
  downtime_minutes: number;
}

interface UnitScanErrorRow {
  id: string;
  equipment_unit_id: string;
  scan_stage: string;
  rental_id: string | null;
  scan_result: string;
  error_message: string | null;
  scanned_at: string;
  forced: boolean;
  counted: boolean;
}

type UnitStatusMeta = {
  label: string;
  badgeTone: BadgeTone;
  badgeVariant?: BadgeVariant;
};

type StockUnitWithWarehouse = StockUnit & {
  warehouse_id: string;
  warehouse_name: string;
};

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const toBoolean = (value: unknown): boolean => value === true;

const toNumberOrZero = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toBadgeStyle = (hexColor: string) => ({
  backgroundColor: `${hexColor}1A`,
  borderColor: `${hexColor}66`,
  color: hexColor,
});

const EquipmentStockTable: React.FC<EquipmentStockTableProps> = ({
  stocks,
  maintenanceCount = 0,
  inventoryCategory = 'series',
  customStatuses = [],
  equipmentCustomStatusId = null,
}) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const isSerialTracked = inventoryCategory === 'series';
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [selectedUnitId, setSelectedUnitId] = React.useState<string | null>(null);
  const [unitOperationalById, setUnitOperationalById] = React.useState<Record<string, UnitOperationalStateRow>>({});
  const [unitRentalHistoryById, setUnitRentalHistoryById] = React.useState<Record<string, UnitRentalHistoryRow[]>>({});
  const [unitMaintenanceById, setUnitMaintenanceById] = React.useState<Record<string, UnitMaintenanceHistoryRow[]>>({});
  const [unitScanErrorsById, setUnitScanErrorsById] = React.useState<Record<string, UnitScanErrorRow[]>>({});

  const statusMeta = useMemo<Record<string, UnitStatusMeta>>(() => {
    if (language === 'en') {
      return {
        available: { label: 'Available', badgeTone: 'emerald' },
        reserved: { label: 'Reserved', badgeTone: 'blue' },
        in_rental: { label: 'In Rental', badgeTone: 'amber' },
        delayed_return: { label: 'Late Return', badgeTone: 'red' },
        maintenance: { label: 'Maintenance', badgeTone: 'orange' },
        broken: { label: 'Broken', badgeTone: 'rose' },
      };
    }
    return {
      available: { label: 'Disponible', badgeTone: 'emerald' },
      reserved: { label: 'Réservé', badgeTone: 'blue' },
      in_rental: { label: 'En presta', badgeTone: 'amber' },
      delayed_return: { label: 'Retour en retard', badgeTone: 'red' },
      maintenance: { label: 'En maintenance', badgeTone: 'orange' },
      broken: { label: 'HS', badgeTone: 'rose' },
    };
  }, [language]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const defaultCurrencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }),
    [locale],
  );
  const customStatusMap = useMemo(
    () => new Map(customStatuses.map((status) => [status.id, status] as const)),
    [customStatuses],
  );
  const equipmentCustomStatus = equipmentCustomStatusId ? (customStatusMap.get(equipmentCustomStatusId) || null) : null;

  const unitIds = useMemo(() => {
    const ids: string[] = [];
    stocks.forEach((stock) => {
      stock.units.forEach((unit) => {
        if (unit.id) ids.push(unit.id);
      });
    });
    return ids;
  }, [stocks]);
  const unitIdsKey = useMemo(() => unitIds.join(','), [unitIds]);

  const unitLookup = useMemo(() => {
    const map = new Map<string, StockUnitWithWarehouse>();
    stocks.forEach((stock) => {
      stock.units.forEach((unit) => {
        map.set(unit.id, {
          ...unit,
          warehouse_id: stock.warehouse_id,
          warehouse_name: stock.warehouse_name,
        });
      });
    });
    return map;
  }, [stocks]);

  const toggleRow = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const resolveStatus = React.useCallback((unit: StockUnit) => {
    const customStatus = unit.custom_status_id ? (customStatusMap.get(unit.custom_status_id) || null) : null;
    if (customStatus) {
      return {
        key: `custom:${customStatus.id}`,
        label: customStatus.name,
        badgeTone: 'gray' as BadgeTone,
        badgeVariant: 'outline' as BadgeVariant,
        badgeStyle: toBadgeStyle(customStatus.color),
        live: unitOperationalById[unit.id],
      };
    }

    const live = unitOperationalById[unit.id];
    const fallbackRaw = (unit.status || '').toLowerCase();
    const fallbackStatus = fallbackRaw === 'in_use' ? 'in_rental' : fallbackRaw;
    const key = (live?.operational_status || fallbackStatus || 'available').toLowerCase();
    const meta = statusMeta[key] || statusMeta.available;
    return {
      key,
      label: meta.label,
      badgeTone: meta.badgeTone,
      badgeVariant: meta.badgeVariant,
      badgeStyle: undefined,
      live,
    };
  }, [customStatusMap, statusMeta, unitOperationalById]);

  const getSignalText = React.useCallback((unitId: string) => {
    const live = unitOperationalById[unitId];
    if (!live) return [];
    const signals: string[] = [];
    if (live.pending_return_validation) signals.push(language === 'en' ? 'Return to validate' : 'Retour à valider');
    if (live.delayed_return) signals.push(language === 'en' ? 'Late return' : 'Retour en retard');
    if (live.open_maintenance_count > 0) {
      signals.push(
        language === 'en'
          ? `${live.open_maintenance_count} open maintenance`
          : `${live.open_maintenance_count} maintenance en cours`,
      );
    }
    if (live.has_invalid_reservation) signals.push(language === 'en' ? 'Invalid reservation' : 'Réservation invalide');
    if (live.reservation_conflict_count > 0) {
      signals.push(
        language === 'en'
          ? `${live.reservation_conflict_count} reservation conflict(s)`
          : `${live.reservation_conflict_count} conflit(s) de réservation`,
      );
    }
    if (live.scan_error_count > 0) {
      signals.push(
        language === 'en'
          ? `${live.scan_error_count} scan error(s)`
          : `${live.scan_error_count} erreur(s) de scan`,
      );
    }
    return signals;
  }, [language, unitOperationalById]);

  const formatCurrencyAmount = React.useCallback((value: number, currency: string | null) => {
    const iso = currency && currency.length === 3 ? currency.toUpperCase() : 'EUR';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: iso,
      }).format(value);
    } catch {
      return defaultCurrencyFormatter.format(value);
    }
  }, [defaultCurrencyFormatter, locale]);

  React.useEffect(() => {
    if (!selectedUnitId) return;
    if (!unitLookup.has(selectedUnitId)) {
      setSelectedUnitId(null);
    }
  }, [selectedUnitId, unitLookup]);

  React.useEffect(() => {
    if (!isSerialTracked || unitIds.length === 0) {
      setUnitOperationalById({});
      setUnitRentalHistoryById({});
      setUnitMaintenanceById({});
      setUnitScanErrorsById({});
      return;
    }

    let cancelled = false;

    const loadOperationalData = async () => {
      try {
        setDetailsLoading(true);
        const sb: any = supabase;
        const [operationalResult, rentalResult, maintenanceResult, scanErrorResult] = await Promise.all([
          sb
            .from('equipment_unit_operational_status')
            .select(
              [
                'equipment_unit_id',
                'operational_status',
                'pending_return_validation',
                'delayed_return',
                'has_invalid_reservation',
                'reservation_conflict_count',
                'current_rental_id',
                'current_rental_reference_code',
                'pending_rental_id',
                'pending_rental_reference_code',
                'open_maintenance_count',
                'scan_error_count',
                'last_scan_error_at',
                'last_scan_error_result',
                'last_scan_error_message',
              ].join(','),
            )
            .in('equipment_unit_id', unitIds),
          sb
            .from('equipment_unit_rental_history')
            .select('source_id, equipment_unit_id, rental_id, reference_code, rental_title, client_name, event_type, event_at, scan_result, forced')
            .in('equipment_unit_id', unitIds)
            .order('event_at', { ascending: false }),
          sb
            .from('equipment_unit_maintenance_history')
            .select(
              [
                'id',
                'equipment_unit_id',
                'maintenance_type',
                'status',
                'issue_description',
                'action_taken',
                'due_at',
                'started_at',
                'completed_at',
                'total_cost',
                'currency',
                'downtime_minutes',
              ].join(','),
            )
            .in('equipment_unit_id', unitIds)
            .order('started_at', { ascending: false }),
          sb
            .from('equipment_unit_scan_errors')
            .select('id, equipment_unit_id, scan_stage, rental_id, scan_result, error_message, scanned_at, forced, counted')
            .in('equipment_unit_id', unitIds)
            .order('scanned_at', { ascending: false }),
        ]);

        if (operationalResult.error) throw operationalResult.error;
        if (rentalResult.error) throw rentalResult.error;
        if (maintenanceResult.error) throw maintenanceResult.error;
        if (scanErrorResult.error) throw scanErrorResult.error;

        if (cancelled) return;

        const operationalById: Record<string, UnitOperationalStateRow> = {};
        (operationalResult.data || []).forEach((row: Record<string, unknown>) => {
          const unitId = toStringOrNull(row.equipment_unit_id);
          if (!unitId) return;
          operationalById[unitId] = {
            equipment_unit_id: unitId,
            operational_status: toStringOrNull(row.operational_status) || 'available',
            pending_return_validation: toBoolean(row.pending_return_validation),
            delayed_return: toBoolean(row.delayed_return),
            has_invalid_reservation: toBoolean(row.has_invalid_reservation),
            reservation_conflict_count: toNumberOrZero(row.reservation_conflict_count),
            current_rental_id: toStringOrNull(row.current_rental_id),
            current_rental_reference_code: toStringOrNull(row.current_rental_reference_code),
            pending_rental_id: toStringOrNull(row.pending_rental_id),
            pending_rental_reference_code: toStringOrNull(row.pending_rental_reference_code),
            open_maintenance_count: toNumberOrZero(row.open_maintenance_count),
            scan_error_count: toNumberOrZero(row.scan_error_count),
            last_scan_error_at: toStringOrNull(row.last_scan_error_at),
            last_scan_error_result: toStringOrNull(row.last_scan_error_result),
            last_scan_error_message: toStringOrNull(row.last_scan_error_message),
          };
        });

        const rentalByUnit: Record<string, UnitRentalHistoryRow[]> = {};
        (rentalResult.data || []).forEach((row: Record<string, unknown>) => {
          const unitId = toStringOrNull(row.equipment_unit_id);
          if (!unitId) return;
          if (!rentalByUnit[unitId]) rentalByUnit[unitId] = [];
          rentalByUnit[unitId].push({
            source_id: toStringOrNull(row.source_id) || `${unitId}-${rentalByUnit[unitId].length}`,
            equipment_unit_id: unitId,
            rental_id: toStringOrNull(row.rental_id),
            reference_code: toStringOrNull(row.reference_code),
            rental_title: toStringOrNull(row.rental_title),
            client_name: toStringOrNull(row.client_name),
            event_type: toStringOrNull(row.event_type) || 'event',
            event_at: toStringOrNull(row.event_at) || new Date().toISOString(),
            scan_result: toStringOrNull(row.scan_result) || 'unknown',
            forced: toBoolean(row.forced),
          });
        });

        const maintenanceByUnit: Record<string, UnitMaintenanceHistoryRow[]> = {};
        (maintenanceResult.data || []).forEach((row: Record<string, unknown>) => {
          const unitId = toStringOrNull(row.equipment_unit_id);
          if (!unitId) return;
          if (!maintenanceByUnit[unitId]) maintenanceByUnit[unitId] = [];
          maintenanceByUnit[unitId].push({
            id: toStringOrNull(row.id) || `${unitId}-${maintenanceByUnit[unitId].length}`,
            equipment_unit_id: unitId,
            maintenance_type: toStringOrNull(row.maintenance_type) || 'other',
            status: toStringOrNull(row.status) || 'scheduled',
            issue_description: toStringOrNull(row.issue_description),
            action_taken: toStringOrNull(row.action_taken),
            due_at: toStringOrNull(row.due_at),
            started_at: toStringOrNull(row.started_at),
            completed_at: toStringOrNull(row.completed_at),
            total_cost: toNumberOrZero(row.total_cost),
            currency: toStringOrNull(row.currency),
            downtime_minutes: toNumberOrZero(row.downtime_minutes),
          });
        });

        const scanErrorsByUnit: Record<string, UnitScanErrorRow[]> = {};
        (scanErrorResult.data || []).forEach((row: Record<string, unknown>) => {
          const unitId = toStringOrNull(row.equipment_unit_id);
          if (!unitId) return;
          if (!scanErrorsByUnit[unitId]) scanErrorsByUnit[unitId] = [];
          scanErrorsByUnit[unitId].push({
            id: toStringOrNull(row.id) || `${unitId}-${scanErrorsByUnit[unitId].length}`,
            equipment_unit_id: unitId,
            scan_stage: toStringOrNull(row.scan_stage) || 'return',
            rental_id: toStringOrNull(row.rental_id),
            scan_result: toStringOrNull(row.scan_result) || 'unknown_code',
            error_message: toStringOrNull(row.error_message),
            scanned_at: toStringOrNull(row.scanned_at) || new Date().toISOString(),
            forced: toBoolean(row.forced),
            counted: toBoolean(row.counted),
          });
        });

        setUnitOperationalById(operationalById);
        setUnitRentalHistoryById(rentalByUnit);
        setUnitMaintenanceById(maintenanceByUnit);
        setUnitScanErrorsById(scanErrorsByUnit);
      } catch (error) {
        console.error('Error loading serial operational details', error);
        if (cancelled) return;
        setUnitOperationalById({});
        setUnitRentalHistoryById({});
        setUnitMaintenanceById({});
        setUnitScanErrorsById({});
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    };

    void loadOperationalData();
    return () => {
      cancelled = true;
    };
  }, [isSerialTracked, unitIds, unitIdsKey]);

  const selectedUnit = selectedUnitId ? (unitLookup.get(selectedUnitId) || null) : null;
  const selectedStatus = selectedUnit ? resolveStatus(selectedUnit) : null;
  const selectedSignals = selectedUnit ? getSignalText(selectedUnit.id) : [];
  const selectedLive = selectedUnit ? unitOperationalById[selectedUnit.id] : null;
  const selectedRentals = selectedUnit ? (unitRentalHistoryById[selectedUnit.id] || []).slice(0, 3) : [];
  const selectedMaintenance = selectedUnit ? (unitMaintenanceById[selectedUnit.id] || []) : [];
  const selectedScanErrors = selectedUnit ? (unitScanErrorsById[selectedUnit.id] || []) : [];

  const getMaintenanceStatusLabel = React.useCallback((status: string) => {
    if (language === 'en') {
      if (status === 'in_progress') return 'In progress';
      if (status === 'completed') return 'Completed';
      if (status === 'cancelled') return 'Cancelled';
      return 'Scheduled';
    }
    if (status === 'in_progress') return 'En cours';
    if (status === 'completed') return 'Terminée';
    if (status === 'cancelled') return 'Annulée';
    return 'Planifiée';
  }, [language]);

  const formatEventType = React.useCallback((eventType: string) => {
    if (language === 'en') {
      if (eventType === 'prepared') return 'Prepared';
      if (eventType === 'returned') return 'Returned';
      return eventType || 'Event';
    }
    if (eventType === 'prepared') return 'Préparation';
    if (eventType === 'returned') return 'Retour';
    return eventType || 'Événement';
  }, [language]);

  const formatMaintenanceType = React.useCallback((maintenanceType: string) => {
    const normalized = maintenanceType.toLowerCase();
    if (language === 'en') {
      if (normalized === 'preventive') return 'Preventive';
      if (normalized === 'corrective') return 'Corrective';
      if (normalized === 'inspection') return 'Inspection';
      if (normalized === 'repair') return 'Repair';
      if (normalized === 'calibration') return 'Calibration';
      return 'Other';
    }
    if (normalized === 'preventive') return 'Préventive';
    if (normalized === 'corrective') return 'Corrective';
    if (normalized === 'inspection') return 'Inspection';
    if (normalized === 'repair') return 'Réparation';
    if (normalized === 'calibration') return 'Calibration';
    return 'Autre';
  }, [language]);

  const closeDetails = () => {
    setSelectedUnitId(null);
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Package className="h-5 w-5 mr-2" />
          {t('equipment.detail.stock.distribution.title')}
          {isSerialTracked && detailsLoading && (
            <span className="ml-3 inline-flex items-center text-xs font-medium text-gray-500">
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              {language === 'en' ? 'Loading serial details...' : 'Chargement des détails série...'}
            </span>
          )}
        </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('equipment.detail.stock.distribution.columns.warehouse')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('equipment.detail.stock.distribution.columns.quantity')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isSerialTracked
                    ? t('equipment.detail.stock.serials.columns.details')
                    : t('equipment.detail.stock.serials.columns.info')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stocks.length === 0 && (
                <EmptyTableRow colSpan={4} message={t('equipment.detail.stock.table.empty')} />
              )}
              {stocks.map((stock) => {
                const isExpanded = !!expanded[stock.warehouse_id];
                const allowDetails = isSerialTracked && stock.units.length > 0;
                return (
                  <React.Fragment key={stock.warehouse_id}>
                    <tr className={isExpanded ? 'bg-orange-50/40' : undefined}>
                      <td className="px-4 py-2 text-sm">
                        {allowDetails ? (
                          <button
                            type="button"
                            onClick={() => toggleRow(stock.warehouse_id)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 hover:bg-gray-100 text-gray-600"
                            title={isExpanded
                              ? t('equipment.detail.stock.serials.toggle.hide')
                              : t('equipment.detail.stock.serials.toggle.show')}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-300">•</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {stock.warehouse_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {numberFormatter.format(stock.quantity)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {isSerialTracked ? (
                          <span>
                            {language === 'en'
                              ? `${stock.units.length} serial unit(s). Click a line for full history.`
                              : `${stock.units.length} unité(s) série. Clique une ligne pour l'historique complet.`}
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{t('equipment.detail.stock.distribution.globalHint')}</span>
                            {equipmentCustomStatus ? (
                              <StatusBadge
                                tone="gray"
                                variant="outline"
                                className="font-semibold"
                                style={toBadgeStyle(equipmentCustomStatus.color)}
                              >
                                {equipmentCustomStatus.name}
                              </StatusBadge>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                    {allowDetails && isExpanded && (
                      <tr className="bg-orange-50/30">
                        <td colSpan={4} className="px-6 py-4">
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              {t('equipment.detail.stock.serials.listTitle', { count: stock.units.length })}
                            </h4>
                            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                              <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                      {language === 'en' ? 'Serial' : 'Numéro de série'}
                                    </th>
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                      {language === 'en' ? 'Location' : 'Emplacement'}
                                    </th>
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                      {language === 'en' ? 'Status' : 'Statut'}
                                    </th>
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                      {language === 'en' ? 'Signals' : 'Signaux'}
                                    </th>
                                    <th className="px-3 py-2" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {stock.units.map((unit) => {
                                    const status = resolveStatus(unit);
                                    const signals = getSignalText(unit.id);
                                    return (
                                      <tr
                                        key={unit.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedUnitId(unit.id)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setSelectedUnitId(unit.id);
                                          }
                                        }}
                                        className="cursor-pointer hover:bg-orange-50/50 focus:outline-none focus:bg-orange-50/70"
                                      >
                                        <td className="px-3 py-2 text-sm font-medium text-gray-900">
                                          {unit.serial_number || t('equipment.detail.stock.serials.unknown')}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-600">
                                          {unit.internal_location?.trim() || '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                          <StatusBadge
                                            tone={status.badgeTone}
                                            variant={status.badgeVariant}
                                            className="font-semibold"
                                            style={status.badgeStyle}
                                          >
                                            {status.label}
                                          </StatusBadge>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-600">
                                          {signals.length ? signals.join(' · ') : (language === 'en' ? 'No active signal' : 'Aucun signal actif')}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-400">
                                          <ChevronRight className="h-4 w-4 inline-block" />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {stocks.length > 0 && (
                <tr className="bg-gray-50 font-medium">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colSpan={2}>
                    {t('equipment.detail.stock.distribution.totalRow')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {numberFormatter.format(stocks.reduce((sum, stock) => sum + stock.quantity, 0))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {isSerialTracked && maintenanceCount > 0
                      ? t('equipment.detail.stock.distribution.maintenanceCount', { count: maintenanceCount })
                      : '-'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUnit && selectedStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetails} />
          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl max-h-[92vh]">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedUnit.serial_number || t('equipment.detail.stock.serials.unknown')}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {selectedUnit.warehouse_name}
                </p>
                <div className="mt-2">
                  <StatusBadge
                    tone={selectedStatus.badgeTone}
                    variant={selectedStatus.badgeVariant}
                    className="font-semibold"
                    style={selectedStatus.badgeStyle}
                  >
                    {selectedStatus.label}
                  </StatusBadge>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetails}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
                aria-label={language === 'en' ? 'Close' : 'Fermer'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <section className="rounded-md border border-gray-200 p-3">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {language === 'en' ? 'Last 3 Rental Events' : '3 dernières presta envoyées'}
                    </h4>
                    {selectedRentals.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        {language === 'en'
                          ? 'No preparation/return scan recorded for this serial.'
                          : 'Aucun scan de préparation/retour enregistré pour ce numéro.'}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {selectedRentals.map((event) => (
                          <li key={event.source_id} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-gray-900">{formatEventType(event.event_type)}</p>
                              <p className="text-[11px] text-gray-500">{new Date(event.event_at).toLocaleString(locale)}</p>
                            </div>
                            <p className="mt-1 text-xs text-gray-700">
                              {(event.reference_code || event.rental_title || (language === 'en' ? 'Rental' : 'Prestation'))}
                              {event.client_name ? ` · ${event.client_name}` : ''}
                            </p>
                            <div className="mt-1 flex items-center justify-between">
                              <p className="text-[11px] text-gray-600">{event.scan_result}</p>
                              {event.rental_id ? (
                                <Link to={`/rentals/${event.rental_id}`} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
                                  {language === 'en' ? 'Open rental' : 'Ouvrir la presta'}
                                </Link>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-md border border-gray-200 p-3">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {language === 'en' ? 'Maintenance History' : 'Historique maintenance'}
                    </h4>
                    {selectedMaintenance.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        {language === 'en' ? 'No maintenance history for this serial.' : 'Aucune maintenance enregistrée pour ce numéro.'}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {selectedMaintenance.map((item) => (
                          <li key={item.id} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-gray-900">
                                {formatMaintenanceType(item.maintenance_type)} · {getMaintenanceStatusLabel(item.status)}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {item.started_at ? new Date(item.started_at).toLocaleString(locale) : '—'}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-gray-700">
                              {item.issue_description || item.action_taken || (language === 'en' ? 'No details' : 'Pas de détail')}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
                              <span>
                                {language === 'en' ? 'Downtime' : 'Immobilisation'}: {Math.max(0, Math.round(item.downtime_minutes / 60))}h
                              </span>
                              <span>
                                {language === 'en' ? 'Cost' : 'Coût'}: {formatCurrencyAmount(item.total_cost, item.currency)}
                              </span>
                              {item.due_at ? (
                                <span>
                                  {language === 'en' ? 'Due' : 'Échéance'}: {new Date(item.due_at).toLocaleDateString(locale)}
                                </span>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-md border border-gray-200 p-3">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {language === 'en' ? 'Scan Errors & Exceptions' : 'Erreurs et exceptions de scan'}
                    </h4>
                    {selectedScanErrors.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        {language === 'en' ? 'No scan exception for this serial.' : 'Aucune erreur de scan pour ce numéro.'}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {selectedScanErrors.map((errorItem) => (
                          <li key={errorItem.id} className="rounded border border-red-100 bg-red-50 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-red-700">
                                {errorItem.scan_stage === 'return'
                                  ? (language === 'en' ? 'Return scan' : 'Scan retour')
                                  : (language === 'en' ? 'Preparation scan' : 'Scan préparation')}
                                {' · '}
                                {errorItem.scan_result}
                              </p>
                              <p className="text-[11px] text-red-500">
                                {new Date(errorItem.scanned_at).toLocaleString(locale)}
                              </p>
                            </div>
                            {errorItem.error_message ? (
                              <p className="mt-1 text-xs text-red-700">{errorItem.error_message}</p>
                            ) : null}
                            <div className="mt-1 text-[11px] text-red-600">
                              {errorItem.forced ? (language === 'en' ? 'Forced scan' : 'Scan forcé') : (language === 'en' ? 'Not counted' : 'Non comptabilisé')}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                <div className="space-y-4">
                  <section className="rounded-md border border-gray-200 p-3 flex items-center justify-center">
                    {selectedUnit.qr_code_url ? (
                      <img
                        src={selectedUnit.qr_code_url}
                        alt={`QR ${selectedUnit.serial_number || selectedUnit.id}`}
                        className="w-full max-w-[250px] rounded-md border border-gray-200 bg-white p-2"
                      />
                    ) : (
                      <div className="flex w-full max-w-[250px] aspect-square items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50">
                        <QrCode className="h-12 w-12 text-gray-300" />
                      </div>
                    )}
                  </section>

                  <section className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {language === 'en' ? 'Equipment Info' : 'Infos matériel'}
                    </h4>
                    <div className="mt-2 space-y-2 text-xs text-gray-700">
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Serial:' : 'Numéro:'} </span>
                        {selectedUnit.serial_number || t('equipment.detail.stock.serials.unknown')}
                      </p>
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Warehouse:' : 'Entrepôt:'} </span>
                        {selectedUnit.warehouse_name}
                      </p>
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Location:' : 'Emplacement:'} </span>
                        {selectedUnit.internal_location?.trim() || '—'}
                      </p>
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Mode:' : 'Mode:'} </span>
                        {selectedUnit.internal_location_override
                          ? (language === 'en' ? 'Custom unit location' : 'Emplacement unitaire personnalisé')
                          : (language === 'en' ? 'Inherited from equipment' : 'Hérité du matériel')}
                      </p>
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Status:' : 'Statut:'} </span>
                        {selectedStatus.label}
                      </p>
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Current rental:' : 'Presta en cours :'} </span>
                        {selectedLive?.current_rental_reference_code || selectedLive?.pending_rental_reference_code || '—'}
                      </p>
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Maintenance open:' : 'Maintenance en cours :'} </span>
                        {selectedLive?.open_maintenance_count ?? 0}
                      </p>
                      <p>
                        <span className="font-semibold">{language === 'en' ? 'Scan errors:' : 'Erreurs scan :'} </span>
                        {selectedLive?.scan_error_count ?? 0}
                      </p>
                    </div>
                    {selectedSignals.length > 0 && (
                      <p className="mt-3 text-xs text-amber-700">
                        {selectedSignals.join(' · ')}
                      </p>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EquipmentStockTable;
