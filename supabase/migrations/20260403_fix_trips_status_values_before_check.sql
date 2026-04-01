-- Fix invalid trip status values so trips_status_check can be applied.
-- Run this if you see: check constraint "trips_status_check" ... violated by some row

-- Optional: inspect bad rows first (run in SQL Editor):
-- SELECT status, count(*) FROM trips GROUP BY status ORDER BY count(*) DESC;

-- Normalize casing / whitespace
UPDATE trips
SET status = lower(trim(status))
WHERE status IS NOT NULL;

-- Map common legacy values (add more if your DB has others)
UPDATE trips
SET status = 'cancelled'
WHERE status IN ('canceled', 'cancel', 'void');

UPDATE trips
SET status = 'completed'
WHERE status IN ('done', 'complete', 'finished', 'ended');

UPDATE trips
SET status = 'pending'
WHERE status IN ('waiting', 'requested', 'open');

UPDATE trips
SET status = 'active'
WHERE status IN ('accepted', 'assigned', 'in_progress', 'in progress');

-- Empty string → cancelled
UPDATE trips
SET status = 'cancelled'
WHERE status = '';

-- NULL → cancelled (or use 'pending' if you prefer)
UPDATE trips
SET status = 'cancelled'
WHERE status IS NULL;

-- Anything still not allowed → cancelled (safe default)
UPDATE trips
SET status = 'cancelled'
WHERE status NOT IN (
  'pending',
  'active',
  'arrived',
  'ongoing',
  'completed',
  'cancelled'
);

ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE trips ADD CONSTRAINT trips_status_check
  CHECK (status IN ('pending', 'active', 'arrived', 'ongoing', 'completed', 'cancelled'));
