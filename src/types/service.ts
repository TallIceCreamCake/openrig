export type ServiceCategory = 'personnel' | 'insurance' | 'other';

export type ServiceStatus = 'active' | 'pending' | 'expired' | 'cancelled';

export interface ServiceRecord {
  id: string;
  category: ServiceCategory;
  title: string;
  cost_per_person: number | null;
  price: number | null;
  provider: string | null;
  coverage: string[] | null;
  start_date: string | null;
  end_date: string | null;
  amount_per_day: number | null;
  category_id: string | null;
  subcategory_id: string | null;
  status: ServiceStatus;
  proof_file_url: string | null;
  proof_file_name: string | null;
  proof_file_type: string | null;
  proof_file_size: number | null;
  notes: string | null;
  created_at: string;
}
