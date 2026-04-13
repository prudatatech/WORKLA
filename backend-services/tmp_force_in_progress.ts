
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function forceInProgress() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    console.log(`Forcing booking ${bookingId} to in_progress...`);
    
    const { data, error } = await supabase
        .from('bookings')
        .update({ 
            status: 'in_progress',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .select();
        
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Successfully updated:', JSON.stringify(data, null, 2));
    }
}

forceInProgress();
