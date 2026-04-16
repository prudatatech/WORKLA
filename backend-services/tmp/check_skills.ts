import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
  
  const { data: services, error } = await supabaseAdmin.from('provider_services').select('*').eq('provider_id', providerId);
  console.log("Services:", services);
  console.log("Error:", error);
}
check().catch(console.error);
