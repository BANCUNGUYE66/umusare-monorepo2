-- Wallet + transactions setup for trip lifecycle settlement
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS transactions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  driver_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,
  amount_gross numeric NOT NULL DEFAULT 0,
  commission_fee numeric NOT NULL DEFAULT 0,
  amount_net numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'credit' CHECK (type IN ('credit', 'debit')),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_driver_id_created_at_idx
  ON transactions (driver_id, created_at DESC);
