import { supabaseAdmin } from '../src/lib/supabase';

async function testAccept() {
    console.log('--- Testing Job Acceptance RPC ---');
    const bookingId = 'bd2c6054-154c-4825-9d8a-99e05036eb15';
    const offerId = '32d81c06-3cfb-43e5-8300-3c84fdf42b5d';
    const providerId = '14900651-067f-4b5c-82a7-f63c3932c4a9';

    const { data: bookingBefore } = await supabaseAdmin.from('bookings').select('status').eq('id', bookingId).single();
    console.log('Booking Status Before:', bookingBefore?.status);

    const { data, error } = await supabaseAdmin.rpc('accept_job_offer_rpc', {
        p_provider_id: providerId,
        p_offer_id: offerId,
        p_booking_id: bookingId
    });

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Result:', JSON.stringify(data, null, 2));
    }

    const { data: bookingAfter } = await supabaseAdmin.from('bookings').select('status, provider_id').eq('id', bookingId).single();
    console.log('Booking Status After:', bookingAfter?.status, 'Provider:', bookingAfter?.provider_id);
}

testAccept();
