
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkProviders() {
    console.log('--- PROVIDER STATUS CHECK ---');
    
    // 1. Total providers
    const { count: totalProviders } = await supabase
        .from('provider_details')
        .select('*', { count: 'exact', head: true });
    console.log(`Total Providers in system: ${totalProviders}`);

    // 2. Online providers
    const { data: onlineProviders, error: onlineErr } = await supabase
        .from('provider_details')
        .select('provider_id, is_online, verification_status')
        .eq('is_online', true);
    
    if (onlineErr) {
        console.error('Error fetching online providers:', onlineErr);
    } else {
        console.log(`Online Providers: ${onlineProviders.length}`);
        onlineProviders.forEach(p => {
            console.log(`  - ID: ${p.provider_id} | Verified: ${p.verification_status}`);
        });
    }

    // 3. Location Freshness
    console.log('\n--- LOCATION FRESHNESS (last 4 hours) ---');
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: freshLocations, error: locErr } = await supabase
        .from('provider_locations')
        .select('provider_id, recorded_at')
        .gt('recorded_at', fourHoursAgo);

    if (locErr) {
        console.error('Error fetching locations:', locErr);
    } else {
        console.log(`Providers with fresh locations: ${freshLocations.length}`);
        freshLocations.forEach(l => {
            console.log(`  - ID: ${l.provider_id.substring(0,8)} | Recorded: ${l.recorded_at}`);
        });
    }

    // 4. Match Online + Fresh Location + Verified
    const onlineIds = onlineProviders.map(p => p.provider_id);
    const verifiedIds = onlineProviders.filter(p => p.verification_status === 'verified').map(p => p.provider_id);
    const freshIds = freshLocations.map(l => l.provider_id);

    const readyIds = verifiedIds.filter(id => freshIds.includes(id));
    console.log(`\nProviders ready for dispatch (Online + Verified + Fresh Location): ${readyIds.length}`);
    readyIds.forEach(id => console.log(`  - Ready Provider ID: ${id.substring(0,8)}`));

    // 5. Check Provider Services for ready providers
    console.log('\n--- PROVIDER SERVICES ---');
    for (const id of readyIds) {
        const { data: services } = await supabase
            .from('provider_services')
            .select('subcategory_id, is_active')
            .eq('provider_id', id);
        console.log(`Provider ${id.substring(0,8)} has ${services?.length || 0} services:`);
        services?.forEach(s => {
            console.log(`  - Sub: ${s.subcategory_id.substring(0,8)} | Active: ${s.is_active}`);
        });
    }

    // 6. Check if any bookings are stuck in 'requested' or 'cancelled' (no worker)
    console.log('\n--- RECENT BOOKINGS ---');
    const { data: recentBookings } = await supabase
        .from('bookings')
        .select('id, booking_number, status, subcategory_id, created_at, cancellation_reason, customer_latitude, customer_longitude')
        .order('created_at', { ascending: false })
        .limit(10);

    for (const b of recentBookings) {
        console.log(`B: ${b.booking_number} | Status: ${b.status} | Sub: ${b.subcategory_id.substring(0,8)} | Reason: ${b.cancellation_reason || 'N/A'}`);
        
        // Calculate distance to ready providers
        for (const id of readyIds) {
            const { data: loc } = await supabase.from('provider_locations').select('latitude, longitude').eq('provider_id', id).single();
            if (loc && b.customer_latitude && b.customer_longitude) {
                const dist = calculateDistance(b.customer_latitude, b.customer_longitude, loc.latitude, loc.longitude);
                console.log(`  -> Distance to Provider ${id.substring(0,8)}: ${dist.toFixed(2)} km`);
            }
        }
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

checkProviders();
