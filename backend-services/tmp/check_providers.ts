import { supabaseAdmin } from '../src/lib/supabase';

async function checkProviders() {
    console.log('--- Checking All Providers ---');
    const { data: providers, error } = await supabaseAdmin
        .from('provider_details')
        .select('*');
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('All Providers:', JSON.stringify(providers, null, 2));
    }
}

checkProviders();
