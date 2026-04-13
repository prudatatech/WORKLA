
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBooking() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    console.log(`Checking booking: ${bookingId}`);
    
    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();
        
    if (error) {
        console.error('Error fetching booking:', error);
    } else if (data) {
        console.log('Booking found:', JSON.stringify(data, null, 2));
    } else {
        console.log('Booking NOT FOUND in database.');
    }
}

checkBooking();
