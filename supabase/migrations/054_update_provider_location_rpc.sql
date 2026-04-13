-- Fix for Location Sync 500 errors
-- Converts flat lat/lng numbers into a safe PostGIS Point for the `location` column

CREATE OR REPLACE FUNCTION public.update_provider_location(p_provider_id UUID, p_latitude DOUBLE PRECISION, p_longitude DOUBLE PRECISION)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.provider_locations (provider_id, latitude, longitude, location, is_online, last_seen)
    VALUES (
        p_provider_id, 
        p_latitude, 
        p_longitude, 
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326), 
        true, 
        NOW()
    )
    ON CONFLICT (provider_id) DO UPDATE 
    SET 
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        location = ST_SetSRID(ST_MakePoint(EXCLUDED.longitude, EXCLUDED.latitude), 4326),
        is_online = true,
        last_seen = NOW();
END;
$$;
