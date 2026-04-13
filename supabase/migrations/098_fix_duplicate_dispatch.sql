-- ==============================================================
-- FIX: Stop dispatching jobs that are already confirmed.
-- When the Railway worker restarts, it claims stale Redis events
-- from 5+ minutes ago. It was calling dispatch_job on bookings
-- that were ALREADY accepted by the provider, causing a duplicate
-- popup on the provider's screen that fails with "Booking no longer available".
-- ==============================================================

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
    
    -- IMPORTANT FIX: Do NOT dispatch if the booking is already handled!
    IF NOT FOUND OR v_booking.status NOT IN ('requested', 'searching') THEN
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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Dispatch duplicate fix deployed ✅' AS result;
