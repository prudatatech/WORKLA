
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findTableSchemas() {
    console.log('Finding all schemas containing "bookings" table...');
    
    // We'll use the .rpc('run_sql') if it works, or we'll try to infer.
    // Since we don't know the RPC name, we'll try to use a common one or just guess.
    
    // Instead, let's try to query public.booking_status_history and see what it references.
    // Or just try to see if public.bookings has columns we expect.
    
    const { data: cols, error } = await supabase.from('bookings').select('*').limit(1);
    if (cols) {
        console.log('Columns in default bookings table:', Object.keys(cols[0]));
    }
}

findTableSchemas();
