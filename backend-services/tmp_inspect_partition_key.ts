
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectPartitionKey() {
    console.log('Inspecting partition info for public.bookings...');
    
    // We'll try to guess by looking at the constraint name 'bookings_2026_q1_pkey'
    // Usually, in Supabase/Postgres partitioning, the PK must include the partition key.
    // Let's see what columns are in that constraint by trying to catch a specific error or 
    // just looking at the table structure again.
    
    // If it's partitioned by date, 'scheduled_date' or 'created_at' are the targets.
    // Let's try to see if 'scheduled_date' is a candidate.
    
    const { data: cols } = await supabase.from('bookings').select('*').limit(1);
    if (cols && cols.length > 0) {
        console.log('Columns:', Object.keys(cols[0]));
    }
}

inspectPartitionKey();
