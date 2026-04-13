
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function globalSearch() {
    const id = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    console.log(`Searching for ID: ${id} across tables...`);
    
    const tables = ['bookings', 'booking_drafts', 'job_offers', 'profiles'];
    
    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('id', id)
            .maybeSingle();
            
        if (data) {
            console.log(`Found in table [${table}]:`, JSON.stringify(data, null, 2));
        }
    }
}

globalSearch();
