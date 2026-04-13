
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const providerId = '14900651-067f-4b5c-82a7-f63c3932c4a9';

async function debug() {
    console.log(`Checking bookings for Provider: ${providerId}`);
    
    // Check various statuses
    const statuses = ['requested', 'searching', 'confirmed', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled'];
    
    for (const s of statuses) {
        const { count, error } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', providerId)
            .eq('status', s);
        
        console.log(`Status ${s.padEnd(12)}: ${count} bookings`);
    }

    // Check ALL
    const { count: total, error: tError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', providerId);
    
    console.log(`TOTAL bookings for this provider: ${total}`);
}

debug();
