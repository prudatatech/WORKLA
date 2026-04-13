import { supabaseAdmin } from '../src/lib/supabase';

async function checkRecentBookings() {
    console.log('--- Checking Recent Bookings ---');
    const { data: bookings, error } = await supabaseAdmin
        .from('bookings')
        .select('id, booking_number, status, provider_id, customer_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching bookings:', error);
        return;
    }

    console.log('Recent Bookings:', JSON.stringify(bookings, null, 2));

    for (const b of bookings) {
        const { data: offers } = await supabaseAdmin
            .from('job_offers')
            .select('*')
            .eq('booking_id', b.id);
        console.log(`Offers for ${b.booking_number}:`, JSON.stringify(offers, null, 2));
    }
}

checkRecentBookings();
