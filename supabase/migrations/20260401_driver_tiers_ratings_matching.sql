-- Driver tiers (Normal / Silver / Gold / Diamond), ratings, and priority matching
-- Run in Supabase SQL editor if migrations are not applied automatically.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profile columns for tiers, stats, and online presence (uses location_lat/lng for map + matching)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS driver_tier text NOT NULL DEFAULT 'normal'
    CHECK (driver_tier IN ('normal', 'silver', 'gold', 'diamond'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS completed_trips_count integer NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rating double precision DEFAULT 5.0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_lat double precision;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_lng double precision;

-- One client rating per completed trip
CREATE TABLE IF NOT EXISTS trip_ratings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stars smallint NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id)
);

CREATE INDEX IF NOT EXISTS trip_ratings_driver_id_created_at_idx
  ON trip_ratings (driver_id, created_at DESC);

-- Recompute tier from completed trips + average rating (new drivers treated as 5.0 until rated)
CREATE OR REPLACE FUNCTION public.refresh_driver_tier(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trips_done integer;
  r numeric;
BEGIN
  SELECT completed_trips_count, rating
  INTO trips_done, r
  FROM profiles
  WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  trips_done := COALESCE(trips_done, 0);
  r := COALESCE(r, 5.0);

  UPDATE profiles
  SET driver_tier = CASE
    WHEN trips_done >= 300 AND r >= 4.8 THEN 'diamond'
    WHEN trips_done >= 100 AND r >= 4.5 THEN 'gold'
    WHEN trips_done >= 20 AND r >= 4.0 THEN 'silver'
    ELSE 'normal'
  END
  WHERE id = p_driver_id;
END;
$$;

-- When a trip is marked completed, count it for the driver and refresh tier
CREATE OR REPLACE FUNCTION public.on_trip_completed_bump_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE profiles
  SET completed_trips_count = COALESCE(completed_trips_count, 0) + 1
  WHERE id = NEW.driver_id;

  PERFORM public.refresh_driver_tier(NEW.driver_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_completed_stats ON trips;
CREATE TRIGGER trips_completed_stats
  AFTER INSERT OR UPDATE OF status ON trips
  FOR EACH ROW
  EXECUTE PROCEDURE public.on_trip_completed_bump_stats();

-- Apply a new star rating to the driver's rolling average
CREATE OR REPLACE FUNCTION public.on_trip_rating_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_avg numeric;
  old_n integer;
  new_n integer;
  new_avg numeric;
BEGIN
  SELECT rating, rating_count INTO old_avg, old_n FROM profiles WHERE id = NEW.driver_id FOR UPDATE;
  old_n := COALESCE(old_n, 0);
  old_avg := COALESCE(old_avg, 0);
  new_n := old_n + 1;
  new_avg := (old_avg * old_n + NEW.stars::numeric) / new_n;

  UPDATE profiles
  SET
    rating_count = new_n,
    rating = new_avg
  WHERE id = NEW.driver_id;

  PERFORM public.refresh_driver_tier(NEW.driver_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_ratings_apply ON trip_ratings;
CREATE TRIGGER trip_ratings_apply
  AFTER INSERT ON trip_ratings
  FOR EACH ROW
  EXECUTE PROCEDURE public.on_trip_rating_insert();

-- True if the current driver is the top-ranked online driver for this pickup (tier, then distance)
CREATE OR REPLACE FUNCTION public.driver_may_see_pending_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT p.id,
        row_number() OVER (
          ORDER BY
            CASE COALESCE(p.driver_tier, 'normal')
              WHEN 'diamond' THEN 4
              WHEN 'gold' THEN 3
              WHEN 'silver' THEN 2
              ELSE 1
            END DESC,
            CASE
              WHEN p.location_lat IS NULL OR p.location_lng IS NULL
                OR t.client_lat IS NULL OR t.client_lng IS NULL
              THEN 999999::double precision
              ELSE (
                6371 * acos(
                  LEAST(
                    1.0,
                    GREATEST(
                      -1.0,
                      cos(radians(p.location_lat)) * cos(radians(t.client_lat)) *
                      cos(radians(t.client_lng) - radians(p.location_lng)) +
                      sin(radians(p.location_lat)) * sin(radians(t.client_lat))
                    )
                  )
                )
              )
            END ASC
        ) AS rn
      FROM profiles p
      INNER JOIN trips t ON t.id = p_trip_id
      WHERE lower(p.role::text) = 'driver'
        AND p.is_online = true
    ) ranked
    WHERE ranked.rn = 1
      AND ranked.id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.list_my_visible_pending_trips()
RETURNS SETOF trips
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.*
  FROM trips t
  WHERE t.status = 'pending'
    AND public.driver_may_see_pending_trip(t.id);
$$;

-- Accept only if this driver wins the priority queue for the trip
CREATE OR REPLACE FUNCTION public.accept_trip_with_priority(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_top uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_top
  FROM (
    SELECT p.id,
      row_number() OVER (
        ORDER BY
          CASE COALESCE(p.driver_tier, 'normal')
            WHEN 'diamond' THEN 4
            WHEN 'gold' THEN 3
            WHEN 'silver' THEN 2
            ELSE 1
          END DESC,
          CASE
            WHEN p.location_lat IS NULL OR p.location_lng IS NULL
              OR t.client_lat IS NULL OR t.client_lng IS NULL
            THEN 999999::double precision
            ELSE (
              6371 * acos(
                LEAST(
                  1.0,
                  GREATEST(
                    -1.0,
                    cos(radians(p.location_lat)) * cos(radians(t.client_lat)) *
                    cos(radians(t.client_lng) - radians(p.location_lng)) +
                    sin(radians(p.location_lat)) * sin(radians(t.client_lat))
                  )
                )
              )
            )
          END ASC
      ) AS rn
    FROM profiles p
    INNER JOIN trips t ON t.id = p_trip_id
    WHERE lower(p.role::text) = 'driver'
      AND p.is_online = true
  ) ranked
  WHERE ranked.rn = 1;

  IF v_top IS NULL THEN
    RAISE EXCEPTION 'No eligible online drivers for matching';
  END IF;

  IF v_top <> v_uid THEN
    RAISE EXCEPTION 'A higher-priority driver is first in line for this trip';
  END IF;

  UPDATE trips
  SET status = 'active', driver_id = v_uid
  WHERE id = p_trip_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip is no longer available';
  END IF;
END;
$$;

-- Client submits 1–5 stars after the ride (validates trip ownership)
CREATE OR REPLACE FUNCTION public.submit_trip_rating(p_trip_id uuid, p_stars integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_driver uuid;
BEGIN
  IF p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'Stars must be between 1 and 5';
  END IF;

  SELECT client_id, driver_id INTO v_client, v_driver
  FROM trips
  WHERE id = p_trip_id;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF v_client <> auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to rate this trip';
  END IF;

  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'No driver on this trip';
  END IF;

  INSERT INTO trip_ratings (trip_id, client_id, driver_id, stars)
  VALUES (p_trip_id, auth.uid(), v_driver, p_stars)
  ON CONFLICT (trip_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_may_see_pending_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_visible_pending_trips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_trip_with_priority(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_trip_rating(uuid, integer) TO authenticated;

ALTER TABLE trip_ratings ENABLE ROW LEVEL SECURITY;

-- Drivers can read their own ratings; clients can read ratings they created
CREATE POLICY trip_ratings_select_own
  ON trip_ratings FOR SELECT
  TO authenticated
  USING (client_id = auth.uid() OR driver_id = auth.uid());
