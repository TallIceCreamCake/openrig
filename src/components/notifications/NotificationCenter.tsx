import React from 'react';
import { createPortal } from 'react-dom';
import { X, Bell, Check, Trash2, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Notification } from '../../types/notification';
import NotificationItem from './NotificationItem';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAll,
}) => {
  const navigate = useNavigate();

  const groupNotificationsByDate = (notifications: Notification[]) => {
    const groups: { [key: string]: Notification[] } = {};
    notifications.forEach(notification => {
      const date = new Date(notification.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      let dateKey: string;
      if (date.toDateString() === today.toDateString()) {
        dateKey = "Aujourd'hui";
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = "Hier";
      } else {
        dateKey = formatDistanceToNow(date, { addSuffix: true, locale: fr });
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(notification);
    });
    return groups;
  };

  const groupedNotifications = groupNotificationsByDate(notifications);

  // Rendered in a portal: the glass topbar (backdrop-filter) would otherwise
  // become the containing block of these fixed elements and trap their z-index
  // in its stacking context.
  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black z-[12000]"
        style={{
          opacity: isOpen ? 0.2 : 0,
          transition: 'opacity 250ms ease',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-[12010] flex h-full w-[380px] flex-col bg-white dark:bg-gray-900 rounded-l-2xl"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          opacity: isOpen ? 1 : 0,
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 280ms ease',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">Notifications</h2>
              {unreadCount > 0 ? (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</p>
              ) : (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">Tout est lu</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                title="Tout marquer comme lu"
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                title="Tout effacer"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Bell className="h-6 w-6 text-gray-300 dark:text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Aucune notification</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Vous êtes à jour !</p>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(groupedNotifications).map(([dateGroup, groupNotifications]) => (
                <div key={dateGroup}>
                  <div className="px-5 py-2 sticky top-0 bg-white dark:bg-gray-900 z-10">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {dateGroup}
                    </span>
                  </div>
                  <div>
                    {groupNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={markAsRead}
                        onDelete={deleteNotification}
                        onClose={onClose}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3">
          <button
            type="button"
            onClick={() => { onClose(); navigate('/settings?tab=notifications'); }}
            className="w-full flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Paramètres des notifications
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default NotificationCenter;
