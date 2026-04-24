const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fullDiagnosis() {
    console.log('=== FULL DISPATCH DIAGNOSIS ===\n');

    // 1. Get latest booking
    const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    console.log(`Latest Booking: ${booking.booking_number}`);
    console.log(`  Status: ${booking.status}`);
    console.log(`  Subcategory: ${booking.subcategory_id}`);
    console.log(`  Service: ${booking.service_id}`);
    console.log(`  Customer Lat/Lng: ${booking.customer_latitude}, ${booking.customer_longitude}`);

    // 2. Directly run dispatch_job
    console.log('\n--- RUNNING dispatch_job RPC ---');
    const { data: dispatchResult, error: dispatchError } = await supabase.rpc('dispatch_job', {
        p_booking_id: booking.id
    });

    if (dispatchError) {
        console.error('dispatch_job RPC ERROR:', JSON.stringify(dispatchError, null, 2));
    } else {
        console.log(`dispatch_job returned: ${dispatchResult} (providers notified)`);
    }

    // 3. Check offers after dispatch
    const { data: offersAfter } = await supabase
        .from('job_offers')
        .select('*')
        .eq('booking_id', booking.id);
    console.log(`\nOffers created after dispatch: ${offersAfter?.length || 0}`);
    offersAfter?.forEach(o => console.log(`  - ${o.id} | Provider: ${o.provider_id} | Status: ${o.status}`));

    // 4. Check booking status now
    const { data: updatedBooking } = await supabase
        .from('bookings')
        .select('id, status, cancellation_reason')
        .eq('id', booking.id)
        .single();
    console.log(`\nBooking status after dispatch: ${updatedBooking?.status} | Reason: ${updatedBooking?.cancellation_reason}`);

    // 5. Check notifications table for this booking
    const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(`\n--- LATEST 5 NOTIFICATIONS ---`);
    notifications?.forEach(n => {
        console.log(`  - User: ${n.user_id?.substring(0,8)} | Type: ${n.type} | Title: ${n.title}`);
        console.log(`    Data: ${JSON.stringify(n.data)}`);
    });

    // 6. Manual join simulation - exactly as dispatch_job does it
    console.log('\n--- SIMULATING dispatch_job JOIN QUERY ---');
    const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
    const subcategoryId = booking.subcategory_id;
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // Check each join condition individually
    const { data: pdCheck } = await supabase.from('provider_details')
        .select('provider_id, is_online, verification_status')
        .eq('provider_id', providerId)
        .eq('is_online', true)
        .eq('verification_status', 'verified');
    console.log(`Step1 - Online+Verified: ${pdCheck?.length || 0} match(es)`);

    const { data: plCheck } = await supabase.from('provider_locations')
        .select('provider_id, recorded_at')
        .eq('provider_id', providerId)
        .gt('recorded_at', fourHoursAgo);
    console.log(`Step2 - Fresh location: ${plCheck?.length || 0} match(es) (cutoff: ${fourHoursAgo})`);
    if (plCheck?.length) {
        console.log(`  Location recorded_at: ${plCheck[0].recorded_at}`);
    }

    const { data: psCheck } = await supabase.from('provider_services')
        .select('provider_id, subcategory_id, is_active')
        .eq('provider_id', providerId)
        .eq('subcategory_id', subcategoryId)
        .eq('is_active', true);
    console.log(`Step3 - Active service for subcategory ${subcategoryId}: ${psCheck?.length || 0} match(es)`);

    // 7. Check if dispatch_job uses service_zone check
    const { data: zoneCheck, error: zoneError } = await supabase.rpc('is_location_in_service_zone', {
        p_lat: booking.customer_latitude,
        p_lng: booking.customer_longitude
    });
    console.log(`\n--- SERVICE ZONE CHECK ---`);
    if (zoneError) {
        console.error('is_location_in_service_zone error:', zoneError.message);
    } else {
        console.log(`Location (${booking.customer_latitude}, ${booking.customer_longitude}) in service zone: ${zoneCheck}`);
    }

    // 8. Check provider_location heading column (sometimes RPC filters on it)
    const { data: provLoc } = await supabase.from('provider_locations').select('*').eq('provider_id', providerId).single();
    console.log('\n--- FULL PROVIDER LOCATION ROW ---');
    console.log(JSON.stringify(provLoc, null, 2));
}

fullDiagnosis().catch(e => console.error('Fatal error:', e));
