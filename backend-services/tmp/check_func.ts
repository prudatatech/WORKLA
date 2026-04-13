import { supabaseAdmin } from '../src/lib/supabase';

async function checkFunc() {
    const { data, error } = await supabaseAdmin.rpc('get_func_def', { f_name: 'is_location_in_service_zone' });
    // If rpc fails, try raw query
    if (error) {
        const { data: rawData, error: rawError } = await supabaseAdmin.from('_dummy').select('*').limit(1).then(() => {
            return supabaseAdmin.rpc('exec_sql', { sql: "SELECT prosrc FROM pg_proc WHERE proname = 'is_location_in_service_zone'" });
        });
        console.log('DEF:' + JSON.stringify(rawData));
    } else {
        console.log('DEF:' + JSON.stringify(data));
    }
}

checkFunc();
