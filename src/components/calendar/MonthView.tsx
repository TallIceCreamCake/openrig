import React, { useRef, useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
  isAfter,
  isBefore,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { CalendarEvent } from '../../types/calendar';
import type { SupportedLanguage } from '../../i18n/translations';

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  locale: Locale;
  use12Hours: boolean;
  language: SupportedLanguage;
}

const EVENT_ACCENT: Record<CalendarEvent['type'], string> = {
  rental: '#059669',
  service: '#2563EB',
  sale: '#059669',
  delivery: '#0EA5E9',
  appointment: '#F59E0B',
  return_delivery: '#0891B2',
  return_appointment: '#7C3AED',
  maintenance: '#EA580C',
  task: '#6B7280',
  meeting: '#475569',
  reminder: '#94A3B8',
};

const hexToRgba = (hex: string, alpha: number): string => {
  const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return `rgba(107,114,128,${alpha})`;
  const h = match[1].length === 3
    ? match[1].split('').map((c) => c + c).join('')
    : match[1];
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
};

/** Blend hex color with white to produce a fully opaque pastel (mix = 0..1, 0 = white, 1 = full color) */
const tintHex = (hex: string, mix = 0.13): string => {
  const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return '#f3f4f6';
  const h = match[1].length === 3
    ? match[1].split('').map((c) => c + c).join('')
    : match[1];
  const r = Math.round(parseInt(h.slice(0, 2), 16) * mix + 255 * (1 - mix));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * mix + 255 * (1 - mix));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * mix + 255 * (1 - mix));
  return `rgb(${r},${g},${b})`;
};

const darkenHex = (hex: string, amount = 90): string => {
  const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return hex;
  const h = match[1].length === 3
    ? match[1].split('').map((c) => c + c).join('')
    : match[1];
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(parseInt(h.slice(0, 2), 16) - amount);
  const g = clamp(parseInt(h.slice(2, 4), 16) - amount);
  const b = clamp(parseInt(h.slice(4, 6), 16) - amount);
  return `rgb(${r},${g},${b})`;
};

interface EventSegment {
  event: CalendarEvent;
  colStart: number;
  colSpan: number;
  row: number;
  isStart: boolean;
  isEnd: boolean;
}

const EVENT_H = 20;      // px — bar height
const EVENT_GAP = 2;     // px — gap between bars
const DAY_NUM_H = 26;    // px — space reserved at top for the day number
const BOTTOM_PAD = 6;    // px — padding below events before cell bottom

function computeWeekSegments(weekDays: Date[], allEvents: CalendarEvent[]): EventSegment[] {
  const weekStart = startOfDay(weekDays[0]);
  const weekEnd = endOfDay(weekDays[6]);

  const overlapping = allEvents
    .filter((e) => {
      const s = parseISO(e.start_date);
      const en = parseISO(e.end_date);
      return s <= weekEnd && en >= weekStart;
    })
    .sort((a, b) => {
      const diff = parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime();
      if (diff !== 0) return diff;
      return parseISO(b.end_date).getTime() - parseISO(a.end_date).getTime();
    });

  const proto: Omit<EventSegment, 'row'>[] = overlapping.map((event) => {
    const eStart = parseISO(event.start_date);
    const eEnd = parseISO(event.end_date);
    let cs = -1;
    let ce = -1;
    for (let i = 0; i < 7; i++) {
      const dStart = startOfDay(weekDays[i]);
      const dEnd = endOfDay(weekDays[i]);
      if (eStart <= dEnd && eEnd >= dStart) {
        if (cs === -1) cs = i;
        ce = i;
      }
    }
    if (cs === -1) return null as unknown as Omit<EventSegment, 'row'>;
    return {
      event,
      colStart: cs,
      colSpan: ce - cs + 1,
      isStart: !isBefore(eStart, weekStart),
      isEnd: !isAfter(eEnd, weekEnd),
    };
  }).filter(Boolean);

  const occupancy: boolean[][] = [];
  const result: EventSegment[] = [];
  for (const seg of proto) {
    let row = 0;
    while (true) {
      if (!occupancy[row]) occupancy[row] = new Array(7).fill(false);
      let free = true;
      for (let c = seg.colStart; c < seg.colStart + seg.colSpan; c++) {
        if (occupancy[row][c]) { free = false; break; }
      }
      if (free) {
        for (let c = seg.colStart; c < seg.colStart + seg.colSpan; c++) occupancy[row][c] = true;
        result.push({ ...seg, row });
        break;
      }
      row++;
    }
  }
  return result;
}

