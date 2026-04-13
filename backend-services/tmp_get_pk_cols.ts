
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function getPkColumns() {
    console.log('Querying PK columns for bookings...');
    
    // We'll try to see if information_schema is accessible
    // If not, we'll try to catch it in an error.
    
    const { data, error } = await supabase.from('information_schema.key_column_usage').select('column_name').eq('table_name', 'bookings');
    
    if (error) {
        console.log('Error querying information_schema:', error.message);
    } else {
        console.log('Columns in PK (or other keys):', data.map(d => d.column_name));
    }
}

getPkColumns();
