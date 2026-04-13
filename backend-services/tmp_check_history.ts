
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkHistory() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    console.log(`Checking history for booking: ${bookingId}`);
    
    const { data, error } = await supabase
        .from('booking_status_history')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
        
    if (error) {
        console.error('Error fetching history:', error);
    } else {
        console.log('Status History:', JSON.stringify(data, null, 2));
    }
}

checkHistory();
