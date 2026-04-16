import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const { data: b } = await supabaseAdmin.from('bookings').select('*').order('created_at', { ascending: false }).limit(1).single();
  const { data: res, error } = await supabaseAdmin.rpc('dispatch_job', { p_booking_id: b.id });
  console.log("Redispatched. Inserted providers count:", res, error);
}
check().catch(console.error);
