
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const providerId = '14900651-067f-4b5c-82a7-f53c3932c4a9'; // Wait, let me double check the ID from metadata

async function debug() {
    const pId = '14900651-067f-4b5c-82a7-f63c3932c4a9'; // Corrected from metadata
    console.log(`Provider: ${pId}`);
    
    const { data: bookings } = await supabase.from('bookings').select('status');
    const counts = {};
    bookings.filter(b => b.provider_id === pId || true).forEach(b => {
        // Wait, I should filter by provider_id in the query
    });

    const { data: pBookings } = await supabase.from('bookings').select('status').eq('provider_id', pId);
    pBookings.forEach(b => {
        counts[b.status] = (counts[b.status] || 0) + 1;
    });

    console.log('Bookings by Status:', JSON.stringify(counts));

    const { data: pOffers } = await supabase.from('job_offers').select('status').eq('provider_id', pId);
    const oCounts = {};
    pOffers.forEach(o => {
        oCounts[o.status] = (oCounts[o.status] || 0) + 1;
    });
    console.log('Offers by Status:', JSON.stringify(oCounts));
}

debug();
