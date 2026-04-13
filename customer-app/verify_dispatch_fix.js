
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Try to find .env file in the current directory or parent
let envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.join(process.cwd(), 'customer-app', '.env');
}

if (!fs.existsSync(envPath)) {
    console.error('Could not find .env file at:', envPath);
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrlMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const supabaseKeyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (!supabaseUrlMatch || !supabaseKeyMatch) {
    console.error('Supabase credentials not found in .env');
    process.exit(1);
}

const supabaseUrl = supabaseUrlMatch[1].trim();
const supabaseKey = supabaseKeyMatch[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('--- DB Verification ---');

    // Check Triggers on bookings
    const { data: triggers, error: tErr } = await supabase.rpc('exec_sql', {
        sql: "SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'bookings'"
    });
    console.log('BookingsTriggers:', triggers || tErr);

    // Check Functions
    const { data: functions, error: fErr } = await supabase.rpc('exec_sql', {
        sql: "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name LIKE '%dispatch%'"
    });
    console.log('DispatchFunctions:', functions || fErr);

    // Check Constraints on job_offers
    const { data: constraints, error: cErr } = await supabase.rpc('exec_sql', {
        sql: "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'job_offers'"
    });
    console.log('JobOffersConstraints:', constraints || cErr);

    // Check Online Providers
    const { data: onlineCount } = await supabase
        .from('provider_details')
        .select('*', { count: 'exact', head: true })
        .eq('is_online', true);
    console.log('Online Providers:', onlineCount);

    // Check Recent Bookings with 'searching'
    const { data: recentSearching } = await supabase
        .from('bookings')
        .select('id, status, created_at')
        .eq('status', 'searching')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log('Recent Searching Bookings:', recentSearching);
}

verify().catch(console.error);
