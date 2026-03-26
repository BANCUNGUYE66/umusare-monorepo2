-- Add payment confirmation and commission due tracking
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS commission_due numeric DEFAULT 0;

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS final_fare numeric;

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS client_payment_confirmed boolean DEFAULT false;
