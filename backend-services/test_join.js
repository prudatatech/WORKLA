const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
    console.log('--- JOIN TEST ---');
    const { error } = await supabase
        .from('worker_earnings')
        .select('*, bookings!booking_id(service_name_snapshot)')
        .limit(1);
    
    if (error) {
        console.log('Error with !booking_id:');
        console.log(error.message);
    } else {
        console.log('Success with !booking_id');
    }

    const { error: error2 } = await supabase
        .from('worker_earnings')
        .select('*, bookings(service_name_snapshot)')
        .limit(1);
    
    if (error2) {
        console.log('Error with standard join:');
        console.log(error2.message);
    } else {
        console.log('Success with standard join');
    }
}

diagnose();
