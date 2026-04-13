
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectConstraints() {
    console.log('Inspecting constraints for bookings and booking_status_history...');
    
    // Querying information_schema for constraints
    const sql = `
        SELECT
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            tc.constraint_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_name IN ('bookings', 'booking_status_history');
    `;
    
    const { data, error } = await supabase.rpc('run_sql', { sql_query: sql });
    
    if (error) {
        // Safe way to get it if run_sql rpc is missing (usual case)
        console.log('run_sql RPC missing, using dummy queries to test names...');
        
        const tables = ['bookings', 'booking_status_history'];
        for (const table of tables) {
            const { data, error } = await supabase.from(table).select('*').limit(1);
            if (data) console.log(`Columns in [${table}]:`, Object.keys(data[0]));
        }
    } else {
        console.log('Constraints:', JSON.stringify(data, null, 2));
    }
}

inspectConstraints();
