import { supabaseAdmin } from '../src/lib/supabase';

async function checkLoc() {
    const { data } = await supabaseAdmin.from('provider_locations').select('*').eq('provider_id', '033a890a-a50d-45da-966e-52ba73591461').single();
    console.log('LOC:' + JSON.stringify(data));
}

checkLoc();
