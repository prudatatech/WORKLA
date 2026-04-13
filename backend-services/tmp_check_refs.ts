
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkReferences() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    const userId = '14900651-067f-4b5c-82a7-f63c3932c4a9';

    console.log('Checking Booking...');
    const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
    console.log('Booking found:', !!booking);
    if (booking) {
        console.log('Booking details:', JSON.stringify(booking, null, 2));
    }

    console.log('Checking Profile for user:', userId);
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (profile) {
        console.log('Profile found:', JSON.stringify(profile, null, 2));
    } else {
        console.log('Profile NOT FOUND for userId:', userId);
    }
}

checkReferences();
