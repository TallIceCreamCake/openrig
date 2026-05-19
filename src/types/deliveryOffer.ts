export type DeliveryPricingType = 'per_km' | 'per_hour' | 'fixed' | 'per_day' | 'per_trip';

export interface DeliveryOffer {
  id: string;
  name: string;
  description?: string | null;
  pricing_type: DeliveryPricingType;
  rate_amount: number;
  base_amount: number;
  is_active: boolean;
  created_at: string;
}
