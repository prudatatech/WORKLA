import { supabaseAdmin } from '../src/lib/supabase';
import fs from 'fs';

async function checkRecentBookings() {
    console.log('--- Checking Recent Bookings ---');
    const { data: bookings, error } = await supabaseAdmin
        .from('bookings')
        .select('id, booking_number, status, provider_id, customer_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching bookings:', error);
        return;
    }

    const results = [];
    for (const b of bookings) {
        const { data: offers } = await supabaseAdmin
            .from('job_offers')
            .select('*')
            .eq('booking_id', b.id);
        results.push({ booking: b, offers });
    }

    fs.writeFileSync('tmp/booking_diag.json', JSON.stringify(results, null, 2));
    console.log('Results written to tmp/booking_diag.json');
}

checkRecentBookings();
