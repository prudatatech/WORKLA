
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function listBookings() {
    console.log('Listing recent bookings...');
    const { data, error } = await supabase
        .from('bookings')
        .select('id, status, booking_number')
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Recent Bookings:', JSON.stringify(data, null, 2));
    }
}

listBookings();
