import React, { useMemo } from 'react';
import {
  format,
  isToday,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
  endOfDay,
  differenceInMinutes,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { CalendarEvent } from '../../types/calendar';
import type { SupportedLanguage } from '../../i18n/translations';
import CalendarEventCard from './CalendarEventCard';
import { buildDayEventLayouts } from './calendarEventLayout';

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  locale: Locale;
  use12Hours: boolean;
  language: SupportedLanguage;
}

const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  onDateClick,
  onEventClick,
  locale,
  use12Hours,
  language,
}) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const timeFormat = use12Hours ? 'p' : 'HH:mm';
  const labelLocale = language === 'en' ? 'en-US' : 'fr-FR';
  const timeLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(labelLocale, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: use12Hours,
      }),
    [labelLocale, use12Hours]
  );

  const buildSecondaryText = (event: CalendarEvent) => {
    return [event.resource_label, event.description].filter(Boolean).join(' • ');
  };

  const dayStart = startOfDay(currentDate);
  const dayEnd = endOfDay(currentDate);
  const dayLayouts = useMemo(() => buildDayEventLayouts(events, currentDate), [events, currentDate]);

  const getDaySegmentStyle = (topPx: number, heightPx: number, columnIndex: number, columnCount: number) => {
    const widthPercent = 100 / columnCount;
    return {
      top: `${topPx}px`,
      height: `${heightPx}px`,
      left: `${columnIndex * widthPercent}%`,
      width: `${widthPercent}%`,
    } as React.CSSProperties;
  };

  return (
    <div className="flex flex-col h-[800px] overflow-auto">
      <div className="flex flex-1">
        <div className="w-20 flex-shrink-0">
          <div className="h-12" />
          {hours.map((hour) => {
            const base = new Date();
            base.setHours(hour, 0, 0, 0);
            const label = timeLabelFormatter.format(base);
            return (
              <div
                key={hour}
                className="h-16 border-t border-gray-200 text-xs text-gray-500 text-right pr-2"
              >
                {label}
              </div>
            );
          })}
        </div>

        <div className="flex-1">
          <div
            className={`h-12 flex flex-col items-center justify-center border-b border-gray-200 ${
              isToday(currentDate) ? 'bg-blue-50' : ''
            }`}
          >
            <span className="text-sm font-medium">
              {(() => {
                const raw = format(currentDate, 'EEEE', { locale });
                return language === 'fr' ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
              })()}
            </span>
            <span
              className={`text-sm ${
                isToday(currentDate) ? 'text-blue-600 font-semibold' : 'text-gray-500'
              }`}
            >
              {format(currentDate, 'd MMMM', { locale })}
            </span>
          </div>

          <div className="relative">
            {hours.map((hour) => {
              const slotDate = setMinutes(setHours(new Date(currentDate), hour), 0);
              return (
                <div
                  key={hour}
                  className="h-16 border-t border-gray-200"
                  onClick={() => onDateClick(slotDate)}
                />
              );
            })}
            <div className="absolute inset-0">
              {(() => {
                const now = new Date();
                if (!isToday(currentDate)) return null;
                if (now < dayStart || now > dayEnd) return null;
                const minutesSinceStart = differenceInMinutes(now, dayStart);
                const top = (minutesSinceStart / 60) * 60;
                return (
                  <div
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{ top: `${top}px`, zIndex: 5000 }}
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
                );
              })()}
              {dayLayouts.map((layout) => {
                const eventStart = parseISO(layout.event.start_date);
                const eventEnd = parseISO(layout.event.end_date);
                const isSplitSegment =
                  layout.segmentStart.getTime() !== eventStart.getTime() ||
                  layout.segmentEnd.getTime() !== eventEnd.getTime();
                const timeLabel = isSplitSegment
                  ? format(layout.segmentStart, timeFormat, { locale })
                  : `${format(layout.segmentStart, timeFormat, { locale })} — ${format(layout.segmentEnd, timeFormat, { locale })}`;
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(layout.event);
                    }}
                  >
                    <CalendarEventCard
                      event={layout.event}
                      timeLabel={timeLabel}
                      secondaryText={buildSecondaryText(layout.event)}
                      density={layout.heightPx >= 90 ? 'cozy' : 'compact'}
                      className="h-full"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayView;
