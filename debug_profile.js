
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'd:/WorkLAA-main/backend-services/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pId = '14900651-067f-4b5c-82a7-f63c3932c4a9';

async function debug() {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', pId).single();
    console.log('Profile:', JSON.stringify(profile));
}

debug();
