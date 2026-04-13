
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCols() {
    console.log('Fetching columns for provider_details...');
    const { data, error } = await supabase.from('provider_details').select('*').limit(1);
    
    if (error) {
        console.error('Error fetching provider_details:', error);
    } else if (data && data.length > 0) {
        console.log('Columns in provider_details:', Object.keys(data[0]));
    } else {
        // Fallback: try to insert a dummy to see if it fails on columns
        console.log('No data in provider_details, attempting to fetch column names via schema query...');
        const { data: cols, error: colError } = await supabase.from('provider_details').select();
        // Since we can't use information_schema easily, let's just try to update a non-existent row with the column
        const { error: updateError } = await supabase
            .from('provider_details')
            .update({ years_of_experience: 0 })
            .eq('provider_id', '00000000-0000-0000-0000-000000000000');
        
        if (updateError) {
            console.log('Update attempt error (this will reveal if column exists):', updateError.message);
        } else {
            console.log('Column years_of_experience EXISTS (update accepted by schema cache)');
        }
    }
}

checkCols();
