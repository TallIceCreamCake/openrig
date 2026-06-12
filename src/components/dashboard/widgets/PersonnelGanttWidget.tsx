import React, { useMemo, useState } from 'react';
import { addDays, startOfWeek, format, parseISO, isToday } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Personnel, PersonnelActivity } from '../../../types/personnel';
import { activityColor, DAY_LABEL_FORMAT, ensureEnd } from '../../personnel/ganttUtils';
import { useTranslation } from '../../../context/TranslationContext';

interface PersonnelGanttWidgetProps {
  personnel: Personnel[];
  activities: PersonnelActivity[];
}

const PersonnelGanttWidget: React.FC<PersonnelGanttWidgetProps> = ({ personnel, activities }) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? enUS : fr;
  const [range, setRange] = useState<7 | 14>(7);
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());

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

  const activitiesByPerson = useMemo(() => {
    const map = new Map<string, PersonnelActivity[]>();
    activities.forEach(activity => {
      if (!activity.personnel_id) return;
      const start = parseISO(activity.start_time);
      const end = ensureEnd(activity);
      if (end <= timelineStart || start >= timelineEnd) return;
      if (!map.has(activity.personnel_id)) {
        map.set(activity.personnel_id, []);
      }
      map.get(activity.personnel_id)!.push(activity);
    });
    map.forEach(list => {
      list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });
    return map;
  }, [activities, timelineStart, timelineEnd]);

  const renderBar = (activity: PersonnelActivity) => {
    const start = parseISO(activity.start_time);
    const end = ensureEnd(activity);
    const clippedStart = start < timelineStart ? timelineStart : start;
    const clippedEnd = end > timelineEnd ? timelineEnd : end;
    if (clippedEnd <= clippedStart) return null;

    const left = ((clippedStart.getTime() - timelineStart.getTime()) / timelineDuration) * 100;
    const width = Math.max(1, ((clippedEnd.getTime() - clippedStart.getTime()) / timelineDuration) * 100);
    const label = activity.title || activity.type || t('dashboard.widgets.personnelGantt.defaultLabel');
    const startLabel = format(start, 'dd/MM HH:mm', { locale });
    const endLabel = format(end, 'dd/MM HH:mm', { locale });
    const clientLabel = activity.client_name ? ` • ${activity.client_name}` : '';

    return (
      <div
        key={activity.id}
        className={`absolute top-1 h-7 border shadow-sm rounded-lg px-2 flex items-center text-[11px] leading-tight ${activityColor(activity.type)}`}
        style={{ left: `${left}%`, width: `${width}%`, minWidth: '48px' }}
      >
        <span className="truncate" title={`${label}${clientLabel}\n${startLabel} → ${endLabel}`}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <button
            onClick={() => setReferenceDate(addDays(referenceDate, -range))}
            className="rounded-full border border-gray-200 p-1.5 hover:bg-gray-100"
            aria-label={t('dashboard.widgets.personnelGantt.prevPeriod')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            {format(timelineStart, 'dd MMM', { locale })} – {format(addDays(timelineEnd, -1), 'dd MMM', { locale })}
          </div>
          <button
            onClick={() => setReferenceDate(addDays(referenceDate, range))}
            className="rounded-full border border-gray-200 p-1.5 hover:bg-gray-100"
            aria-label={t('dashboard.widgets.personnelGantt.nextPeriod')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value) as 7 | 14)}
          className="rounded-md border-gray-300 text-xs focus:border-blue-500 focus:ring-blue-500"
        >
          <option value={7}>{t('dashboard.widgets.personnelGantt.rangeOption', { days: 7 })}</option>
          <option value={14}>{t('dashboard.widgets.personnelGantt.rangeOption', { days: 14 })}</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[160px_1fr] border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase text-gray-500">
            <div className="px-3 py-2">{t('dashboard.widgets.personnelGantt.resourceColumn')}</div>
            <div className="py-2">
              <div className="flex">
                {timelineDays.map((day, idx) => {
                  const isWeekend = [0, 6].includes(day.getDay());
                  const today = isToday(day);
                  return (
                    <div
                      key={idx}
                      className={`flex-1 text-center border-r last:border-r-0 ${
                        today ? 'bg-blue-50 text-blue-600' : isWeekend ? 'bg-gray-100 text-gray-400' : ''
                      }`}
                    >
                      {format(day, DAY_LABEL_FORMAT, { locale })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {personnel.length === 0 ? (
            <div className="p-6 text-xs text-gray-500">{t('dashboard.widgets.personnelGantt.empty')}</div>
          ) : (
            personnel.map((person) => {
              const personActivities = activitiesByPerson.get(person.id) || [];
              return (
                <div
                  key={person.id}
                  className="grid grid-cols-[160px_1fr] border-b border-gray-100 bg-white"
                >
                  <div className="px-3 py-3 border-r border-gray-100">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {person.first_name} {person.last_name}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{person.role || '—'}</div>
                  </div>
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex">
                      {timelineDays.map((day, idx) => (
                        <div
                          key={idx}
                          className={`flex-1 border-r border-gray-100 ${
                            isToday(day) ? 'bg-blue-50/50' : [0, 6].includes(day.getDay()) ? 'bg-gray-50' : 'bg-white'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="relative h-11">
                      {personActivities.length === 0 && (
                        <div className="absolute inset-0 flex items-center pl-3 text-[11px] text-gray-400">
                          {t('dashboard.widgets.personnelGantt.noActivity')}
                        </div>
                      )}
                      {personActivities.map(activity => renderBar(activity))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonnelGanttWidget;
