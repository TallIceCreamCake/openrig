import {
  differenceInMinutes,
  endOfDay,
  max as dateMax,
  min as dateMin,
  parseISO,
  startOfDay,
} from 'date-fns';
import { CalendarEvent } from '../../types/calendar';

export interface CalendarDayEventLayout {
  event: CalendarEvent;
  segmentStart: Date;
  segmentEnd: Date;
  topPx: number;
  heightPx: number;
  columnIndex: number;
  columnCount: number;
  zIndex: number;
}

const MIN_VISIBLE_DURATION_MINUTES = 45;

const compareLayouts = (a: CalendarDayEventLayout, b: CalendarDayEventLayout) => {
  const startDiff = a.segmentStart.getTime() - b.segmentStart.getTime();
  if (startDiff !== 0) return startDiff;

  const durationDiff = b.heightPx - a.heightPx;
  if (durationDiff !== 0) return durationDiff;

  return a.event.title.localeCompare(b.event.title, 'fr', { sensitivity: 'base' });
};

const getStartMinuteKey = (value: Date) => value.getHours() * 60 + value.getMinutes();

export const buildDayEventLayouts = (
  events: CalendarEvent[],
  day: Date,
  pixelsPerHour = 60,
): CalendarDayEventLayout[] => {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const layouts = events
    .map<CalendarDayEventLayout | null>((event) => {
      const startDate = parseISO(event.start_date);
      const endDate = parseISO(event.end_date);

      if (startDate > dayEnd || endDate < dayStart) {
        return null;
      }

      const segmentStart = dateMax([startDate, dayStart]);
      const segmentEnd = dateMin([endDate, dayEnd]);
      const topMinutes = differenceInMinutes(segmentStart, dayStart);
      const durationInMinutes = Math.max(
        MIN_VISIBLE_DURATION_MINUTES,
        differenceInMinutes(segmentEnd, segmentStart),
      );
      const pixelsPerMinute = pixelsPerHour / 60;

      return {
        event,
        segmentStart,
        segmentEnd,
        topPx: topMinutes * pixelsPerMinute,
        heightPx: durationInMinutes * pixelsPerMinute,
        columnIndex: 0,
        columnCount: 1,
        zIndex: 10 + Math.round(topMinutes),
      };
    })
    .filter((value): value is CalendarDayEventLayout => value !== null)
    .sort(compareLayouts);

  const groups = new Map<number, CalendarDayEventLayout[]>();
  layouts.forEach((layout) => {
    const key = getStartMinuteKey(layout.segmentStart);
    const group = groups.get(key);
    if (group) {
      group.push(layout);
    } else {
      groups.set(key, [layout]);
    }
  });

  groups.forEach((group) => {
    if (group.length <= 1) return;
    group.forEach((layout, index) => {
      layout.columnCount = group.length;
      layout.columnIndex = index;
    });
  });

  return layouts;
};
