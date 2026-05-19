import React, { useMemo, useState } from 'react';
import { addDays, startOfWeek, format, parseISO } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import type { Equipment } from '../../types/equipment';
import { DAY_LABEL_FORMAT } from '../personnel/ganttUtils';
import { useTranslation } from '../../context/TranslationContext';

interface AggregatedReservation {
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
}

interface UnitReservation {
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
}

interface EquipmentUnitInfo {
  id: string;
  serial_number: string | null;
  status: string | null;
  warehouse_id?: string | null;
}

interface EquipmentReservationGanttProps {
  equipmentName: string;
  inventoryCategory: Equipment['inventory_category'];
  aggregatedReservations: AggregatedReservation[];
  unitReservations: UnitReservation[];
  units: EquipmentUnitInfo[];
  loading: boolean;
  unitLoading: boolean;
}

const statusColor = (status: string) => {
  switch ((status || '').toLowerCase()) {
    case 'confirmed':
    case 'in_progress':
      return 'bg-blue-500/80 border-blue-600 text-white';
    case 'pending':
      return 'bg-yellow-400/80 border-yellow-500 text-gray-900';
    case 'completed':
      return 'bg-gray-300/80 border-gray-400 text-gray-800';
    case 'cancelled':
      return 'bg-red-500/80 border-red-600 text-white';
    default:
      return 'bg-slate-500/80 border-slate-600 text-white';
  }
};

