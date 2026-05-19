import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Package,
  Users,
  Calendar,
  X,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Notification, NotificationType } from '../../types/notification';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const typeConfig: Record<NotificationType, { icon: React.ReactNode; bg: string; dot: string }> = {
  success:   { icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,  bg: 'bg-emerald-50 dark:bg-emerald-950/30', dot: 'bg-emerald-500' },
  warning:   { icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,   bg: 'bg-amber-50 dark:bg-amber-950/30',   dot: 'bg-amber-500'   },
  error:     { icon: <XCircle className="h-4 w-4 text-red-500" />,           bg: 'bg-red-50 dark:bg-red-950/30',       dot: 'bg-red-500'     },
  rental:    { icon: <Calendar className="h-4 w-4 text-blue-500" />,         bg: 'bg-blue-50 dark:bg-blue-950/30',     dot: 'bg-blue-500'    },
  equipment: { icon: <Package className="h-4 w-4 text-violet-500" />,        bg: 'bg-violet-50 dark:bg-violet-950/30', dot: 'bg-violet-500'  },
  client:    { icon: <Users className="h-4 w-4 text-indigo-500" />,          bg: 'bg-indigo-50 dark:bg-indigo-950/30', dot: 'bg-indigo-500'  },
  info:      { icon: <Bell className="h-4 w-4 text-gray-400" />,             bg: 'bg-gray-50 dark:bg-gray-800',        dot: 'bg-gray-400'    },
};

const getConfig = (type: NotificationType) => typeConfig[type] ?? typeConfig.info;

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onDelete,
  onClose,
}) => {
  const config = getConfig(notification.type);

  const handleClick = () => {
    if (!notification.read) onMarkAsRead(notification.id);
  };

  const handleActionClick = () => {
    onClose();
    if (!notification.read) onMarkAsRead(notification.id);
  };

  return (
    <div
      className={`group relative flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
        notification.read
          ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
          : 'bg-blue-50/40 dark:bg-blue-950/10 hover:bg-blue-50/70 dark:hover:bg-blue-950/20'
      }`}
      onClick={handleClick}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className={`absolute left-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${config.dot} flex-shrink-0`} />
      )}

      {/* Icon */}
      <div className={`h-8 w-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 ${config.bg}`}>
        {notification.avatar ? (
          <img src={notification.avatar} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          config.icon
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-6">
        <p className={`text-xs font-semibold leading-tight ${notification.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {notification.title}
        </p>
        <p className={`text-xs mt-0.5 leading-snug ${notification.read ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {notification.message}
        </p>
        {notification.metadata?.amount && (
          <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
            {notification.metadata.amount} €
          </span>
        )}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-600">
            {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true, locale: fr })}
          </span>
          {notification.actionUrl && notification.actionLabel && (
            <Link
              to={notification.actionUrl}
              onClick={handleActionClick}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {notification.actionLabel}
              <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
        className="absolute top-3 right-3 p-1 rounded-md text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

export default NotificationItem;
