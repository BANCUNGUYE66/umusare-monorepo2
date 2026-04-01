export type DriverTier = 'normal' | 'silver' | 'gold' | 'diamond';

export interface Profile {
  id: string;
  role: 'driver' | 'client';
  full_name?: string;
  phone?: string;
  rating?: number;
  rating_count?: number;
  verification_status?: string;
  language_tags?: string[];
  email?: string;
  car_model?: string;
  plate_number?: string;
  wallet_balance?: number;
  commission_due?: number;
  /** Driver program tier — affects dispatch priority when online */
  driver_tier?: DriverTier | string;
  completed_trips_count?: number;
  is_online?: boolean;
  location_lat?: number;
  location_lng?: number;
}

export interface Trip {
  id: string;
  client_id: string;
  driver_id?: string;
  status: 'pending' | 'active' | 'arrived' | 'ongoing' | 'completed' | 'cancelled' | string;
  base_fee: number;
  final_fare?: number;
  client_payment_confirmed?: boolean;
  client_lat?: number;
  client_lng?: number;
  destination_lat?: number;
  destination_lng?: number;
  created_at?: string;
}

export interface Transaction {
  id: string;
  driver_id: string;
  trip_id: string;
  amount_gross: number;
  commission_fee: number;
  amount_net: number;
  type: 'credit' | 'debit';
  created_at?: string;
}
