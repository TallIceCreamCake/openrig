export interface Warehouse {
  id: string;
  name: string;
  address: string;
  created_at: string;
  color?: string | null;
}

export interface WarehouseStock {
  id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_type: string;
  quantity: number;
  status: 'available' | 'in_use' | 'maintenance' | 'broken';
}
