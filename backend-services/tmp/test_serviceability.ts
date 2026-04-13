import { supabaseAdmin } from '../src/lib/supabase';

async function testServiceability() {
    console.log('--- Testing Dynamic Serviceability ---');

    // 1. Define a test location (Agrat, India - near standard defaults)
    const testLat = 27.18;
    const testLng = 78.01;

    // 2. Clear any existing service zones for a clean test
    // (In a real DB we'd be careful, but this is for local/test env logic verification)
    
    // 3. Test 1: No Service Zone, No Provider
    const { data: res1, error: err1 } = await supabaseAdmin.rpc('is_location_in_service_zone', {
        p_lat: testLat,
        p_lng: testLng
    });
    console.log('Test 1 (No coverage):', res1, err1 ? err1.message : '');

    // 4. Test 2: Add an Online Provider within radius
    const testProviderId = '00000000-0000-0000-0000-000000000001'; // Use a placeholder or real test ID
    
    console.log('Setting up test provider...');
    // Ensure provider exists and is verified/online
    await supabaseAdmin.from('profiles').upsert({ id: testProviderId, role: 'PROVIDER', full_name: 'Test Provider' });
    await supabaseAdmin.from('provider_details').upsert({ 
        provider_id: testProviderId, 
        is_online: true, 
        verification_status: 'verified',
        service_radius_km: 15 
    });
    await supabaseAdmin.from('provider_locations').upsert({
        provider_id: testProviderId,
        latitude: testLat + 0.05, // ~5.5km away
        longitude: testLng + 0.05,
        recorded_at: new Date().toISOString()
    });

    const { data: res2, error: err2 } = await supabaseAdmin.rpc('is_location_in_service_zone', {
        p_lat: testLat,
        p_lng: testLng
    });
    console.log('Test 2 (Online Provider nearby):', res2, err2 ? err2.message : '');

    // 5. Test 3: Provider offline
    await supabaseAdmin.from('provider_details').update({ is_online: false }).eq('provider_id', testProviderId);
    const { data: res3, error: err3 } = await supabaseAdmin.rpc('is_location_in_service_zone', {
        p_lat: testLat,
        p_lng: testLng
    });
    console.log('Test 3 (Provider offline):', res3, err3 ? err3.message : '');

    console.log('--- Verification Complete ---');
}

testServiceability();
