
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debug() {
    console.log('--- LATEST 5 CONFIRMED BOOKINGS ---');
    const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_number, status, provider_id, confirmed_at')
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(5);
    
    if (bookings) {
        bookings.forEach(b => {
             console.log(`B: ${b.booking_number} | Status: ${b.status} | Provider: ${b.provider_id} | Confirmed: ${b.confirmed_at}`);
        });
    }

    console.log('\n--- LATEST 5 ACCEPTED OFFERS ---');
    const { data: offers } = await supabase
        .from('job_offers')
        .select('id, booking_id, provider_id, status, responded_at')
        .eq('status', 'accepted')
        .order('responded_at', { ascending: false })
        .limit(5);
    
    if (offers) {
        offers.forEach(o => {
            console.log(`O: ${o.id.substring(0,8)} | B: ${o.booking_id.substring(0,8)} | P: ${o.provider_id.substring(0,8)} | at ${o.responded_at}`);
        });
    }
}

debug();
