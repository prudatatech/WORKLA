-- Migration: 108_repair_serviceability_rpc.sql
-- Fixes: Could not find the function public.is_location_in_service_zone in the schema cache

-- 1. Drop existing function to ensure signature matches perfectly
-- This handles cases where parameters might have changed (e.g. from lat/lng to p_lat/p_lng)
DROP FUNCTION IF EXISTS public.is_location_in_service_zone(DOUBLE PRECISION, DOUBLE PRECISION);

-- 2. Re-create the function with the latest logic from migration 095
CREATE OR REPLACE FUNCTION public.is_location_in_service_zone(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Check static Service Zones (Fixed operational areas)
    IF EXISTS (
        SELECT 1 
        FROM public.service_zones 
        WHERE status = 'active' 
          AND ST_Contains(boundary, ST_SetSRID(ST_Point(p_lng, p_lat), 4326))
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. Check for Online Providers nearby (Dynamic serviceability)
    -- This allows providers to 'open' areas dynamically based on their coverage radius
    RETURN EXISTS (
        SELECT 1
        FROM public.provider_details pd
        JOIN public.provider_locations pl ON pd.provider_id = pl.provider_id
        WHERE pd.is_online = true
          AND pd.verification_status = 'verified'
          -- Check for location updates in the last 2 hours
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

-- 3. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
