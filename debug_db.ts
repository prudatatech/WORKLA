
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load config from backend-services
dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase config');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log('--- Recent Bookings ---');
    const { data: bookings, error: bError } = await supabase
        .from('bookings')
        .select('id, booking_number, status, provider_id, customer_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (bError) console.error(bError);
    else console.table(bookings);

    console.log('\n--- Recent Job Offers ---');
    const { data: offers, error: oError } = await supabase
        .from('job_offers')
        .select('id, booking_id, provider_id, status, offered_at, responded_at')
        .order('offered_at', { ascending: false })
        .limit(5);

    if (oError) console.error(oError);
    else console.table(offers);

    // Check if any booking is confirmed but has no provider or vice versa
    const { data: anomalies, error: aError } = await supabase
        .from('bookings')
        .select('id, status, provider_id')
        .eq('status', 'confirmed')
        .is('provider_id', null);
    
    if (anomalies && anomalies.length > 0) {
        console.log('\n--- ANOMALIES (Confirmed but no provider_id) ---');
        console.table(anomalies);
    } else {
        console.log('\nNo anomalies found (Confirmed bookings all have provider_id).');
    }
}

debug();
