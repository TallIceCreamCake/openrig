import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notification, NotificationType } from '../types/notification';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { NotificationToast } from '../components/notifications/NotificationToast';
import { useAuth } from '../context/AuthContext';

export type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  avatar?: string | null;
  recipientId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type SupabaseNotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  action_label: string | null;
  avatar: string | null;
  recipient_id: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

const NOTIFICATION_POLL_INTERVAL_MS = 15_000;

const mapRowToNotification = (row: SupabaseNotificationRow): Notification => ({
  id: row.id,
  type: (row.type as NotificationType) || 'info',
  title: row.title,
  message: row.message,
  timestamp: row.created_at,
  read: !!row.read,
  recipientId: row.recipient_id ?? undefined,
  actionUrl: row.action_url || undefined,
  actionLabel: row.action_label || undefined,
  avatar: row.avatar || undefined,
  metadata: row.metadata ?? undefined,
});

const showNotificationToast = (notification: Notification) => {
  toast.custom(
    (t) =>
      createElement(NotificationToast, {
        notification,
        toastId: t.id,
        visible: t.visible,
      }),
    { duration: 5000 },
  );
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const initialLoadRef = useRef(false);
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const pollingRef = useRef<number | null>(null);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [notifications],
  );

  const fetchNotifications = useCallback(async () => {
    if (!currentUserId) {
      setNotifications([]);
      initialLoadRef.current = false;
      return;
    }
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', currentUserId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: Notification[] = (data || []).map((row: SupabaseNotificationRow) =>
        mapRowToNotification(row),
      );
      setNotifications(mapped);
    } catch (error) {
      console.error('Load notifications error', error);
    } finally {
      initialLoadRef.current = true;
    }
  }, [currentUserId]);

  const appendNotification = useCallback(
    (incoming: Notification, { silent = false } = {}) => {
      if (incoming.recipientId && incoming.recipientId !== currentUserId) return;
      setNotifications((prev) => {
        if (prev.some((item) => item.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
      if (!silent && initialLoadRef.current) {
        showNotificationToast(incoming);
      }
    },
    [currentUserId],
  );

  const upsertNotification = useCallback(
    (incoming: Notification) => {
      if (incoming.recipientId && incoming.recipientId !== currentUserId) return;
      setNotifications((prev) => {
        const exists = prev.some((item) => item.id === incoming.id);
        if (exists) {
          return prev.map((item) => (item.id === incoming.id ? incoming : item));
        }
        return [incoming, ...prev];
      });
    },
    [currentUserId],
  );

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!currentUserId) return;
    const channelName = `notifications-feed-${currentUserId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (!payload.new) return;
          appendNotification(mapRowToNotification(payload.new as SupabaseNotificationRow));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (!payload.new) return;
          upsertNotification(mapRowToNotification(payload.new as SupabaseNotificationRow));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (!payload.old?.id) return;
          setNotifications((prev) => prev.filter((item) => item.id !== String(payload.old.id)));
        },
      )
      .subscribe();

    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
    }
    pollingRef.current = window.setInterval(() => {
      void fetchNotifications();
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [appendNotification, currentUserId, fetchNotifications, upsertNotification]);

  const unreadCount = sortedNotifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('recipient_id', currentUserId);
    if (error) { console.error(error); return; }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = async () => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('read', false)
      .eq('recipient_id', currentUserId);
    if (error) { console.error(error); return; }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = async (id: string) => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('recipient_id', currentUserId);
    if (error) { console.error(error); return; }
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = async () => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('recipient_id', currentUserId);
    if (error) { console.error(error); return; }
    setNotifications([]);
  };

  return {
    notifications: sortedNotifications,
    unreadCount,
    isOpen,
    setIsOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    createNotification: async (input: CreateNotificationInput) => {
      if (!currentUserId && !input.recipientId) {
        throw new Error('Cannot create notification without an authenticated user or recipientId');
      }

      const recipientId = input.recipientId ?? currentUserId;
      const payload = {
        type: input.type,
        title: input.title,
        message: input.message,
        action_url: input.actionUrl ?? null,
        action_label: input.actionLabel ?? null,
        avatar: input.avatar ?? null,
        recipient_id: recipientId,
        metadata: input.metadata ?? null,
      };
      const { data, error } = await supabase
        .from('notifications')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      const created = mapRowToNotification(data as SupabaseNotificationRow);
      appendNotification(created, { silent: true });
      return created;
    },
  };
};
