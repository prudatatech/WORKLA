import { supabaseAdmin } from '../src/lib/supabase';

async function getId() {
    const { data } = await supabaseAdmin.from('provider_details').select('provider_id, verification_status, is_online');
    console.log('DATA:' + JSON.stringify(data));
}

getId();
