
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function getDefinitiveColumns() {
    console.log('Fetching sample row from booking_status_history...');
    
    // We try to get one row. If empty, we'll try a different trick.
    const { data, error } = await supabase
        .from('booking_status_history')
        .select('*')
        .limit(1);
        
    if (error) {
        console.error('Error fetching sample:', error);
    } else if (data && data.length > 0) {
        console.log('DEFINITIVE COLUMNS:', Object.keys(data[0]));
    } else {
        console.log('Table is empty. Using Postgres metadata query via RPC if possible, or dummy columns.');
        // Try information_schema via a new temporary function if we can, 
        // but for now let's just guess and check common names.
        const trialNames = ['old_status', 'new_status', 'from_status', 'to_status', 'note', 'notes'];
        for (const name of trialNames) {
            const { error: e } = await supabase.from('booking_status_history').select(name).limit(0);
            if (!e) {
                console.log(`Column [${name}] EXISTS`);
            } else {
                console.log(`Column [${name}] DOES NOT EXIST: ${e.message}`);
            }
        }
    }
}

getDefinitiveColumns();
