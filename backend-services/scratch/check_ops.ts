
import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function checkOperations() {
    console.log('--- Checking ALL Service Zones ---');
    const { data: zones, error: zoneErr } = await supabaseAdmin.from('service_zones').select('id, name, status');
    if (zoneErr) console.error('Zones error:', zoneErr.message);
    else console.log('All Zones:', zones);

    console.log('\n--- Checking Providers ---');
    const { data: providers, error: provErr } = await supabaseAdmin.from('provider_details').select('provider_id, is_online, verification_status');
    if (provErr) console.error('Providers error:', provErr.message);
    else {
        console.log('Providers:', providers);
        const ids = providers.map(p => p.provider_id);
        const { data: locations } = await supabaseAdmin.from('provider_locations').select('provider_id, latitude, longitude, recorded_at').in('provider_id', ids);
        console.log('Locations:', locations);
    }
}

checkOperations();
