import React, { useEffect, useMemo, useState } from 'react';
import { addDays, differenceInMinutes, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { CalendarEvent } from '../../../types/calendar';
import { useTranslation } from '../../../context/TranslationContext';
import CalendarEventCard from '../../calendar/CalendarEventCard';
import { buildDayEventLayouts } from '../../calendar/calendarEventLayout';
import { CalendarWidgetOptions } from '../../../types/dashboard';

interface DayCalendarWidgetProps {
  events: CalendarEvent[];
  options?: CalendarWidgetOptions;
}

const DEFAULT_OPTIONS: Required<CalendarWidgetOptions> = {
  days: 1,
  showRentals: true,
  showLogistics: true,
  showMaintenance: true,
  showManual: true,
  showCurrentTimeLine: true,
  showSecondaryText: true,
  density: 'comfortable',
};

const DayCalendarWidget: React.FC<DayCalendarWidgetProps> = ({ events, options }) => {
  const { t, language } = useTranslation();
  const region = language === 'en' ? 'en-US' : 'fr-FR';
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [dayOffset, setDayOffset] = useState(0);
  const resolvedOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...(options || {}) }),
    [options],
  );
  const visibleStartDay = useMemo(
    () => startOfDay(addDays(currentTime, dayOffset)),
    [currentTime, dayOffset],
  );
  const displayDays: 1 | 2 = resolvedOptions.days === 2 ? 2 : 1;
  const slotHeight = resolvedOptions.density === 'compact' ? 32 : 40;
  const filteredEvents = useMemo(() => {
    const isManualType = (type: CalendarEvent['type']) => ['task', 'meeting', 'reminder'].includes(type);
    const isRentalType = (type: CalendarEvent['type']) => ['rental', 'service', 'sale'].includes(type);
    const isLogisticsType = (type: CalendarEvent['type']) => ['delivery', 'appointment', 'return_delivery', 'return_appointment'].includes(type);
    return events.filter((event) => {
      if (event.type === 'maintenance') return resolvedOptions.showMaintenance;
      if (isLogisticsType(event.type)) return resolvedOptions.showLogistics;
      if (isRentalType(event.type)) return resolvedOptions.showRentals;
      if (isManualType(event.type)) return resolvedOptions.showManual;
      return true;
    });
  }, [
    events,
    resolvedOptions.showLogistics,
    resolvedOptions.showMaintenance,
    resolvedOptions.showManual,
    resolvedOptions.showRentals,
  ]);
  const dayDates = useMemo(
    () => Array.from({ length: displayDays }, (_, index) => addDays(visibleStartDay, index)),
    [displayDays, visibleStartDay],
  );
  const dayLayouts = useMemo(
    () =>
      dayDates.map((day) => ({
        day,
        layouts: buildDayEventLayouts(filteredEvents, day, slotHeight),
      })),
    [dayDates, filteredEvents, slotHeight],
  );

  const timeSlots = Array.from({ length: 24 }, (_, i) => i);

  const title = (() => {
    const first = new Intl.DateTimeFormat(region, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(dayDates[0]);
    const firstLabel = first.charAt(0).toUpperCase() + first.slice(1);
    if (displayDays === 1) {
      return t('dashboard.widgets.calendar.heading', { date: firstLabel });
    }
    const second = new Intl.DateTimeFormat(region, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(dayDates[1]);
    return `${firstLabel} → ${second}`;
  })();

  const formatHour = (date: Date) => {
    const formatted = date.toLocaleTimeString(region, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: language === 'en',
      hourCycle: language === 'en' ? 'h12' : 'h23',
    });
    if (language === 'en') {
      return formatted.replace(' ', '\u00A0');
    }
    return formatted;
  };

  const formatAxisHour = (hour: number) => {
    const base = new Date(currentTime);
    base.setHours(hour, 0, 0, 0);
    return formatHour(base);
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const getDaySegmentStyle = (topPx: number, heightPx: number, columnIndex: number, columnCount: number) => {
    const widthPercent = 100 / columnCount;
    return {
      top: `${24 + topPx}px`,
      height: `${heightPx}px`,
      left: `${columnIndex * widthPercent}%`,
      width: `${widthPercent}%`,
    } as React.CSSProperties;
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4 flex flex-shrink-0 items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-700">
          {title}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDayOffset(0)}
            className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium transition-colors ${
              dayOffset === 0
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t('dashboard.widgets.upcomingRentals.today')}
          </button>
          <button
            type="button"
            onClick={() => setDayOffset((previous) => previous - 1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            aria-label="Previous period"
          >
            {'<'}
          </button>
          <button
            type="button"
            onClick={() => setDayOffset((previous) => previous + 1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            aria-label="Next period"
          >
            {'>'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[48px,1fr]">
          <div className="border-r border-gray-100 pt-6">
            {timeSlots.map(hour => (
              <div
                key={hour}
                className="pr-2 text-right text-xs text-gray-500"
                style={{ height: `${slotHeight}px` }}
              >
                {formatAxisHour(hour)}
              </div>
            ))}
          </div>

          <div className={`grid ${displayDays === 2 ? 'grid-cols-2 divide-x divide-gray-100' : 'grid-cols-1'}`}>
            {dayLayouts.map(({ day, layouts: layoutsForDay }) => {
              const dayLabelRaw = new Intl.DateTimeFormat(region, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              }).format(day);
              const dayLabel = dayLabelRaw.charAt(0).toUpperCase() + dayLabelRaw.slice(1);
              const isCurrentDay = isSameDay(day, currentTime);
              const dayStartLocal = startOfDay(day);
              const dayEndLocal = endOfDay(day);
              const currentMinutesForDay = differenceInMinutes(currentTime, dayStartLocal);
              const showCurrentDayLine = resolvedOptions.showCurrentTimeLine
                && isCurrentDay
                && currentTime >= dayStartLocal
                && currentTime <= dayEndLocal;

              return (
                <div
                  key={day.toISOString()}
                  className="relative pt-6"
                >
                  <div className="absolute inset-x-0 top-0 h-6 border-b border-gray-100 px-2 text-[11px] font-medium text-gray-500">
                    {dayLabel}
                  </div>

                  {timeSlots.map((hour) => (
                    <div
                      key={hour}
                      className="border-t border-gray-100"
                      style={{ height: `${slotHeight}px` }}
                    />
                  ))}

                  {showCurrentDayLine && (
                    <div
                      className="pointer-events-none absolute left-0 right-0"
                      style={{ top: `${24 + (currentMinutesForDay / 60) * slotHeight}px`, zIndex: 5000 }}
                    >
                      <div className="relative">
                        <div
                          className="h-[2px] w-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                        <div
                          className="absolute -top-[5px] -left-[6px] h-3 w-3 rounded-full border border-white"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      </div>
                    </div>
                  )}

                  {layoutsForDay.map((layout) => {
                    const timeLabel = `${formatHour(layout.segmentStart)} — ${formatHour(layout.segmentEnd)}`;
                    return (
                      <div
                        key={layout.event.id}
                        className="absolute cursor-pointer px-1"
                        style={{
                          ...getDaySegmentStyle(
                            layout.topPx,
                            layout.heightPx,
                            layout.columnIndex,
                            layout.columnCount,
                          ),
                          zIndex: layout.zIndex,
                        }}
                      >
                        <CalendarEventCard
                          event={layout.event}
                          timeLabel={timeLabel}
                          secondaryText={resolvedOptions.showSecondaryText
                            ? [layout.event.resource_label, layout.event.description].filter(Boolean).join(' • ')
                            : undefined}
                          density={resolvedOptions.density === 'compact'
                            ? (layout.heightPx >= 52 ? 'compact' : 'micro')
                            : (layout.heightPx >= 60 ? 'cozy' : 'compact')}
                          className="h-full"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayCalendarWidget;
