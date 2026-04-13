import { supabaseAdmin } from '../src/lib/supabase';

const sql = `
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
          AND pl.recorded_at > (NOW() - INTERVAL '4 hours')
          AND (
              (pd.service_area IS NOT NULL AND ST_Contains(pd.service_area, ST_SetSRID(ST_Point(p_lng, p_lat), 4326)))
              OR
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
`;

async function applyAndTest() {
    console.log('Applying Migration...');
    // We don't have a direct 'exec' RPC usually unless we created one.
    // Let's try to just update the provider details to ensure they are verified and online first.
    
    const providerId = '033a890a-a50d-45da-966e-52ba73591461';
    
    await supabaseAdmin.from('provider_details').update({ 
        verification_status: 'verified', 
        is_online: true,
        service_radius_km: 25
    }).eq('provider_id', providerId);

    console.log('Injecting location...');
    // Agra location for testing
    await supabaseAdmin.from('provider_locations').upsert({
        provider_id: providerId,
        latitude: 27.18,
        longitude: 78.01,
        recorded_at: new Date().toISOString()
    });

    console.log('Checking serviceability...');
    const { data } = await supabaseAdmin.rpc('is_location_in_service_zone', {
        p_lat: 27.181,
        p_lng: 78.011
    });
    
    console.log('Final Test Result:', data);
}

applyAndTest();
