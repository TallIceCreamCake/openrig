import React, { useMemo, useState } from 'react';
import { addDays, startOfWeek, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Personnel, PersonnelActivity } from '../../types/personnel';
import { DAY_LABEL_FORMAT, activityColor, ensureEnd } from './ganttUtils';

interface PersonnelGanttProps {
  personnel: Personnel[];
  activities: PersonnelActivity[];
}

const PersonnelGantt: React.FC<PersonnelGanttProps> = ({ personnel, activities }) => {
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [selectedPerson, setSelectedPerson] = useState<string>('all');

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

  const filteredPersonnel = useMemo(() => {
    if (selectedPerson === 'all') return personnel;
    return personnel.filter(p => p.id === selectedPerson);
  }, [personnel, selectedPerson]);

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
    const label = activity.title || activity.type || 'Activité';
    const startLabel = format(start, 'dd/MM HH:mm');
    const endLabel = format(end, 'dd/MM HH:mm');
    const clientLabel = activity.client_name ? ` • ${activity.client_name}` : '';

    return (
      <div
        key={activity.id}
        className={`absolute top-1 h-8 border shadow-sm rounded-md px-2 flex items-center text-xs ${activityColor(activity.type)}`}
        style={{ left: `${left}%`, width: `${width}%`, minWidth: '60px' }}
      >
        <span className="truncate" title={`${label}${clientLabel}\n${startLabel} → ${endLabel}`}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReferenceDate(addDays(referenceDate, -range))}
              className="rounded-full border border-gray-200 p-2 hover:bg-gray-100"
              aria-label="Période précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-gray-800">
              {format(timelineStart, 'dd MMM yyyy', { locale: fr })} – {format(addDays(timelineEnd, -1), 'dd MMM yyyy', { locale: fr })}
            </div>
            <button
              onClick={() => setReferenceDate(addDays(referenceDate, range))}
              className="rounded-full border border-gray-200 p-2 hover:bg-gray-100"
              aria-label="Période suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Durée</label>
            <select
              value={range}
              onChange={(e) => setRange(Number(e.target.value) as 7 | 14 | 30)}
              className="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value={7}>7 jours</option>
              <option value={14}>14 jours</option>
              <option value={30}>30 jours</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Personnel</label>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">Tout le personnel</option>
              {personnel.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.first_name} {person.last_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* timeline header */}
            <div className="grid grid-cols-[180px_1fr] border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <div className="px-4 py-2">Ressource</div>
              <div className="px-4 py-2">
                <div className="flex">
                  {timelineDays.map((day, idx) => {
                    const isWeekend = [0, 6].includes(day.getDay());
                    return (
                      <div
                        key={idx}
                        className={`flex-1 text-center border-r last:border-r-0 ${isWeekend ? 'bg-gray-100 text-gray-400' : ''}`}
                      >
                        {format(day, DAY_LABEL_FORMAT, { locale: fr })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {filteredPersonnel.length === 0 && (
              <div className="p-6 text-sm text-gray-500">Aucun membre de personnel trouvé.</div>
            )}

            {filteredPersonnel.map((person) => {
              const personActivities = activitiesByPerson.get(person.id) || [];
              return (
                <div
                  key={person.id}
                  className="grid grid-cols-[180px_1fr] border-b border-gray-100 bg-white"
                >
                  <div className="px-4 py-3 border-r border-gray-100">
                    <div className="text-sm font-medium text-gray-900">{person.first_name} {person.last_name}</div>
                    <div className="text-xs text-gray-500">{person.role || '—'}</div>
                  </div>
                  <div className="relative px-4 py-2">
                    <div className="absolute inset-0 flex">
                      {timelineDays.map((day, idx) => (
                        <div
                          key={idx}
                          className={`flex-1 border-r border-gray-100 ${[0, 6].includes(day.getDay()) ? 'bg-gray-50' : 'bg-white'}`}
                        />
                      ))}
                    </div>
                    <div className="relative h-12">
                      {personActivities.length === 0 && (
                        <div className="absolute inset-0 flex items-center text-xs text-gray-400">Pas d’activité planifiée</div>
                      )}
                      {personActivities.map(activity => renderBar(activity))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-blue-500" /> Préparation
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-green-500" /> Livraison
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-orange-400" /> Retour
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-purple-500" /> Maintenance
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-slate-500" /> Divers
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonnelGantt;
