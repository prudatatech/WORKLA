
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_number, status')
        .order('created_at', { ascending: false })
        .limit(5);

    if (!bookings) return;

    for (const b of bookings) {
        const { data: offers } = await supabase
            .from('job_offers')
            .select('*')
            .eq('booking_id', b.id);
        
        console.log(`B: ${b.booking_number} | Status: ${b.status} | Offers: ${offers?.length || 0}`);
        offers?.forEach(o => {
            console.log(`  - Offer: ${o.id.substring(0,8)} | Provider: ${o.provider_id.substring(0,8)} | Status: ${o.status}`);
        });
    }
}

run();
