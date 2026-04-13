
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function getRawPostgresError() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    const userId = '14900651-067f-4b5c-82a7-f63c3932c4a9';
    const newStatus = 'completed';

    console.log(`Executing update_booking_status_hardened_rpc for ${bookingId}...`);
    
    // Using .rpc is good, but we want the detailed error
    const { data, error } = await supabase.rpc('update_booking_status_hardened_rpc', {
        p_booking_id: bookingId,
        p_new_status: newStatus,
        p_user_id: userId
    });

    if (error) {
        const fs = require('fs');
        fs.writeFileSync('full_db_error.json', JSON.stringify(error, null, 2));
        console.log('--- DB ERROR WRITTEN TO full_db_error.json ---');
    } else {
        console.log('Result:', JSON.stringify(data, null, 2));
    }
}

getRawPostgresError();
