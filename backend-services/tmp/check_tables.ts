import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
  
  const { data: loc, error: e1 } = await supabaseAdmin.from('provider_locations').select('*').eq('provider_id', providerId);
  console.log("Locations error:", e1);
  
  const { data: avail, error: e2 } = await supabaseAdmin.from('provider_availability').select('*').eq('provider_id', providerId);
  console.log("Avail error:", e2);
}
check().catch(console.error);
