import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
  
  const { data: details } = await supabaseAdmin.from('provider_details').select('*').eq('provider_id', providerId).single();
  console.log("Provider details:", details);
}
check().catch(console.error);
