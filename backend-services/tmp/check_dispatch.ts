import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const { data: bookings } = await supabaseAdmin.from('bookings').select('*').order('created_at', { ascending: false }).limit(1);
  if (!bookings || bookings.length === 0) {
    console.log("No bookings found");
    return;
  }
  const booking = bookings[0];
  console.log("Last Booking:", booking.id, booking.status, booking.subcategory_id);

  const { data: providers } = await supabaseAdmin.from('provider_details').select('provider_id, verification_status, is_online');
  console.log("Providers:");
  console.log(JSON.stringify(providers, null, 2));

  if (providers && providers.length > 0) {
    for (const p of providers) {
      const { data: loc } = await supabaseAdmin.from('provider_locations').select('*').eq('provider_id', p.provider_id).single();
      console.log(`Provider ${p.provider_id} Location:`, loc ? loc.recorded_at : 'No location');

      const { data: srv } = await supabaseAdmin.from('provider_services').select('*').eq('provider_id', p.provider_id);
      console.log(`Provider ${p.provider_id} Services:`, srv?.map(s => s.subcategory_id));
    }
  }

  const { data: offers } = await supabaseAdmin.from('job_offers').select('*').eq('booking_id', booking.id);
  console.log("Job Offers for this booking:", offers);
}

check().catch(console.error);
