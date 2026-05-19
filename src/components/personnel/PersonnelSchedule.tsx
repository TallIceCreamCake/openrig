import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Loader2, Plus } from 'lucide-react';
import { addDays, addWeeks, format, parseISO, startOfWeek, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import {
  Personnel,
  PersonnelActivity,
  PersonnelSchedule as PersonnelScheduleEntry
} from '../../types/personnel';

interface PersonnelScheduleProps {
  personnel: Personnel[];
  activities: PersonnelActivity[];
}

const PersonnelSchedule: React.FC<PersonnelScheduleProps> = ({ personnel, activities }) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedPerson, setSelectedPerson] = useState<string>('all');
  const [schedules, setSchedules] = useState<PersonnelScheduleEntry[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  const weekStart = useMemo(
    () => startOfWeek(currentWeek, { weekStartsOn: 1 }),
    [currentWeek]
  );
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  useEffect(() => {
    const fetchSchedules = async () => {
      if (!personnel.length) {
        setSchedules([]);
        return;
      }

      try {
        setLoadingSchedules(true);

        const start = format(weekStart, 'yyyy-MM-dd');
        const end = format(weekEnd, 'yyyy-MM-dd');
        const personnelIds = selectedPerson === 'all'
          ? personnel.map((p) => p.id)
          : [selectedPerson];

        let query = supabase
          .from('personnel_schedules')
          .select('*')
          .gte('date', start)
          .lte('date', end);

        if (personnelIds.length) {
          query = query.in('personnel_id', personnelIds);
        }

        const { data, error } = await query;

        if (error) throw error;

        setSchedules(data || []);
      } catch (err) {
        console.error('Error fetching schedules:', err);
        toast.error('Erreur lors du chargement du planning');
      } finally {
        setLoadingSchedules(false);
      }
    };

    fetchSchedules();
  }, [personnel, selectedPerson, weekStart, weekEnd]);

  const schedulesByPerson = useMemo(() => {
    return schedules.reduce((acc, schedule) => {
      if (!schedule.personnel_id) return acc;
      if (!acc[schedule.personnel_id]) {
        acc[schedule.personnel_id] = {};
      }
      acc[schedule.personnel_id][schedule.date] = schedule;
      return acc;
    }, {} as Record<string, Record<string, PersonnelScheduleEntry>>);
  }, [schedules]);

  const activitiesByPerson = useMemo(() => {
    return activities.reduce((acc, activity) => {
      if (!activity.personnel_id || !activity.start_time) return acc;

      const dayKey = format(parseISO(activity.start_time), 'yyyy-MM-dd');

      if (!acc[activity.personnel_id]) {
        acc[activity.personnel_id] = {};
      }
      if (!acc[activity.personnel_id][dayKey]) {
        acc[activity.personnel_id][dayKey] = [];
      }

      acc[activity.personnel_id][dayKey].push(activity);
      return acc;
    }, {} as Record<string, Record<string, PersonnelActivity[]>>);
  }, [activities]);

  const getActivityTypeColor = (type: string) => {
    switch (type) {
      case 'preparation':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'delivery':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pickup':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'maintenance':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'meeting':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'training':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'service':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredPersonnel = selectedPerson === 'all'
    ? personnel
    : personnel.filter((p) => p.id === selectedPerson);

  const formatScheduleTimeRange = (schedule?: PersonnelScheduleEntry) => {
    if (!schedule || !schedule.start_time || !schedule.end_time) {
      return null;
    }

    const startTime = format(parseISO(`${schedule.date}T${schedule.start_time}`), 'HH:mm');
    const endTime = format(parseISO(`${schedule.date}T${schedule.end_time}`), 'HH:mm');

    return `${startTime} - ${endTime}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Planning du Personnel</h2>
          <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Ajouter Créneau
          </button>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-lg font-medium">
                {format(weekStart, 'dd MMMM yyyy', { locale: fr })} - {format(weekEnd, 'dd MMMM yyyy', { locale: fr })}
              </span>
              <button
                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              {loadingSchedules && (
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              )}
            </div>
          </div>

          <div>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
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
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                  Personnel
                </th>
                {weekDays.map((day) => (
                  <th key={day.toISOString()} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                    <div>
                      <div>{format(day, 'EEEE', { locale: fr })}</div>
                      <div className="font-normal text-gray-400">{format(day, 'dd/MM')}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPersonnel.map((person) => (
                <tr key={person.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <img
                        className="h-10 w-10 rounded-full object-cover"
                        src={person.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100'}
                        alt=""
                      />
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {person.first_name} {person.last_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {person.role === 'manager' ? 'Manager'
                            : person.role === 'technician' ? 'Technicien'
                            : person.role === 'driver' ? 'Chauffeur'
                            : person.role === 'commercial' ? 'Commercial'
                            : person.role === 'accountant' ? 'Comptable'
                            : 'Admin'}
                        </div>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const dayKey = format(day, 'yyyy-MM-dd');
                    const schedule = schedulesByPerson[person.id]?.[dayKey];
                    const dayActivities = (activitiesByPerson[person.id]?.[dayKey] || [])
                      .slice()
                      .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime());

                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const hasWorkingSchedule = !!(schedule && schedule.is_working_day);
                    const hasActivities = dayActivities.length > 0;
                    const hasConflict = !!(schedule && !schedule.is_working_day && hasActivities);
                    const isRestDay = !hasWorkingSchedule && !hasActivities;
                    const scheduleTimeRange = formatScheduleTimeRange(schedule);

                    return (
                      <td key={day.toISOString()} className={`px-3 py-4 text-sm ${isWeekend ? 'bg-gray-50' : ''}`}>
                        {isRestDay ? (
                          <div className="text-center text-gray-400 text-xs space-y-1">
                            <div>{isWeekend ? 'Week-end' : 'Repos'}</div>
                            {schedule?.notes && (
                              <div className="text-[11px] text-gray-500">{schedule.notes}</div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {hasWorkingSchedule && scheduleTimeRange && (
                              <div className="flex items-center justify-center space-x-1 text-xs text-gray-600 bg-gray-100 rounded px-2 py-1">
                                <Clock className="h-3 w-3" />
                                <span>{scheduleTimeRange}</span>
                              </div>
                            )}

                            {hasConflict && (
                              <div className="flex items-center space-x-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Activités prévues malgré un jour de repos</span>
                              </div>
                            )}

                            {!hasWorkingSchedule && hasActivities && !hasConflict && (
                              <div className="text-center text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                                Activités planifiées
                              </div>
                            )}

                            {schedule?.notes && hasWorkingSchedule && (
                              <div className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-1">
                                {schedule.notes}
                              </div>
                            )}

                            {dayActivities.map((activity) => {
                              const startTimeLabel = format(parseISO(activity.start_time), 'HH:mm');
                              const endTimeLabel = activity.end_time
                                ? format(parseISO(activity.end_time), 'HH:mm')
                                : null;
                              const timeLabel = endTimeLabel ? `${startTimeLabel} - ${endTimeLabel}` : startTimeLabel;

                              return (
                                <div
                                  key={activity.id}
                                  className={`text-xs p-2 rounded border ${getActivityTypeColor(activity.type)}`}
                                >
                                  <div className="font-medium">{timeLabel}</div>
                                  <div className="truncate" title={activity.title}>
                                    {activity.title}
                                  </div>
                                  {activity.location && (
                                    <div className="text-[11px] text-gray-600 truncate">
                                      {activity.location}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Légende des activités</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-200 border border-blue-300 rounded" />
            <span className="text-xs text-gray-600">Préparation</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-200 border border-green-300 rounded" />
            <span className="text-xs text-gray-600">Livraison</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-orange-200 border border-orange-300 rounded" />
            <span className="text-xs text-gray-600">Récupération</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-purple-200 border border-purple-300 rounded" />
            <span className="text-xs text-gray-600">Maintenance</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-200 border border-gray-300 rounded" />
            <span className="text-xs text-gray-600">Réunion</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-200 border border-yellow-300 rounded" />
            <span className="text-xs text-gray-600">Formation</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-teal-200 border border-teal-300 rounded" />
            <span className="text-xs text-gray-600">Prestation</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonnelSchedule;
