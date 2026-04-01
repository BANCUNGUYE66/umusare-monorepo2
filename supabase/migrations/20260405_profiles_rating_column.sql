-- refresh_driver_tier() and trip rating triggers reference profiles.rating.
-- The initial tier migration added rating_count but not rating — add it here.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating double precision DEFAULT 5.0;

COMMENT ON COLUMN public.profiles.rating IS 'Rolling average from client star ratings (1–5)';
