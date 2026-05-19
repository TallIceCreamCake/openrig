export type VehicleStatus = 'active' | 'maintenance' | 'retired';

export interface Vehicle {
  id: string;
  name: string;
  license_plate: string;
  color?: string | null;
  make?: string | null;
  model?: string | null;
  model_year?: number | null;
  capacity_weight_kg?: number | null;
  capacity_volume_m3?: number | null;
  odometer_km?: number | null;
  acquisition_date?: string | null; // ISO date
  status: VehicleStatus;
  notes?: string | null;
  created_at: string;
}
