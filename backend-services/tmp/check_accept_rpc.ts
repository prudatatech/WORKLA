import { supabaseAdmin } from '../src/lib/supabase';

async function checkFunc() {
    const { data, error } = await supabaseAdmin.rpc('exec_sql', { 
        sql: "SELECT prosrc FROM pg_proc WHERE proname = 'accept_job_offer_rpc'" 
    });
    
    if (error) {
        console.error('Error fetching function def:', error);
    } else {
        console.log('Function Definition:', JSON.stringify(data, null, 2));
    }
}

checkFunc();
