-- When tier/distance ranking returns no candidate (v_top IS NULL), allow the
-- authenticated user to accept if their profile is a driver. Fixes "No eligible
-- online drivers for matching" when is_online/role filtering empties the pool.

CREATE OR REPLACE FUNCTION public.accept_trip_with_priority(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_top uuid;
  any_online boolean;
  is_driver boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE lower(p.role::text) = 'driver'
      AND p.is_online = true
  )
  INTO any_online;

  SELECT ranked.id INTO v_top
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
      AND (p.is_online = true OR NOT COALESCE(any_online, false))
  ) ranked
  WHERE ranked.rn = 1;

  IF v_top IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = v_uid
        AND lower(p.role::text) = 'driver'
    )
    INTO is_driver;
    IF is_driver THEN
      v_top := v_uid;
    END IF;
  END IF;

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
