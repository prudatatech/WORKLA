
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseFk() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    console.log(`Diagnosing FK for booking: ${bookingId}`);

    // 1. Check if it's already in worker_earnings
    const { data: earning } = await supabase.from('worker_earnings').select('*').eq('booking_id', bookingId).maybeSingle();
    console.log('Existing earning:', earning ? 'FOUND' : 'NOT FOUND');

    // 2. Check if we can manually insert (to see the error here)
    if (!earning) {
        console.log('Attempting manual insert into worker_earnings...');
        const { error } = await supabase.from('worker_earnings').insert({
            booking_id: bookingId,
            provider_id: '14900651-067f-4b5c-82a7-f63c3932c4a9',
            gross_amount: 100,
            platform_fee: 10,
            net_amount: 90,
            status: 'pending'
        });
        if (error) {
            console.error('Manual Insert Error:', JSON.stringify(error, null, 2));
        } else {
            console.log('Manual Insert SUCCESS (This is strange if RPC fails)');
        }
    }
}

diagnoseFk();
