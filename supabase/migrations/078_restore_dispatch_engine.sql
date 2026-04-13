-- ==============================================================
-- RESTORE DISPATCH ENGINE
-- The dispatch_job RPC was dropped by 072_cleanup and never replaced.
-- This re-creates the entire dispatch pipeline so new bookings
-- actually generate job_offers for eligible providers.
-- ==============================================================

-- 1. Helper functions for distance calculation (may already exist)
CREATE OR REPLACE FUNCTION pmin(a float, b float) RETURNS float AS $$
  SELECT CASE WHEN a < b THEN a ELSE b END;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION pmax(a float, b float) RETURNS float AS $$
  SELECT CASE WHEN a > b THEN a ELSE b END;
$$ LANGUAGE SQL IMMUTABLE;


-- 2. Recreate the dispatch_job function
DROP FUNCTION IF EXISTS public.dispatch_job(UUID);

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
    -- Get booking details
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Defaults if null
    v_cust_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_cust_lng := COALESCE(v_booking.customer_longitude, 78.0081);

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
                )) AS distance_km
            FROM public.provider_details pd
            JOIN public.provider_locations pl ON pl.provider_id = pd.provider_id
            JOIN public.provider_services ps ON ps.provider_id = pd.provider_id 
            WHERE pd.is_online = TRUE
              AND pd.verification_status = 'verified'
              AND ps.subcategory_id = v_booking.subcategory_id
              AND ps.is_active = TRUE
        ) sub
        WHERE sub.distance_km < 25 
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
        WHERE id = p_booking_id AND status = 'requested';
    END IF;

    RETURN v_inserted;
END;
$$;


-- 3. Recreate get_available_jobs (ensure it's compatible)
DROP FUNCTION IF EXISTS public.get_available_jobs(UUID);

CREATE OR REPLACE FUNCTION public.get_available_jobs(p_provider_id UUID)
RETURNS TABLE (
    id UUID,
    service_name TEXT,
    customer_address TEXT,
    total_amount DECIMAL,
    scheduled_date DATE,
    scheduled_time_slot TEXT,
    distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.service_name_snapshot::TEXT AS service_name,
        b.customer_address::TEXT,
        b.total_amount::DECIMAL,
        b.scheduled_date::DATE,
        b.scheduled_time_slot::TEXT,
        jo.distance_km::DOUBLE PRECISION
    FROM public.job_offers jo
    JOIN public.bookings b ON b.id = jo.booking_id
    WHERE jo.provider_id = p_provider_id
      AND jo.status = 'pending'
      AND jo.expires_at > NOW()
      AND b.status IN ('requested', 'searching')
    ORDER BY b.created_at DESC;
END;
$$;


-- 4. Ensure job_offers table has the correct composite unique constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'job_offers_booking_id_provider_id_key'
    ) THEN
        -- Only add if it doesn't exist
        BEGIN
            ALTER TABLE public.job_offers 
                ADD CONSTRAINT job_offers_booking_id_provider_id_key 
                UNIQUE (booking_id, provider_id);
        EXCEPTION WHEN duplicate_table THEN
            -- ignore
        END;
    END IF;
END $$;


-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Dispatch Engine Restored ✅' AS result;
