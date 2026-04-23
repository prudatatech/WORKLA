import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function checkDispatch() {
    console.log('--- Checking Latest Booking ---');
    const { data: bookings, error: bErr } = await supabaseAdmin
        .from('bookings')
        .select('id, status, created_at, customer_address')
        .order('created_at', { ascending: false })
        .limit(1);

    if (bErr) {
        console.error('Error fetching bookings:', bErr.message);
        return;
    }

    if (!bookings || bookings.length === 0) {
        console.log('No bookings found.');
        return;
    }

    const latest = bookings[0];
    console.log('Latest Booking:', latest);

    console.log('\n--- Checking Job Offers for Booking ---');
    const { data: offers, error: oErr } = await supabaseAdmin
        .from('job_offers')
        .select('*')
        .eq('booking_id', latest.id);

    if (oErr) {
        console.error('Error fetching offers:', oErr.message);
    } else {
        console.log(`Found ${offers.length} offers:`, offers);
    }
    
    console.log('\n--- Checking Notifications ---');
    const { data: notifs } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
    console.log('Latest 3 notifications:', notifs);
}

checkDispatch();
