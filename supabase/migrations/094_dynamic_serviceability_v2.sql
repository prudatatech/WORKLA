-- ==============================================================
-- DYNAMIC SERVICEABILITY & DISPATCH
-- Purpose: Allow bookings based on online provider proximity, 
--          even if not in a static service zone.
-- ==============================================================

-- 1. Add index to provider_locations for faster distance queries if not using GEOGRAPHY
CREATE INDEX IF NOT EXISTS idx_provider_locations_lat_lng ON public.provider_locations (latitude, longitude);

-- 2. Update is_location_in_service_zone to be provider-aware
CREATE OR REPLACE FUNCTION public.is_location_in_service_zone(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Check static Service Zones
    IF EXISTS (
        SELECT 1 
        FROM public.service_zones 
        WHERE status = 'active' 
          AND ST_Contains(boundary, ST_SetSRID(ST_Point(p_lng, p_lat), 4326))
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. Check for Online Providers nearby (default 10km radius if not specified)
    RETURN EXISTS (
        SELECT 1
        FROM public.provider_details pd
        JOIN public.provider_locations pl ON pd.provider_id = pl.provider_id
        WHERE pd.is_online = true
          AND pd.verification_status = 'verified'
          AND pl.recorded_at > (NOW() - INTERVAL '30 minutes') -- Relaxed from 5m for testing/variability
          AND (
              -- If custom polygon set
              (pd.service_area IS NOT NULL AND ST_Contains(pd.service_area, ST_SetSRID(ST_Point(p_lng, p_lat), 4326)))
              OR
              -- Otherwise use radius (converted km to meters for ST_DWithin geography)
              (pd.service_area IS NULL AND 
               ST_DWithin(
                   ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326)::geography,
                   ST_SetSRID(ST_Point(p_lng, p_lat), 4326)::geography,
                   pd.service_radius_km * 1000
               ))
          )
    );
END;
$$;

-- 3. Update dispatch_job to allow dispatching even if no static zone exists
CREATE OR REPLACE FUNCTION public.dispatch_job(p_booking_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking          RECORD;
    v_provider         RECORD;
    v_inserted         INTEGER := 0;
    v_cust_lat         DOUBLE PRECISION;
    v_cust_lng         DOUBLE PRECISION;
    v_zone_id          UUID;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Defaults if null
    v_cust_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_cust_lng := COALESCE(v_booking.customer_longitude, 78.0081);

    -- Determine Zone if not set
    v_zone_id := v_booking.service_zone_id;
    IF v_zone_id IS NULL THEN
        SELECT id INTO v_zone_id 
        FROM public.service_zones 
        WHERE status = 'active' 
          AND ST_Contains(boundary, ST_SetSRID(ST_Point(v_cust_lng, v_cust_lat), 4326))
        LIMIT 1;
        
        -- Update booking with zone for future reference
        IF v_zone_id IS NOT NULL THEN
            UPDATE public.bookings SET service_zone_id = v_zone_id WHERE id = p_booking_id;
        END IF;
        -- NOTE: We no longer RETURN 0 if v_zone_id is NULL. 
        -- We proceed to provider proximity check.
    END IF;

    FOR v_provider IN
        SELECT * FROM (
            SELECT
                pd.provider_id AS user_id,
                pl.latitude,
                pl.longitude,
                (6371 * acos(
                    LEAST(1.0, GREATEST(-1.0, 
                        cos(radians(v_cust_lat)) * cos(radians(pl.latitude)) *
                        cos(radians(pl.longitude) - radians(v_cust_lng)) +
                        sin(radians(v_cust_lat)) * sin(radians(pl.latitude))
                    ))
                )) AS distance_km
            FROM public.provider_details pd
            JOIN public.provider_locations pl ON pl.provider_id = pd.provider_id
            JOIN public.provider_services ps ON ps.provider_id = pd.provider_id 
            WHERE pd.is_online = TRUE
              AND pd.verification_status = 'verified'
              AND ps.subcategory_id = v_booking.subcategory_id
              AND ps.is_active = TRUE
              AND pl.recorded_at > (NOW() - INTERVAL '60 minutes')
        ) sub
        WHERE sub.distance_km < 25  -- Standard dispatch radius
        ORDER BY sub.distance_km ASC
        LIMIT 10
    LOOP
        INSERT INTO public.job_offers (booking_id, provider_id, distance_km, expires_at, status)
        VALUES (p_booking_id, v_provider.user_id, v_provider.distance_km, NOW() + INTERVAL '30 minutes', 'pending')
        ON CONFLICT (booking_id, provider_id) DO UPDATE 
            SET status = 'pending', 
                expires_at = NOW() + INTERVAL '30 minutes',
                distance_km = EXCLUDED.distance_km;
        
        v_inserted := v_inserted + 1;
    END LOOP;

    -- Update booking status to searching
    IF v_inserted > 0 THEN
        UPDATE public.bookings 
        SET status = 'searching', updated_at = NOW() 
        WHERE id = p_booking_id AND (status = 'requested' OR status = 'searching');
    END IF;

    RETURN v_inserted;
END;
$$;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Dynamic Serviceability & Dispatch v2 Deployed ✅' AS result;
