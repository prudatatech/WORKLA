
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.join(process.cwd(), 'customer-app', '.env');
}

const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDispatch() {
    console.log('--- End-to-End Dispatch Test ---');

    // 1. Get an online provider to target (optional, just to see if any exist)
    const { data: onlineProviders } = await supabase
        .from('provider_details')
        .select('provider_id, supported_subservices')
        .eq('is_online', true)
        .limit(1);

    if (!onlineProviders || onlineProviders.length === 0) {
        console.log('⚠️ No online providers found. Dispatch cannot be tested fully.');
        // We will still try to insert a booking to see if it even triggers
    } else {
        console.log('✅ Found online provider:', onlineProviders[0].provider_id);
        console.log('Supported services:', onlineProviders[0].supported_subservices);
    }

    // 2. Create a dummy booking
    // Note: We need a valid customer_id. I'll pick a random one if possible or just use a dummy UUID.
    const dummyCustomerId = '00000000-0000-0000-0000-000000000000'; // Might fail FK check

    // Let's try to find an actual customer ID from profiles
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    const customerId = profiles?.[0]?.id || dummyCustomerId;

    const bookingData = {
        customer_id: customerId,
        service_id: '1e5e7834-4b53-488b-a7e8-b7f573c0032e', // Plumber (example)
        subcategory_id: onlineProviders?.[0]?.supported_subservices?.[0] || '89e4776e-8260-474d-97e3-3663b652516d',
        status: 'searching',
        customer_address: 'Test Address',
        total_amount: 500,
        booking_number: 'TEST-' + Math.random().toString(36).substring(7).toUpperCase(),
        customer_latitude: 25.3176, // Varanasi center
        customer_longitude: 82.9739
    };

    console.log('Inserting test booking with status "searching"...');
    const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .insert(bookingData)
        .select()
        .single();

    if (bErr) {
        console.error('Error creating test booking:', bErr);
        return;
    }

    console.log('✅ Booking created:', booking.id);
    console.log('Waiting 3 seconds for trigger to fire...');
    await new Promise(r => setTimeout(r, 3000));

    // 3. Check for job offers
    const { data: offers, error: oErr } = await supabase
        .from('job_offers')
        .select('*')
        .eq('booking_id', booking.id);

    if (oErr) {
        console.error('Error fetching job offers:', oErr);
    } else if (offers && offers.length > 0) {
        console.log(`🚀 SUCCESS! Found ${offers.length} job offers for this booking.`);
        offers.forEach(o => console.log(` - Provider: ${o.provider_id}, Distance: ${o.distance_km}km`));
    } else {
        console.log('❌ No job offers found. Either no providers matched or trigger failed.');
    }

    // Cleanup (optional)
    await supabase.from('bookings').delete().eq('id', booking.id);
    console.log('Cleanup: Test booking deleted.');
}

testDispatch().catch(console.error);
