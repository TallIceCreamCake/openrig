export type EventType =
  | 'task'
  | 'meeting'
  | 'reminder'
  | 'rental'
  | 'service'
  | 'sale'
  | 'delivery'
  | 'appointment'
  | 'return_delivery'
  | 'return_appointment'
  | 'maintenance';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  start_date: string;
  end_date: string;
  color?: string;
  rental_id?: string;
  service_id?: string;
  maintenance_id?: string;
  vehicle_id?: string;
  resource_label?: string;
}
