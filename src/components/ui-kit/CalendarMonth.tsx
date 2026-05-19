import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

type CalendarRange = {
  start?: Date | null;
  end?: Date | null;
  backgroundColor?: string;
  edgeColor?: string;
  textColor?: string;
  inRangeTextColor?: string;
};

type CalendarMarker = {
  start: Date;
  end?: Date | null;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
};

type CalendarMonthProps = {
  month: Date;
  onMonthChange?: (next: Date) => void;
  range?: CalendarRange;
  ranges?: CalendarRange[];
  markers?: CalendarMarker[];
  showRangeSummary?: boolean;
  summaryStart?: Date | null;
  summaryEnd?: Date | null;
  locale?: string;
  className?: string;
};

type CalendarDay = {
  date: Date;
  inCurrentMonth: boolean;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const isBefore = (a: Date, b: Date) => a.getTime() < b.getTime();
const isSameDay = (a?: Date | null, b?: Date | null) => {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const monthLabel = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);

const formatLabel = (date: Date, locale: string) => new Intl.DateTimeFormat(locale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(date);

const CalendarMonth: React.FC<CalendarMonthProps> = ({
  month,
  onMonthChange,
  range,
  ranges,
  markers = [],
  showRangeSummary = false,
  summaryStart,
  summaryEnd,
  locale = 'fr-FR',
  className,
}) => {
  const [showMonthPicker, setShowMonthPicker] = React.useState(false);
  const [showYearPicker, setShowYearPicker] = React.useState(false);
  const calendarDays = React.useMemo(() => {
    const monthStart = startOfMonth(month);
    const startWeekday = (monthStart.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const days: CalendarDay[] = [];

    for (let i = 0; i < startWeekday; i += 1) {
      const date = new Date(monthStart);
      date.setDate(date.getDate() - (startWeekday - i));
      days.push({ date, inCurrentMonth: false });
    }

    for (let i = 1; i <= daysInMonth; i += 1) {
      const date = new Date(month.getFullYear(), month.getMonth(), i);
      days.push({ date, inCurrentMonth: true });
    }

    while (days.length % 7 !== 0) {
      const last = days[days.length - 1]?.date || new Date(month.getFullYear(), month.getMonth() + 1, 0);
      const date = new Date(last);
      date.setDate(date.getDate() + 1);
      days.push({ date, inCurrentMonth: false });
    }

    return days;
  }, [month]);

  const normalizedRanges = React.useMemo(() => {
    const base = ranges && ranges.length > 0 ? ranges : range ? [range] : [];
    const resolved = base
      .map((entry) => {
        const rawStart = entry.start ?? entry.end ?? null;
        const rawEnd = entry.end ?? entry.start ?? null;
        if (!rawStart || !rawEnd) return null;
        let start = startOfDay(rawStart);
        let end = startOfDay(rawEnd);
        if (isBefore(end, start)) {
          const swap = start;
          start = end;
          end = swap;
        }
        return { ...entry, start, end };
      })
      .filter(Boolean) as Array<CalendarRange & { start: Date; end: Date }>;
    resolved.sort((a, b) => a.start.getTime() - b.start.getTime());
    return resolved;
  }, [range, ranges]);

  const monthItems = React.useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    const year = month.getFullYear();
    return Array.from({ length: 12 }, (_, index) => ({
      index,
      label: formatter.format(new Date(year, index, 1)),
    }));
  }, [locale, month]);

  const yearRangeStart = React.useMemo(() => month.getFullYear() - 5, [month]);

  const yearItems = React.useMemo(
    () => Array.from({ length: 12 }, (_, index) => yearRangeStart + index),
    [yearRangeStart]
  );

  const monthDots = React.useMemo(() => {
    const year = month.getFullYear();
    const dotsByMonth = Array.from({ length: 12 }, () => [] as string[]);

    normalizedRanges.forEach((entry) => {
      const color = entry.edgeColor || '#2563eb';
      for (let m = 0; m < 12; m += 1) {
        const monthStart = new Date(year, m, 1);
        const monthEnd = new Date(year, m + 1, 0);
        if (entry.end.getTime() < monthStart.getTime() || entry.start.getTime() > monthEnd.getTime()) {
          continue;
        }
        if (!dotsByMonth[m].includes(color)) {
          dotsByMonth[m].push(color);
        }
      }
    });

    return dotsByMonth.map((colors) => colors.slice(0, 3));
  }, [month, normalizedRanges]);

  const yearDots = React.useMemo(() => {
    const dotsByYear = Array.from({ length: 12 }, () => [] as string[]);

    normalizedRanges.forEach((entry) => {
      const color = entry.edgeColor || '#2563eb';
      yearItems.forEach((year, idx) => {
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year, 11, 31);
        if (entry.end.getTime() < yearStart.getTime() || entry.start.getTime() > yearEnd.getTime()) {
          return;
        }
        if (!dotsByYear[idx].includes(color)) {
          dotsByYear[idx].push(color);
        }
      });
    });

    return dotsByYear.map((colors) => colors.slice(0, 3));
  }, [normalizedRanges, yearItems]);

  const displayStart = summaryStart ? formatLabel(summaryStart, locale) : '';
  const displayEnd = summaryEnd ? formatLabel(summaryEnd, locale) : '';
  const basePlaceholder = 'JJ/MM/AAAA';
  const isMonthView = showMonthPicker && !showYearPicker;
  const isYearView = showYearPicker;
  const yearLabel = new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(month);
  const headingLabel = isYearView
    ? `${yearRangeStart} - ${yearRangeStart + 11}`
    : isMonthView
      ? yearLabel
      : monthLabel(month, locale);

  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white w-full max-w-[320px]', className)}>
      {showRangeSummary && (
        <div className="px-5 pt-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <span className="text-sm font-medium text-gray-500">Du</span>
            <div
              className={`min-w-[140px] flex-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left text-sm ${
                displayStart ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {displayStart || basePlaceholder}
            </div>
            <span className="text-sm font-medium text-gray-400">au</span>
            <div
              className={`min-w-[140px] flex-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left text-sm ${
                displayEnd ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {displayEnd || basePlaceholder}
            </div>
            <div className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-100 text-gray-300">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between px-5 pt-4">
        <button
          type="button"
          onClick={() => {
            if (isYearView) {
              onMonthChange?.(new Date(month.getFullYear() - 12, month.getMonth(), 1));
              return;
            }
            if (isMonthView) {
              onMonthChange?.(new Date(month.getFullYear() - 1, month.getMonth(), 1));
              return;
            }
            onMonthChange?.(new Date(month.getFullYear(), month.getMonth() - 1, 1));
          }}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (isYearView) {
              setShowYearPicker(false);
              setShowMonthPicker(true);
              return;
            }
            if (isMonthView) {
              setShowYearPicker(true);
              return;
            }
            setShowMonthPicker(true);
          }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 capitalize"
        >
          <span>{headingLabel}</span>
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            if (isYearView) {
              onMonthChange?.(new Date(month.getFullYear() + 12, month.getMonth(), 1));
              return;
            }
            if (isMonthView) {
              onMonthChange?.(new Date(month.getFullYear() + 1, month.getMonth(), 1));
              return;
            }
            onMonthChange?.(new Date(month.getFullYear(), month.getMonth() + 1, 1));
          }}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {isYearView ? (
        <div className="px-5 pb-4 pt-5">
          <div className="grid grid-cols-3 gap-3">
            {yearItems.map((year, idx) => {
              const dots = yearDots[idx] || [];
              return (
                <button
                  key={`year-${year}`}
                  type="button"
                  onClick={() => {
                    onMonthChange?.(new Date(year, month.getMonth(), 1));
                    setShowYearPicker(false);
                    setShowMonthPicker(true);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 px-2 py-3 text-xs font-semibold text-gray-700 hover:bg-gray-50',
                    year === month.getFullYear() && 'border-blue-200 bg-blue-50 text-blue-700'
                  )}
                >
                  <span>{year}</span>
                  <span className="flex h-2 items-center justify-center gap-1">
                    {dots.length > 0
                      ? dots.map((color) => (
                          <span key={`${year}-${color}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        ))
                      : <span className="h-1.5 w-1.5 rounded-full bg-transparent" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : isMonthView ? (
        <div className="px-5 pb-4 pt-5">
          <div className="grid grid-cols-3 gap-3">
            {monthItems.map((entry) => {
              const dots = monthDots[entry.index] || [];
              return (
                <button
                  key={`month-${entry.index}`}
                  type="button"
                  onClick={() => {
                    onMonthChange?.(new Date(month.getFullYear(), entry.index, 1));
                    setShowMonthPicker(false);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 px-2 py-3 text-xs font-semibold text-gray-700 hover:bg-gray-50',
                    entry.index === month.getMonth() && 'border-blue-200 bg-blue-50 text-blue-700'
                  )}
                >
                  <span className="uppercase">{entry.label}</span>
                  <span className="flex h-2 items-center justify-center gap-1">
                    {dots.length > 0
                      ? dots.map((color) => (
                          <span key={`${entry.index}-${color}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        ))
                      : <span className="h-1.5 w-1.5 rounded-full bg-transparent" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 mt-5 grid grid-cols-7 px-5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <div>Lun</div>
            <div>Mar</div>
            <div>Mer</div>
            <div>Jeu</div>
            <div>Ven</div>
            <div>Sam</div>
            <div>Dim</div>
          </div>
          <div className="grid grid-cols-7 gap-y-1 px-5 pb-4">
            {calendarDays.map((day, idx) => {
              if (!day.inCurrentMonth) {
                return <div key={`${day.date.toISOString()}-empty-${idx}`} className="h-10 w-full" />;
              }

              const dayDate = startOfDay(day.date);
              const activeRange = normalizedRanges.find((entry) => {
                if (!entry.start || !entry.end) return false;
                return !isBefore(dayDate, entry.start) && !isBefore(entry.end, dayDate);
              });
              const rangeStart = activeRange?.start || null;
              const rangeEnd = activeRange?.end || null;
              const hasRange = !!rangeStart && !!rangeEnd;
              const isRangeStart = hasRange && isSameDay(dayDate, rangeStart);
              const isRangeEnd = hasRange && isSameDay(dayDate, rangeEnd);
              const isSingleSelection = hasRange && isSameDay(rangeStart, rangeEnd) && isSameDay(dayDate, rangeStart);
              const inRange = hasRange && isBefore(rangeStart as Date, dayDate) && isBefore(dayDate, rangeEnd as Date);
              const marker = markers.find((entry) => {
                const start = startOfDay(entry.start);
                const end = startOfDay(entry.end || entry.start);
                return !isBefore(dayDate, start) && !isBefore(end, dayDate);
              });

              const wrapperClasses = ['flex items-center justify-center h-10 w-full'];
              const buttonClasses = ['flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium'];
              const wrapperStyle: React.CSSProperties = {};
              const buttonStyle: React.CSSProperties = {};

              if (isSingleSelection) {
                wrapperClasses.push('rounded-full');
                wrapperStyle.backgroundColor = activeRange?.edgeColor || '#2563eb';
                buttonStyle.color = activeRange?.textColor || '#ffffff';
              } else if (isRangeStart || isRangeEnd) {
                wrapperClasses.push(isRangeStart ? 'rounded-l-full' : 'rounded-r-full');
                wrapperStyle.backgroundColor = activeRange?.edgeColor || '#2563eb';
                buttonStyle.color = activeRange?.textColor || '#ffffff';
              } else if (inRange) {
                wrapperClasses.push('rounded-none');
                wrapperStyle.backgroundColor = activeRange?.backgroundColor || '#dbeafe';
                buttonStyle.color = activeRange?.inRangeTextColor || '#1d4ed8';
              } else {
                buttonClasses.push('text-gray-700 hover:bg-gray-100');
              }

              if (marker) {
                if (marker.backgroundColor && !isSingleSelection && !isRangeStart && !isRangeEnd) {
                  buttonStyle.backgroundColor = marker.backgroundColor;
                }
                if (marker.borderColor && !isSingleSelection && !isRangeStart && !isRangeEnd) {
                  buttonStyle.boxShadow = `0 0 0 1px ${marker.borderColor} inset`;
                }
                if (marker.textColor) {
                  buttonStyle.color = marker.textColor;
                }
              }

              return (
                <div key={`${day.date.toISOString()}-${idx}`} className={wrapperClasses.join(' ')} style={wrapperStyle}>
                  <div className={buttonClasses.join(' ')} style={buttonStyle}>
                    {day.date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarMonth;
