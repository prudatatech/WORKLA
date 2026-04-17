require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'profiles' });
    if (error) {
        // If RPC doesn't exist, try a simple select
        const { data: cols, error: err2 } = await supabase.from('profiles').select('*').limit(1);
        if (cols && cols.length > 0) {
            console.log('Columns:', Object.keys(cols[0]));
        } else {
            console.log('Error or no data:', err2 || 'No rows');
        }
    } else {
        console.log('Columns:', data);
    }
}
check();
