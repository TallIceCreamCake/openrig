import { supabase } from './supabase';
import type { NotificationType } from '../types/notification';

export type CreateNotificationPayload = {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  avatar?: string | null;
  recipientId: string;
  metadata?: Record<string, unknown> | null;
};

export const createNotification = async (payload: CreateNotificationPayload) => {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      type: payload.type,
      title: payload.title,
      message: payload.message,
      action_url: payload.actionUrl ?? null,
      action_label: payload.actionLabel ?? null,
      avatar: payload.avatar ?? null,
      metadata: payload.metadata ?? null,
      recipient_id: payload.recipientId,
    })
    .select('id')
    .single();
  if (error) {
    throw error;
  }
  return data?.id as string | undefined;
};
