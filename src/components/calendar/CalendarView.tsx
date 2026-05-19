import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  subDays,
  parseISO,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { CalendarEvent } from '../../types/calendar';
import EventModal from './EventModal';
import WeekView from './WeekView';
import MonthView from './MonthView';
import DayView from './DayView';
import CalendarEventCard from './CalendarEventCard';
import ViewToggle from './ViewToggle';
import { useTranslation } from '../../context/TranslationContext';

interface CalendarViewProps {
  events: CalendarEvent[];
  onEventAdd: (event: Partial<CalendarEvent>) => void;
  onEventUpdate: (id: string, event: Partial<CalendarEvent>) => void;
  onEventDelete: (id: string) => void;
  onNavigateToEvent?: (path: string) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  onEventAdd,
  onEventUpdate,
  onEventDelete,
  onNavigateToEvent,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const { t, language } = useTranslation();

  const locale = useMemo(() => (language === 'en' ? enUS : fr), [language]);
  const use12Hours = language === 'en';
  const timeFormat = use12Hours ? 'p' : 'HH:mm';

  const handlePrevious = () => {
    if (viewMode === 'day') {
      setCurrentDate(subDays(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'day') {
      setCurrentDate(addDays(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.rental_id || event.service_id) {
      const targetId = event.rental_id || event.service_id;
      if (targetId && onNavigateToEvent) {
        onNavigateToEvent(`/rentals/${targetId}`);
      }
      return;
    }
    if (event.maintenance_id && onNavigateToEvent) {
      onNavigateToEvent(`/maintenance/${event.maintenance_id}`);
      return;
    }
    setSelectedEvent(event);
    setSelectedDate(parseISO(event.start_date));
    setShowEventModal(true);
  };

  const weekTitle = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    const pattern = language === 'en' ? 'MMMM d, yyyy' : 'd MMMM yyyy';
    const capitalize = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);
    const startLabelRaw = format(start, pattern, { locale });
    const endLabelRaw = format(end, pattern, { locale });
    const startLabel = language === 'fr' ? capitalize(startLabelRaw) : startLabelRaw;
    const endLabel = language === 'fr' ? capitalize(endLabelRaw) : endLabelRaw;
    return t('calendar.header.weekRange', { start: startLabel, end: endLabel });
  };

  const monthTitle = () => {
    const raw = format(currentDate, 'MMMM yyyy', { locale });
    const label = language === 'fr' ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
    return t('calendar.header.month', { month: label });
  };

  const dayTitle = () => {
    const raw = format(currentDate, 'EEEE d MMMM yyyy', { locale });
    return language === 'fr' ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
  };

  const dayEvents = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = endOfDay(currentDate);

    return events
      .map((event) => {
        const start = parseISO(event.start_date);
        const end = parseISO(event.end_date);
        if (end.getTime() < dayStart.getTime() || start.getTime() > dayEnd.getTime()) {
          return null;
        }
        const segmentStart = start.getTime() < dayStart.getTime() ? dayStart : start;
        const segmentEnd = end.getTime() > dayEnd.getTime() ? dayEnd : end;
        return {
          event,
          segmentStart,
          segmentEnd,
        };
      })
      .filter((entry): entry is { event: CalendarEvent; segmentStart: Date; segmentEnd: Date } => Boolean(entry))
      .sort((a, b) => {
        const startDiff = a.segmentStart.getTime() - b.segmentStart.getTime();
        if (startDiff !== 0) return startDiff;
        return a.segmentEnd.getTime() - b.segmentEnd.getTime();
      });
  }, [currentDate, events]);

  const dayListTitle = language === 'en' ? 'Events of the day' : 'Événements du jour';
  const dayListEmpty = language === 'en' ? 'No events for this day.' : 'Aucun événement sur cette journée.';
  const dayListCountLabel = language === 'en' ? 'event(s)' : 'événement(s)';

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Calendar Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <CalendarIcon className="h-6 w-6 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">
              {viewMode === 'day'
                ? dayTitle()
                : viewMode === 'week'
                  ? weekTitle()
                  : monthTitle()}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              {t('calendar.header.today')}
            </button>
            <ViewToggle 
              value={viewMode} 
              onChange={(mode) => setViewMode(mode)} 
            />
            <div className="flex space-x-2">
              <button
                onClick={handlePrevious}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={handleNext}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      {viewMode === 'day' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <DayView
              currentDate={currentDate}
              events={events}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              locale={locale}
              use12Hours={use12Hours}
              language={language}
            />
          </div>
          <aside className="border-t border-gray-200 bg-white lg:h-[800px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">{dayListTitle}</h3>
              <p className="text-xs text-gray-500">
                {dayEvents.length} {dayListCountLabel}
              </p>
            </div>
            <div className="space-y-2 p-3">
              {dayEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                  {dayListEmpty}
                </div>
              ) : (
                dayEvents.map(({ event, segmentStart, segmentEnd }) => {
                  const timeLabel = `${format(segmentStart, timeFormat, { locale })} — ${format(segmentEnd, timeFormat, { locale })}`;
                  const secondaryText = [event.resource_label, event.description].filter(Boolean).join(' • ');
                  return (
                    <button
                      key={`day-list-${event.id}`}
                      type="button"
                      onClick={() => handleEventClick(event)}
                      className="block w-full text-left"
                    >
                      <CalendarEventCard
                        event={event}
                        timeLabel={timeLabel}
                        secondaryText={secondaryText}
                        density="cozy"
                        timeLabelAlign="left"
                        className="h-auto"
                      />
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      ) : viewMode === 'week' ? (
        <WeekView 
          currentDate={currentDate}
          events={events}
          onDateClick={handleDateClick}
          onEventClick={handleEventClick}
          locale={locale}
          use12Hours={use12Hours}
          language={language}
        />
      ) : (
        <MonthView
          currentDate={currentDate}
          events={events}
          onDateClick={handleDateClick}
          onEventClick={handleEventClick}
          locale={locale}
          use12Hours={use12Hours}
          language={language}
        />
      )}

      {/* Event Modal */}
      {showEventModal && (
        <EventModal
          isOpen={showEventModal}
          onClose={() => setShowEventModal(false)}
          date={selectedDate!}
          event={selectedEvent}
          onSubmit={(eventData) => {
            if (selectedEvent) {
              onEventUpdate(selectedEvent.id, eventData);
            } else {
              onEventAdd(eventData);
            }
            setShowEventModal(false);
          }}
          onDelete={selectedEvent ? () => {
            onEventDelete(selectedEvent.id);
            setShowEventModal(false);
          } : undefined}
        />
      )}
    </div>
  );
};

export default CalendarView;
