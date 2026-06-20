export type ClientType = 'person' | 'company';

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  billing_address?: string | null;
  default_delivery_address?: string | null;
  internal_notes?: string | null;
  tags?: string[];
  client_number?: number | null;
  default_equipment_discount?: number | null;
  financial_conditions?: string[];
  vat_number?: string | null;
  siret?: string | null;
  legal_form?: string | null;
  share_capital?: number | null;
  rcs_number?: string | null;
  trust_score?: number | null;
  trust_score_computed_at?: string | null;
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
