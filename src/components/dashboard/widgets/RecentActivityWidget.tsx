import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, ClipboardList, Construction, Projector, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '../../../context/TranslationContext';

interface ActivityItem {
  id: string;
  type: 'rental_created' | 'rental_completed' | 'equipment_added' | 'client_added' | 'maintenance';
  title: string;
  description: string;
  timestamp: string;
  actionUrl?: string;
  avatar?: string;
  color?: string | null;
}

interface RecentActivityWidgetProps {
  activities: ActivityItem[];
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'rental_created':
    case 'rental_completed':
      return ClipboardList;
    case 'equipment_added':
      return Projector;
    case 'client_added':
      return Users;
    case 'maintenance':
      return Construction;
    default:
      return Activity;
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'rental_created':
      return 'text-blue-500 bg-blue-100';
    case 'rental_completed':
      return 'text-green-500 bg-green-100';
    case 'equipment_added':
      return 'text-purple-500 bg-purple-100';
    case 'client_added':
      return 'text-indigo-500 bg-indigo-100';
    case 'maintenance':
      return 'text-yellow-500 bg-yellow-100';
    default:
      return 'text-gray-500 bg-gray-100';
  }
};

const isProjectActivity = (type: string) => type === 'rental_created' || type === 'rental_completed';

const getProjectAccent = (inputColor?: string | null) => {
  const baseColor = typeof inputColor === 'string' && inputColor.trim().length > 0
    ? inputColor.trim()
    : '#3B82F6';

  const match = baseColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    return {
      iconColor: baseColor,
      backgroundColor: 'rgba(59, 130, 246, 0.18)',
    };
  }

  const raw = match[1];
  const hex = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return {
    iconColor: baseColor,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
  };
};

const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({ activities }) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? enUS : fr;
  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-shrink-0 mb-4">
        <h3 className="text-sm font-medium text-gray-700">{t('dashboard.widgets.recentActivity.heading')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {activities.length === 0 ? (
          <div className="text-center py-4">
            <Activity className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{t('dashboard.widgets.recentActivity.empty')}</p>
          </div>
        ) : (
          activities.map((activity) => {
            const Icon = getActivityIcon(activity.type);
            const colorClass = getActivityColor(activity.type);
            const projectAccent = isProjectActivity(activity.type) ? getProjectAccent(activity.color) : null;
            
            const content = (
              <div className="flex items-start space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                <div
                  className={`p-2 rounded-full ${projectAccent ? '' : colorClass}`}
                  style={projectAccent ? { backgroundColor: projectAccent.backgroundColor } : undefined}
                >
                  <Icon
                    className="h-4 w-4"
                    style={projectAccent ? { color: projectAccent.iconColor } : undefined}
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {activity.title}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {activity.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(activity.timestamp), { 
                      addSuffix: true, 
                      locale 
                    })}
                  </p>
                </div>
                
                {activity.avatar && (
                  <img
                    src={activity.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                )}
              </div>
            );
            
            return activity.actionUrl ? (
              <Link key={activity.id} to={activity.actionUrl}>
                {content}
              </Link>
            ) : (
              <div key={activity.id}>
                {content}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RecentActivityWidget;
