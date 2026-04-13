
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBankTable() {
    console.log('Checking for provider_bank_accounts table...');
    const { error } = await supabase.from('provider_bank_accounts').select('*').limit(1);
    
    if (error) {
        console.log('Error (likely missing table):', error.message);
    } else {
        console.log('provider_bank_accounts table EXISTS');
    }
}

checkBankTable();
