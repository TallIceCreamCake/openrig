import { parseISO } from 'date-fns';
import type { PersonnelActivity } from '../../types/personnel';

export const DAY_LABEL_FORMAT = 'EEE dd MMM';

export const activityColor = (type: string) => {
  switch ((type || '').toLowerCase()) {
    case 'preparation':
      return 'bg-blue-500/80 border-blue-600 text-white';
    case 'delivery':
      return 'bg-green-500/80 border-green-600 text-white';
    case 'pickup':
      return 'bg-orange-500/80 border-orange-600 text-white';
    case 'maintenance':
      return 'bg-purple-500/80 border-purple-600 text-white';
    case 'training':
      return 'bg-yellow-400/80 border-yellow-500 text-gray-900';
    case 'meeting':
      return 'bg-gray-400/80 border-gray-500 text-gray-900';
    default:
      return 'bg-slate-500/80 border-slate-600 text-white';
  }
};

export const ensureEnd = (activity: PersonnelActivity) => {
  const start = parseISO(activity.start_time);
  if (activity.end_time) return parseISO(activity.end_time);
  if (activity.duration_minutes) {
    return new Date(start.getTime() + activity.duration_minutes * 60 * 1000);
  }
  // default 2h
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
};
