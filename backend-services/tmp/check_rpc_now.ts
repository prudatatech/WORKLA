import { supabaseAdmin } from '../src/lib/supabase';

async function checkFunc() {
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { 
        sql: "SELECT prosrc FROM pg_proc WHERE proname = 'accept_job_offer_rpc'" 
    });
    
    if (error) {
        console.error('Error fetching function def:', error);
    } else {
        // Output the source as JSON to avoid truncation if possible
        console.log('Function Definition:', JSON.stringify(data?.[0]?.prosrc, null, 2));
    }
}

checkFunc();