const EquipmentReservationGantt: React.FC<EquipmentReservationGanttProps> = ({
  equipmentName,
  inventoryCategory,
  aggregatedReservations,
  unitReservations,
  units,
  loading,
  unitLoading,
}) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? enUS : fr;
  const [range, setRange] = useState<14 | 30 | 60>(30);
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [showUnits, setShowUnits] = useState(false);

  const timelineStart = useMemo(
    () => startOfWeek(referenceDate, { weekStartsOn: 1 }),
    [referenceDate]
  );
  const timelineEnd = useMemo(() => addDays(timelineStart, range), [timelineStart, range]);
  const timelineDuration = timelineEnd.getTime() - timelineStart.getTime();
  const timelineDays = useMemo(
    () => Array.from({ length: range }, (_, i) => addDays(timelineStart, i)),
    [timelineStart, range]
  );

  const aggregatedEvents = useMemo(
    () => aggregatedReservations.filter((entry) => entry.startDate && entry.endDate),
    [aggregatedReservations]
  );

  const unitEntries = useMemo(() => {
    const base = (units || []).map((unit, index) => ({
      unitId: unit.id,
      serialNumber: unit.serial_number,
      status: unit.status,
      index,
      reservations: [] as UnitReservation[],
    }));
    const byId = new Map(base.map((entry) => [entry.unitId, entry]));
    const extras: typeof base = [];

    (unitReservations || []).forEach((reservation) => {
      let target = byId.get(reservation.unitId);
      if (!target) {
        target = {
          unitId: reservation.unitId,
          serialNumber: reservation.serialNumber || null,
          status: null,
          index: base.length + extras.length,
          reservations: [],
        };
        byId.set(reservation.unitId, target);
        extras.push(target);
      }
      target.reservations.push(reservation);
    });

    base.concat(extras).forEach((entry) => {
      entry.reservations.sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
    });

    return base.concat(extras);
  }, [units, unitReservations]);

  const displayUnitEntries = unitEntries;

  const renderBar = (
    key: string,
    startDate: string,
    endDate: string,
    label: string,
    status: string,
    extraLine?: string
  ) => {
    if (!timelineDuration) return null;
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;

    const clippedStart = start < timelineStart ? timelineStart : start;
    const clippedEnd = end > timelineEnd ? timelineEnd : end;
    if (clippedEnd <= clippedStart) return null;

    const left =
      ((clippedStart.getTime() - timelineStart.getTime()) / timelineDuration) * 100;
    const width = Math.max(
      1.5,
      ((clippedEnd.getTime() - clippedStart.getTime()) / timelineDuration) * 100
    );
    const baseClass = statusColor(status);

    return (
      <div
        key={key}
        className={`absolute top-1 h-8 border shadow-sm rounded-md px-2 flex items-center text-[11px] leading-tight ${baseClass}`}
        style={{ left: `${left}%`, width: `${width}%`, minWidth: '48px' }}
        title={`${label}\n${format(start, 'dd/MM HH:mm', { locale })} → ${format(end, 'dd/MM HH:mm', { locale })}${
          extraLine ? `\n${extraLine}` : ''
        }`}
      >
        <span className="truncate">{label}</span>
      </div>
    );
  };

  const hasUnitReservations = useMemo(
    () => displayUnitEntries.some((entry) => entry.reservations.length > 0),
    [displayUnitEntries]
  );

  const hasData =
    aggregatedEvents.length > 0 || (inventoryCategory === 'series' && hasUnitReservations);

  return (
    <div className="mt-10 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{t('equipment.gantt.title')}</h3>
          <p className="text-sm text-gray-500">
            {t('equipment.gantt.subtitle', { name: equipmentName })}
          </p>
        </div>
        <div />
      </div>

      <div className="border border-gray-200 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReferenceDate(addDays(referenceDate, -range))}
              className="rounded-full border border-gray-200 p-1.5 hover:bg-gray-100"
              aria-label={t('equipment.gantt.controls.previous')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-gray-800">
              {format(timelineStart, 'dd MMM yyyy', { locale })} –{' '}
              {format(addDays(timelineEnd, -1), 'dd MMM yyyy', { locale })}
            </div>
            <button
              onClick={() => setReferenceDate(addDays(referenceDate, range))}
              className="rounded-full border border-gray-200 p-1.5 hover:bg-gray-100"
              aria-label={t('equipment.gantt.controls.next')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('equipment.gantt.duration.label')}
              </label>
              <select
                value={range}
                onChange={(e) => setRange(Number(e.target.value) as 14 | 30 | 60)}
                className="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value={14}>{t('equipment.gantt.duration.optionWeeks', { count: 2 })}</option>
                <option value={30}>{t('equipment.gantt.duration.optionMonths', { count: 1 })}</option>
                <option value={60}>{t('equipment.gantt.duration.optionMonths', { count: 2 })}</option>
              </select>
            </div>
          </div>

          {(loading || (showUnits && unitLoading)) && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="h-4 w-4 border-2 border-blue-500 border-b-transparent rounded-full animate-spin" />
              {t('common.loading')}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[780px]">
            <div className="grid grid-cols-[180px_1fr] border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <div className="px-4 py-2">{t('equipment.gantt.headers.resource')}</div>
              <div className="px-4 py-2">
                <div className="flex">
                  {timelineDays.map((day, idx) => {
                    const isWeekend = [0, 6].includes(day.getDay());
                    return (
                      <div
                        key={idx}
                        className={`flex-1 text-center border-r last:border-r-0 ${
                          isWeekend ? 'bg-gray-100 text-gray-400' : ''
                        }`}
                      >
                        {format(day, DAY_LABEL_FORMAT, { locale })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[180px_1fr] border-b border-gray-100 bg-white">
              <div className="px-4 py-3 border-r border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    if (inventoryCategory !== 'series') return;
                    setShowUnits((prev) => !prev);
                  }}
                  className={`inline-flex items-center gap-2 text-sm font-medium ${
                    inventoryCategory === 'series'
                      ? 'text-gray-900 hover:text-gray-700'
                      : 'text-gray-900 cursor-default'
                  }`}
                >
                  {inventoryCategory === 'series' ? (
                    showUnits ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />
                  ) : null}
                  {t('equipment.gantt.globalResource')}
                </button>
                <div className="text-xs text-gray-500">{t('equipment.gantt.globalSubtitle')}</div>
              </div>
              <div className="relative py-2">
                <div className="absolute inset-0">
                  <div className="flex h-full px-4">
                    {timelineDays.map((day, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 border-r border-gray-100 ${
                          [0, 6].includes(day.getDay()) ? 'bg-gray-50' : 'bg-white'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="relative h-12 px-4">
                  {aggregatedEvents.length === 0 && !loading && (
                    <div className="absolute inset-0 flex items-center text-xs text-gray-400">
                      {t('equipment.gantt.noReservations')}
                    </div>
                  )}
                  {aggregatedEvents.map((reservation) => {
                    const location = reservation.location?.trim();
                    return reservation.quantity > 0
                      ? renderBar(
                          reservation.id,
                          reservation.startDate,
                          reservation.endDate,
                          `${reservation.reference} (${t('equipment.gantt.quantityLabel', { count: reservation.quantity })})`,
                          reservation.status,
                          t('equipment.gantt.eventTooltip', {
                            client: reservation.clientName,
                            location: location || '',
                            locationProvided: location ? 'yes' : 'no',
                          })
                        )
                      : null;
                  })}
                </div>
              </div>
            </div>

            {inventoryCategory === 'series' && showUnits && (
              <>
                {displayUnitEntries.length === 0 && !unitLoading ? (
                  <div className="grid grid-cols-[180px_1fr] border-b border-gray-100 bg-white">
                    <div className="px-4 py-3 border-r border-gray-100 text-sm text-gray-500">
                      {t('equipment.gantt.unitsHeader')}
                    </div>
                    <div className="px-4 py-3 text-xs text-gray-400">
                      {t('equipment.gantt.unitsEmpty')}
                    </div>
                  </div>
                ) : (
                  displayUnitEntries.map((unit, idx) => (
                    <div
                      key={unit.unitId || idx}
                      className="grid grid-cols-[180px_1fr] border-b border-gray-100 bg-white"
                    >
                      <div className="px-4 py-3 border-r border-gray-100">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          .{' '}
                          {unit.serialNumber
                            ? t('equipment.gantt.unitLabel.serial', { serial: unit.serialNumber })
                            : t('equipment.gantt.unitLabel.default', { index: idx + 1 })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {unit.status
                            ? t('equipment.gantt.unitStatus', { status: unit.status })
                            : t('equipment.gantt.unitStatusEmpty')}
                        </div>
                      </div>
                      <div className="relative py-2">
                        <div className="absolute inset-0">
                          <div className="flex h-full px-4">
                            {timelineDays.map((day, dayIdx) => (
                              <div
                                key={dayIdx}
                                className={`flex-1 border-r border-gray-100 ${
                                  [0, 6].includes(day.getDay()) ? 'bg-gray-50' : 'bg-white'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="relative h-12 px-4">
                          {unit.reservations.length === 0 && !unitLoading && (
                            <div className="absolute inset-0 flex items-center text-xs text-gray-300">
                              {t('equipment.gantt.noReservations')}
                            </div>
                          )}
                          {unit.reservations.map((reservation) => {
                            const location = reservation.location?.trim();
                            return renderBar(
                              reservation.id,
                              reservation.startDate,
                              reservation.endDate,
                              reservation.reference,
                              reservation.status,
                              t('equipment.gantt.eventTooltip', {
                                client: reservation.clientName,
                                location: location || '',
                                locationProvided: location ? 'yes' : 'no',
                              })
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 px-4 py-3 text-xs text-gray-500 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-blue-500" />
            {t('equipment.gantt.legend.confirmed')}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-yellow-400" />
            {t('equipment.gantt.legend.pending')}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-gray-400" />
            {t('equipment.gantt.legend.completed')}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-red-500" />
            {t('equipment.gantt.legend.cancelled')}
          </div>
        </div>
      </div>

      {!hasData && !loading && (
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
          {t('equipment.gantt.noData')}
        </div>
      )}
    </div>
  );
};

export default EquipmentReservationGantt;