const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  events,
  onDateClick,
  onEventClick,
  locale,
  language,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(120);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      if (w > 0) setCellSize(Math.floor(w / 7));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  // Max visible event rows that fit inside a square cell
  const maxRows = Math.max(1, Math.floor((cellSize - DAY_NUM_H - BOTTOM_PAD - EVENT_GAP) / (EVENT_H + EVENT_GAP)));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const weeks: Date[][] = [];
  let cursor = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  while (!isAfter(cursor, calEnd)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }

  const weekDayLabels = Array.from({ length: 7 }, (_, i) => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    const raw = format(addDays(base, i), 'EEE', { locale });
    return language === 'fr' ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700">
      {/* Column header */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {weekDayLabels.map((label, i) => (
          <div
            key={i}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid — measured for square cells */}
      <div ref={gridRef} className="flex-1">
        {weeks.map((weekDays, wIdx) => {
          const segments = computeWeekSegments(weekDays, events);

          const hiddenPerCol = new Array(7).fill(0);
          segments.forEach((seg) => {
            if (seg.row >= maxRows) {
              for (let c = seg.colStart; c < seg.colStart + seg.colSpan; c++) {
                hiddenPerCol[c]++;
              }
            }
          });

          return (
            <div
              key={wIdx}
              className="relative border-b border-gray-200 dark:border-gray-700 last:border-b-0"
              style={{ height: cellSize }}
            >
              {/* Day cell backgrounds + numbers */}
              <div className="absolute inset-0 grid grid-cols-7">
                {weekDays.map((d, dIdx) => (
                  <div
                    key={dIdx}
                    className={[
                      'relative border-r border-gray-100 dark:border-gray-800 last:border-r-0',
                      'cursor-pointer select-none transition-colors',
                      'hover:bg-blue-50/40 dark:hover:bg-blue-900/10',
                      !isSameMonth(d, currentDate) ? 'bg-gray-50/60 dark:bg-gray-800/40' : '',
                    ].join(' ')}
                    onClick={() => onDateClick(d)}
                  >
                    <div className="flex items-center justify-center pt-1.5">
                      <span
                        className={[
                          'flex h-5 w-5 items-center justify-center rounded-full',
                          'text-[11px] font-semibold leading-none',
                          isToday(d)
                            ? 'bg-blue-600 text-white'
                            : isSameMonth(d, currentDate)
                              ? 'text-gray-800 dark:text-gray-200'
                              : 'text-gray-400 dark:text-gray-600',
                        ].join(' ')}
                      >
                        {format(d, 'd')}
                      </span>
                    </div>
                    {/* "+N more" anchored to bottom of the cell */}
                    {hiddenPerCol[dIdx] > 0 && (
                      <div className="absolute bottom-1 left-0 right-0 flex justify-center">
                        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 leading-none">
                          +{hiddenPerCol[dIdx]}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Spanning event bars */}
              <div
                className="pointer-events-none absolute left-0 right-0"
                style={{ top: DAY_NUM_H, bottom: BOTTOM_PAD }}
              >
                {segments
                  .filter((s) => s.row < maxRows)
                  .map((seg) => {
                    const accent = (seg.event.color && /^#[0-9a-f]{3,6}$/i.test(seg.event.color))
                      ? seg.event.color
                      : EVENT_ACCENT[seg.event.type] || '#6B7280';
                    const surface = tintHex(accent, 0.13);
                    const borderAccent = tintHex(accent, 0.35);

                    const L_PAD = seg.isStart ? 3 : 0;
                    const R_PAD = seg.isEnd ? 3 : 0;

                    const borderRadius = [
                      seg.isStart ? 3 : 0,
                      seg.isEnd ? 3 : 0,
                      seg.isEnd ? 3 : 0,
                      seg.isStart ? 3 : 0,
                    ].map((r) => `${r}px`).join(' ');

                    const showTitle = seg.isStart || seg.colStart === 0;

                    return (
                      <div
                        key={`${seg.event.id}-${wIdx}`}
                        className="pointer-events-auto absolute cursor-pointer overflow-hidden"
                        style={{
                          top: seg.row * (EVENT_H + EVENT_GAP),
                          left: `calc(${(seg.colStart / 7) * 100}% + ${L_PAD}px)`,
                          width: `calc(${(seg.colSpan / 7) * 100}% - ${L_PAD + R_PAD}px)`,
                          height: EVENT_H,
                          borderRadius,
                          backgroundColor: surface,
                          borderTop: `1px solid ${borderAccent}`,
                          borderBottom: `1px solid ${borderAccent}`,
                          borderLeft: seg.isStart ? `3px solid ${accent}` : `1px solid ${borderAccent}`,
                          borderRight: seg.isEnd ? `1px solid ${borderAccent}` : 'none',
                        }}
                        title={seg.event.title}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(seg.event);
                        }}
                      >
                        {showTitle && (
                          <div className="flex h-full items-center overflow-hidden px-1.5">
                            <span
                              className="truncate text-[11px] font-medium leading-none"
                              style={{ color: darkenHex(accent) }}
                            >
                              {seg.event.title}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
