export interface Profile {
  id: string;
  role: 'driver' | 'client';
  full_name?: string;
  phone?: string;
  rating?: number;
  verification_status?: string;
  language_tags?: string[];
  email?: string;
  car_model?: string;
  plate_number?: string;
}

export interface Trip {
  id: string;
  client_id: string;
  driver_id?: string;
  status: string;
  base_fee: number;
  client_lat?: number;
  client_lng?: number;
  destination_lat?: number;
  destination_lng?: number;
  created_at?: string;
}
