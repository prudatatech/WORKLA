
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findDuplicateTables() {
    console.log('Searching for all tables named "bookings" across schemas...');
    
    // We can't run raw SQL directly without a custom RPC 'run_sql'.
    // However, we can use the 'information_schema.columns' trick to see which schemas contain 'bookings'.
    
    // We'll try to guess common schemas: 'public', 'auth', 'storage', 'net'
    const schemas = ['public', 'auth', 'extensions'];
    for (const schema of schemas) {
        const { data, error } = await supabase.from(schema + '.bookings').select('id').limit(1);
        if (!error) {
            console.log(`Table [${schema}.bookings] EXISTS`);
        } else {
            // If it's a "does not exist" error, we're good.
            // If it's a "permission denied" error, it exists but we can't see it (weird for service role).
            if (error.code === '42P01') {
                console.log(`Table [${schema}.bookings] does NOT exist`);
            } else {
                console.log(`Table [${schema}.bookings] error: ${error.message} (code: ${error.code})`);
            }
        }
    }
}

findDuplicateTables();
