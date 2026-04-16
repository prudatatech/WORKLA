import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const { data: bookings, error: be } = await supabaseAdmin.from('bookings').select('*').order('created_at', { ascending: false }).limit(2);
  console.log("Latest Bookings:", bookings?.map(b => ({ id: b.id, status: b.status, service_id: b.service_id, subcat: b.subcategory_id })));
  
  if (bookings && bookings.length > 0) {
    const b = bookings[0];
    const { data: offers, error: oe } = await supabaseAdmin.from('job_offers').select('*').eq('booking_id', b.id);
    console.log("Job Offers for newest booking:", offers, oe);
  }

  const { data: ps } = await supabaseAdmin.from('provider_services').select('*').limit(5);
  console.log("Sample Provider Services mapping:", ps);
}
check().catch(console.error);
