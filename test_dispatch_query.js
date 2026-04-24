
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testQuery() {
    const bookingId = 'ddc42ccd-8b21-4899-8096-7c080004908a'; // Wait, this is a subcategory ID probably
    
    // Get the latest booking
    const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    
    if (!booking) {
        console.log('No booking found');
        return;
    }

    console.log(`Testing dispatch for Booking: ${booking.booking_number} (${booking.id})`);
    console.log(`Subcategory ID: ${booking.subcategory_id}`);
    console.log(`Customer Loc: ${booking.customer_latitude}, ${booking.customer_longitude}`);

    const v_cust_lat = booking.customer_latitude || 27.1767;
    const v_cust_lng = booking.customer_longitude || 78.0081;
    const v_max_radius = 20.0;
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // The query from dispatch_job RPC
    const { data: providers, error } = await supabase
        .from('provider_details')
        .select(`
            provider_id,
            is_online,
            verification_status,
            provider_locations (latitude, longitude, recorded_at),
            provider_services (subcategory_id, is_active)
        `)
        .eq('is_online', true)
        .eq('verification_status', 'verified')
        .eq('provider_services.subcategory_id', booking.subcategory_id)
        .eq('provider_services.is_active', true)
        .gt('provider_locations.recorded_at', fourHoursAgo);

    if (error) {
        console.error('Query Error:', error);
        return;
    }

    console.log(`Found ${providers.length} potential providers via basic join`);
    
    // Note: The above JS query might not behave exactly like the SQL join in RPC
    // especially with the filters on joined tables.
    
    // Let's run a raw SQL-like check
    const { data: rawData, error: rawErr } = await supabase.rpc('get_available_providers_for_booking', {
        p_booking_id: booking.id
    });
    
    if (rawErr) {
        console.log('RPC get_available_providers_for_booking doesn\'t exist, trying to simulate with separate queries');
        
        const { data: pd } = await supabase.from('provider_details').select('*').eq('is_online', true).eq('verification_status', 'verified');
        const { data: pl } = await supabase.from('provider_locations').select('*').gt('recorded_at', fourHoursAgo);
        const { data: ps } = await supabase.from('provider_services').select('*').eq('subcategory_id', booking.subcategory_id).eq('is_active', true);

        console.log(`Online & Verified: ${pd?.length || 0}`);
        console.log(`Fresh Locations: ${pl?.length || 0}`);
        console.log(`Active for Subcategory: ${ps?.length || 0}`);

        const pdIds = pd.map(p => p.provider_id);
        const plIds = pl.map(p => p.provider_id);
        const psIds = ps.map(p => p.provider_id);

        const matchIds = pdIds.filter(id => plIds.includes(id) && psIds.includes(id));
        console.log(`Matching Providers: ${matchIds.length}`);
        matchIds.forEach(id => console.log(`  - Match: ${id}`));
    } else {
        console.log(`RPC results: ${rawData.length} providers`);
    }
}

testQuery();
