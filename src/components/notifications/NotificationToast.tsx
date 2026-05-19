import { Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { Notification } from '../../types/notification';

type NotificationToastProps = {
  notification: Notification;
  toastId: string;
  visible: boolean;
};

export const NotificationToast = ({ notification, toastId, visible }: NotificationToastProps) => (
  <div
    className={`pointer-events-auto w-[320px] rounded-xl border border-slate-200 bg-white p-4 shadow-lg transition-all duration-300 ${
      visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
    }`}
  >
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Bell className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
        <p className="mt-1 text-sm text-gray-600 line-clamp-2">{notification.message}</p>
        {notification.actionUrl && notification.actionLabel && (
          <Link
            to={notification.actionUrl}
            onClick={() => toast.dismiss(toastId)}
            className="mt-2 inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {notification.actionLabel}
          </Link>
        )}
      </div>
      <button
        onClick={() => toast.dismiss(toastId)}
        className="ml-2 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);
