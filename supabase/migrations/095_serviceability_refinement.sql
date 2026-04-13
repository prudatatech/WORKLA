-- ==============================================================
-- SERVICEABILITY REFINEMENT (v3)
-- Purpose: Add fallback radius and relax location freshness for testing.
-- ==============================================================

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

    -- 2. Check for Online Providers nearby
    RETURN EXISTS (
        SELECT 1
        FROM public.provider_details pd
        JOIN public.provider_locations pl ON pd.provider_id = pl.provider_id
        WHERE pd.is_online = true
          AND pd.verification_status = 'verified'
          -- Relaxed to 2 hours for variability in test environments
          AND pl.recorded_at > (NOW() - INTERVAL '2 hours')
          AND (
              -- If custom polygon set
              (pd.service_area IS NOT NULL AND ST_Contains(pd.service_area, ST_SetSRID(ST_Point(p_lng, p_lat), 4326)))
              OR
              -- Otherwise use radius (using COALESCE to fallback to 10km)
              (pd.service_area IS NULL AND 
               ST_DWithin(
                   ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326)::geography,
                   ST_SetSRID(ST_Point(p_lng, p_lat), 4326)::geography,
                   COALESCE(pd.service_radius_km, 10) * 1000
               ))
          )
    );
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Serviceability Refinement v3 Deployed ✅' AS result;
