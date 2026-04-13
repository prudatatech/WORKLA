import { supabaseAdmin } from '../src/lib/supabase';

async function checkOffer() {
    const bookingId = 'bd2c6054-154c-4825-9d8a-99e05036eb15';
    const providerId = '14900651-067f-4b5c-82a7-f63c3932c4a9';
    
    const { data: offer, error } = await supabaseAdmin
        .from('job_offers')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('provider_id', providerId)
        .single();
        
    console.log('Offer Status:', JSON.stringify(offer, null, 2));
    
    const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select('status, provider_id')
        .eq('id', bookingId)
        .single();
        
    console.log('Booking Final:', JSON.stringify(booking, null, 2));
}

checkOffer();
