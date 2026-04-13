
import { supabaseAdmin } from './src/lib/supabase';
import * as dotenv from 'dotenv';
import path from 'path';

// dotenv is already called in config.ts which supabaseAdmin imports
// but let's be sure
dotenv.config();

async function simulateServerQuery() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    console.log(`[Sim] Checking bookingId: ${bookingId}`);
    
    const { data: booking, error: fetchError } = await supabaseAdmin
        .from('bookings')
        .select('status, customer_id, provider_id')
        .eq('id', bookingId)
        .single();

    if (fetchError) {
        console.error('[Sim] Fetch Error:', JSON.stringify(fetchError, null, 2));
    } else {
        console.log('[Sim] Booking Found:', JSON.stringify(booking, null, 2));
    }
}

simulateServerQuery();
