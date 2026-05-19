export type ClientType = 'person' | 'company';

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  company?: string;
  image_url?: string;
  created_at: string;
  client_type: ClientType;
  company_client_id?: string | null;
  company_client?: {
    id: string;
    name: string;
  } | null;
}

export type ClientContactType = 'email' | 'phone' | 'social' | 'website' | 'other';

export interface ClientContact {
  id: string;
  client_id: string;
  contact_type: ClientContactType | string;
  title?: string | null;
  value: string;
  position?: number | null;
  created_at: string;
}

export interface ClientRental {
  id: string;
  start_date: string;
  end_date: string;
  total_price: number;
  status: string;
  reference_code?: string | null;
  title?: string | null;
  equipment: Array<{
    name: string;
    quantity: number;
  }>;
}
