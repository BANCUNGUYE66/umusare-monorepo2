-- Allow 'cancelled' status in trips table
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New query → Paste & Run

ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE trips ADD CONSTRAINT trips_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'cancelled'));
