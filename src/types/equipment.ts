export type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'broken';

export interface Equipment {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  rental_price_ht: number;
  rental_price_ttc: number;
  status: EquipmentStatus;
  inventory_category: 'series' | 'vrac' | 'consommable';
  image_url: string | null;
  description?: string | null;
  serial_number?: string | null;
  purchase_date?: string | null;
  purchase_price?: number;
  created_at?: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  internal_location?: string | null;
  qr_code_value?: string | null;
  qr_code_url?: string | null;
  qr_code_generated_at?: string | null;
  maintenance_count?: number;
  total_units?: number;
  custom_status_id?: string | null;
  unit_weight_kg?: number | null;
  unit_volume_m3?: number | null;
  is_public?: boolean;
}

export interface EquipmentStock {
  id: string;
  equipment_id: string;
  warehouse_id: string;
  quantity: number;
}
