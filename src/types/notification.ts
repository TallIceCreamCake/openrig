export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'rental' | 'equipment' | 'client';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  recipientId?: string;
  actionUrl?: string;
  actionLabel?: string;
  avatar?: string;
  metadata?: {
    threadId?: string;
    authorId?: string;
    messageId?: string;
    createdAt?: string;
    clientName?: string;
    equipmentName?: string;
    rentalId?: string;
    amount?: number;
  };
}

export interface NotificationGroup {
  date: string;
  notifications: Notification[];
}
