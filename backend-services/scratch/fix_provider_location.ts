import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function fixProviderLocation() {
    console.log('--- Fixing Provider Location ---');
    
    // Find the online provider
    const { data: providers, error: provErr } = await supabaseAdmin
        .from('provider_details')
        .select('provider_id')
        .eq('is_online', true)
        .eq('verification_status', 'verified');
        
    if (provErr || !providers || providers.length === 0) {
        console.error('Could not find an online verified provider.');
        return;
    }
    
    const providerId = providers[0].provider_id;
    console.log(`Found Provider: ${providerId}`);
    
    // Update location to near the customer's test location
    // Customer test lat/lng: 12.8183531, 77.5153127
    const { error: locErr } = await supabaseAdmin
        .from('provider_locations')
        .upsert({
            provider_id: providerId,
            latitude: 12.8183531,
            longitude: 77.5153127,
            recorded_at: new Date().toISOString()
        });
        
    if (locErr) {
        console.error('Failed to update location:', locErr.message);
    } else {
        console.log('Provider location updated to current time. They should now receive job popups.');
    }
    
    // Also make sure their service_radius_km is large enough just in case
    await supabaseAdmin
        .from('provider_details')
        .update({ service_radius_km: 50 })
        .eq('provider_id', providerId);
}

fixProviderLocation();
