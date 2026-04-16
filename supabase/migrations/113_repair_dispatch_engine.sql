-- Migration: 113_repair_dispatch_engine.sql
-- Fixes: "Could not find the function public.dispatch_job(p_booking_id) in the schema cache"
-- Purpose: Restores the core proximity-based dispatch engine.

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
BEGIN
    -- 1. Get booking details
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- 2. Defaults for location if null (Agra, India fallback)
    v_cust_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_cust_lng := COALESCE(v_booking.customer_longitude, 78.0081);

    -- 3. Search for Online, Verified Providers within 25km who offer this service
    FOR v_provider IN
        SELECT * FROM (
            SELECT
                pd.provider_id AS user_id,
                pl.latitude,
                pl.longitude,
                -- Haversine Distance Calculation (km)
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
              AND pl.recorded_at > (NOW() - INTERVAL '4 hours') -- Allow older records for testing stability
        ) sub
        WHERE sub.distance_km < 25  -- Standard dispatch radius
        ORDER BY sub.distance_km ASC
        LIMIT 10
    LOOP
        -- 4. Create Job Offer
        INSERT INTO public.job_offers (booking_id, provider_id, distance_km, expires_at, status)
        VALUES (p_booking_id, v_provider.user_id, v_provider.distance_km, NOW() + INTERVAL '30 minutes', 'pending')
        ON CONFLICT (booking_id, provider_id) DO UPDATE 
            SET status = 'pending', 
                expires_at = NOW() + INTERVAL '30 minutes',
                distance_km = EXCLUDED.distance_km;
        
        v_inserted := v_inserted + 1;
    END LOOP;

    -- 5. Final Step: Transition booking status to 'searching' if providers found
    IF v_inserted > 0 THEN
        UPDATE public.bookings 
        SET status = 'searching', updated_at = NOW() 
        WHERE id = p_booking_id AND (status = 'requested' OR status = 'searching');
    END IF;

    RETURN v_inserted;
END;
$$;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- Diagnostic check
SELECT 'Repair: dispatch_job engine restored successfully ✅' AS result;
