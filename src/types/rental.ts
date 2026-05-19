import { DeliveryPricingType } from './deliveryOffer';

export type RentalType = 'rental' | 'service' | 'sale';
export type DiscountType = 'percentage' | 'fixed';
export type RentalStatus = 'pending' | 'confirmed' | 'preparing' | 'in_progress' | 'delivered' | 'return_delivery' | 'in_return' | 'returned' | 'completed' | 'paid' | 'cancelled' | 'archived';
export type RentalReturnStatus = 'pending' | 'in_progress' | 'completed';
export type RentalTaskStatus = 'todo' | 'in_progress' | 'done';
export type RentalTaskListSemanticKey = RentalTaskStatus | null;

export interface RentalItem {
  id: string;
  equipment_id: string | null;
  equipment_name: string;
  equipment_type: string;
  quantity: number;
  price_per_day: number;
  discount_percent?: number;
  group_id?: string | null;
  position?: number;
  is_external?: boolean;
  external_name?: string | null;
  external_type?: string | null;
  external_description?: string | null;
  external_subtype?: string | null;
  external_supplier?: string | null;
}

export interface RentalMaintenanceCharge {
  id: string;
  maintenance_id: string | null;
  label: string;
  amount: number;
  maintenance_title?: string;
  maintenance_status?: string;
}

export interface RentalReturnItem {
  id: string;
  equipment_id: string | null;
  equipment_name: string;
  equipment_type: string;
  expected_quantity: number;
  returned_quantity: number;
  notes?: string | null;
}

export interface RentalReturn {
  id: string;
  status: RentalReturnStatus;
  started_at?: string | null;
  completed_at?: string | null;
  items: RentalReturnItem[];
}

export interface RentalItemGroup {
  id: string;
  name: string;
  position: number;
  color?: string | null;
  parent_group_id?: string | null;
}

export interface RentalAssignedPersonnel {
  id: string;
  first_name: string;
  last_name: string;
}

export interface RentalPersonnelService {
  id: string;
  service_record_id: string;
  title: string;
  cost_per_person: number | null;
  quantity: number;
  days: number;
  discount_percent: number;
}

export interface RentalInsuranceService {
  id: string;
  service_record_id: string;
  title: string;
  amount_per_day: number | null;
  days: number;
}

export interface RentalOtherService {
  id: string;
  service_record_id: string;
  title: string;
  price: number | null;
  quantity: number;
  days: number;
}

export interface Rental {
  id: string;
  client_id: string;
  client_name: string;
  reference_code?: string | null;
  type: RentalType;
  start_date: string;
  end_date: string;
  usage_start_date?: string | null;
  usage_end_date?: string | null;
  location: string;
  delivery_address?: string | null;
  pickup_address?: string | null;
  delivery_offer_id?: string | null;
  delivery_offer_name?: string | null;
  delivery_pricing_type?: DeliveryPricingType | null;
  delivery_rate_amount?: number | null;
  delivery_base_amount?: number | null;
  delivery_quantity?: number | null;
  delivery_round_trip?: boolean | null;
  delivery_total_amount?: number | null;
  delivered_at?: string | null;
  delivery_confirmation_note?: string | null;
  return_delivery_at?: string | null;
  return_delivery_confirmation_note?: string | null;
  client_represents_company?: boolean | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  cancellation_payment_policy?: string | null;
  cancellation_refund_amount?: number | null;
  status_before_cancellation?: RentalStatus | null;
  status: RentalStatus;
  total_price: number;
  discount_type?: DiscountType;
  discount_value?: number;
  generate_invoice: boolean;
  color?: string;
  description?: string;
  notes?: string | null;
  title?: string | null;
  items: RentalItem[];
  item_groups?: RentalItemGroup[];
  maintenance_charges?: RentalMaintenanceCharge[];
  assigned_personnel?: RentalAssignedPersonnel[];
  personnel_services?: RentalPersonnelService[];
  insurance_services?: RentalInsuranceService[];
  other_services?: RentalOtherService[];
  created_at: string;
  quote_expired_at?: string | null;
  quote_expired_notice_at?: string | null;
  returned_at?: string | null;
  return_info?: RentalReturn | null;
  rental_coefficient_override?: number | null;
}

export interface RentalPersonnelServiceItem {
  service_record_id: string;
  quantity: number;
  days: number;
  discount_percent?: number;
}

export type RentalCreatePayload = Partial<Rental> & {
  item_groups?: Array<{ id: string; name: string; position: number }>;
  assigned_personnel_ids?: string[];
  vehicle_assignments?: Array<{
    vehicle_id: string;
    delivery_at?: string;
    appointment_at?: string;
    return_delivery_at?: string;
    return_appointment_at?: string;
    driver_personnel_id?: string;
  }>;
  personnel_service_items?: RentalPersonnelServiceItem[];
};

export interface RentalActivityLog {
  id: string;
  rental_id: string;
  actor_id?: string | null;
  actor_name: string;
  action: string;
  details?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface RentalMilestone {
  id: string;
  rental_id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  personnel_ids?: string[];
  vehicle_ids?: string[];
  item_ids?: string[];
  created_at: string;
}

export interface RentalTaskChecklistItem {
  id: string;
  title: string;
  sort_order: number;
  is_completed: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalTask {
  id: string;
  rental_id: string;
  list_id?: string | null;
  sort_order?: number;
  status: RentalTaskStatus;
  title: string;
  description?: string | null;
  image_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  assignee_ids: string[];
  checklist: RentalTaskChecklistItem[];
  created_at: string;
  updated_at: string;
}

export interface RentalTaskList {
  id: string;
  rental_id: string;
  name: string;
  semantic_key?: RentalTaskListSemanticKey;
  color?: string | null;
  sort_order: number;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}
