const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load env from backend-services
dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
    console.log('--- 🔍 DATABASE DIAGNOSTIC ---');
    
    // 1. Check Earnings View
    console.log('\n[1] Checking provider_earnings_summary view...');
    const { data: earningData, error: earningError } = await supabase
        .from('provider_earnings_summary')
        .select('*')
        .limit(1);
    
    if (earningError) {
        console.error('❌ Earnings View Error:', earningError.message);
    } else {
        console.log('✅ Earnings View exists.');
    }

    // 2. Check worker_earnings table
    console.log('\n[2] Checking worker_earnings table...');
    const { data: workerData, error: workerError } = await supabase
        .from('worker_earnings')
        .select('*')
        .limit(1);
    if (workerError) console.error('❌ worker_earnings Error:', workerError.message);
    else console.log('✅ worker_earnings exists.');

    // 4. Check update_provider_location RPC
    console.log('\n[4] Checking update_provider_location RPC...');
    const { error: rpcError } = await supabase.rpc('update_provider_location', {
        p_provider_id: '00000000-0000-0000-0000-000000000000',
        p_latitude: 0,
        p_longitude: 0
    });
    if (rpcError && rpcError.message.includes('does not exist')) {
        console.error('❌ update_provider_location RPC Missing');
    } else {
        console.log('✅ update_provider_location RPC found or reachable.');
    }

    // 5. Test History Join
    console.log('\n[5] Testing History Join...');
    const { data: history, error: historyErr } = await supabase
        .from('worker_earnings')
        .select('*, bookings(service_name_snapshot)')
        .limit(1);
    
    if (historyErr) {
        console.error('❌ History Join Error:', historyErr.message);
        const { data: cols } = await supabase.from('bookings').select('*').limit(1);
        if (cols && cols.length > 0) console.log('✅ Bookings Columns:', Object.keys(cols[0]).join(', '));
    } else {
        console.log('✅ History Join works.');
    }

    console.log('\n--- DIAGNOSTIC COMPLETE ---');
}

diagnose();
