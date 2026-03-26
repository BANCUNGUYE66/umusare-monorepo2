-- Expand trip status lifecycle to support swipe flow.
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE trips ADD CONSTRAINT trips_status_check
  CHECK (status IN ('pending', 'active', 'arrived', 'ongoing', 'completed', 'cancelled'));
