
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/vikas/Desktop/WorkLogisticsandAllocation-0f10915cebc590ef1465bf49f1f83478b88a77aa/backend-services/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
    const testProviderId = '85e791f2-430c-4573-987a-62f928a38b28'; // Just a placeholder, hopefully exists or doesn't matter for schema test
    console.log('Testing update_provider_location RPC...');
    const { data, error } = await supabase.rpc('update_provider_location', {
        p_provider_id: testProviderId,
        p_latitude: 27.1767,
        p_longitude: 78.0081
    });

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Success:', data);
    }
}

testRpc();
