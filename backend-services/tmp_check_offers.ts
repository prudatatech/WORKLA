
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOffers() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    console.log(`Checking offers for booking: ${bookingId}`);
    
    const { data: offers, error } = await supabase
        .from('job_offers')
        .select('*')
        .eq('booking_id', bookingId);
        
    if (error) {
        console.error('Error fetching offers:', error);
    } else {
        console.log('Job Offers:', JSON.stringify(offers, null, 2));
    }
}

checkOffers();
