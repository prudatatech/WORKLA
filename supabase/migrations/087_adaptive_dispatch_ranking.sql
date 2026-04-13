-- ==============================================================
-- ELITE HARDENING: Adaptive Dispatch Ranking
-- Purpose: Prioritize quality and experience in job matching.
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
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Defaults if null
    v_cust_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_cust_lng := COALESCE(v_booking.customer_longitude, 78.0081);

    -- 🛡️ Determine Zone if not set
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
        ELSE
            -- If STILL no zone, we can't dispatch (out of bounds)
            RETURN 0;
        END IF;
    END IF;

    FOR v_provider IN
        SELECT * FROM (
            SELECT
                pd.provider_id AS user_id,
                pl.latitude,
                pl.longitude,
                (6371 * acos(
                    pmin(1.0, pmax(-1.0, 
                        cos(radians(v_cust_lat)) * cos(radians(pl.latitude)) *
                        cos(radians(pl.longitude) - radians(v_cust_lng)) +
                        sin(radians(v_cust_lat)) * sin(radians(pl.latitude))
                    ))
                )) AS distance_km,
                pd.avg_rating,
                pd.total_jobs,
                -- 🚀 ADAPTIVE RANKING SCORE
                -- Weights: Rating (40%), Experience (30%), Proximity (30%)
                -- Formula: (Rating * 20) + (Jobs / 5) - (Distance * 5)
                ((COALESCE(pd.avg_rating, 0) * 20) + 
                 (LEAST(COALESCE(pd.total_jobs, 0), 100) / 5) - 
                 ((6371 * acos(pmin(1.0, pmax(-1.0, cos(radians(v_cust_lat)) * cos(radians(pl.latitude)) * cos(radians(pl.longitude) - radians(v_cust_lng)) + sin(radians(v_cust_lat)) * sin(radians(pl.latitude)))))) * 5)
                ) AS ranking_score
            FROM public.provider_details pd
            JOIN public.provider_locations pl ON pl.provider_id = pd.provider_id
            JOIN public.provider_services ps ON ps.provider_id = pd.provider_id 
            WHERE pd.is_online = TRUE
              AND pd.verification_status = 'verified'
              AND ps.subcategory_id = v_booking.subcategory_id
              AND ps.is_active = TRUE
              
              -- ELITE HARDENING: Exclude Providers with active jobs
              AND NOT EXISTS (
                  SELECT 1 FROM public.bookings b 
                  WHERE b.provider_id = pd.provider_id 
                    AND b.status IN ('accepted', 'en_route', 'arrived', 'in_progress')
              )
        ) sub
        WHERE sub.distance_km < 25  -- Standard radius
        ORDER BY sub.ranking_score DESC  -- ⚡ Ranking by quality first
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
        WHERE id = p_booking_id AND status = 'requested';
    END IF;

    RETURN v_inserted;
END;
$$;

-- 📈 Market Intelligence: Identify Unfilled Demand
CREATE OR REPLACE VIEW public.marketplace_demand_gaps AS
SELECT 
    sz.name AS zone_name,
    b.scheduled_date,
    COUNT(b.id) FILTER (WHERE b.status = 'cancelled' AND b.cancelled_by = 'system') AS expired_bookings,
    COUNT(b.id) AS total_requests
FROM public.bookings b
JOIN public.service_zones sz ON sz.id = b.service_zone_id
WHERE b.created_at > NOW() - INTERVAL '7 days'
GROUP BY sz.name, b.scheduled_date
HAVING COUNT(b.id) FILTER (WHERE b.status = 'cancelled' AND b.cancelled_by = 'system') > 0
ORDER BY expired_bookings DESC;

NOTIFY pgrst, 'reload schema';

SELECT 'Adaptive Dispatch & Demand Insights Deployed ✅' AS result;
