
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/vikas/Desktop/WorkLogisticsandAllocation-0f10915cebc590ef1465bf49f1f83478b88a77aa/backend-services/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('--- Checking provider_details ---');
    const { data: cols1, error: err1 } = await supabase.from('provider_details').select('*').limit(0);
    if (err1) console.error('Error fetching provider_details columns:', err1);
    else console.log('Columns in provider_details:', Object.keys(cols1[0] || {}));

    console.log('\n--- Checking provider_locations ---');
    const { data: cols2, error: err2 } = await supabase.from('provider_locations').select('*').limit(0);
    if (err2) console.error('Error fetching provider_locations columns:', err2);
    else console.log('Columns in provider_locations:', Object.keys(cols2[0] || {}));
}

checkSchema();
