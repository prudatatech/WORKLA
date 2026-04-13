
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    console.log('Inspecting booking_status_history columns...');
    
    // Querying information_schema to get definitive column names
    const { data, error } = await supabase
        .rpc('get_table_columns', { table_name: 'booking_status_history' });
        
    if (error) {
        // Fallback: search by selecting one row
        console.log('RPC get_table_columns failed, trying raw query...');
        const { data: sample, error: sampleError } = await supabase
            .from('booking_status_history')
            .select('*')
            .limit(1);
            
        if (sampleError) {
            console.error('Final failure:', sampleError);
        } else if (sample && sample.length > 0) {
            console.log('Sample row columns:', Object.keys(sample[0]));
        } else {
            console.log('Table is empty, trying to fetch column names via dummy select...');
            // This is a hacky way to see what columns exist if table is empty
            const { error: dummyError } = await supabase.from('booking_status_history').select('old_status, new_status, note, from_status, to_status, notes').limit(0);
            console.log('Dummy query error (will reveal missing columns):', dummyError?.message);
        }
    } else {
        console.log('Columns:', data);
    }
}

inspectSchema();
