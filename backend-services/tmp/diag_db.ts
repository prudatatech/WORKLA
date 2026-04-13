import { supabaseAdmin } from '../src/lib/supabase';

async function checkDb() {
    console.log('--- Checking DB Functions ---');
    
    // Check is_location_in_service_zone
    const { data: funcDef, error } = await supabaseAdmin.rpc('get_function_def', { 
        func_name: 'is_location_in_service_zone' 
    });
    
    // Note: get_function_def might not exist, so let's try a raw query via a temporary function if needed
    // But first, let's try a simpler approach: check if we can call it with an online provider nearby.
    
    const testLat = 27.18;
    const testLng = 78.01;
    
    // Check if there are ANY online, verified providers with recent locations
    const { data: providers, error: pErr } = await supabaseAdmin
        .from('provider_details')
        .select(`
            provider_id,
            is_online,
            verification_status,
            service_radius_km,
            provider_locations(latitude, longitude, recorded_at)
        `)
        .eq('is_online', true)
        .eq('verification_status', 'verified');
    
    console.log('Online Verified Providers:', JSON.stringify(providers, null, 2));
    if (pErr) console.error('Error fetching providers:', pErr);

    const { data: isServed, error: zoneError } = await supabaseAdmin
        .rpc('is_location_in_service_zone', { 
            p_lat: testLat, 
            p_lng: testLng 
        });
    
    console.log(`Serviceability at (${testLat}, ${testLng}):`, isServed, zoneError ? zoneError.message : 'No error');
}

checkDb();
