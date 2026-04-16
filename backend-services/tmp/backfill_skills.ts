import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
  const subcatId = 'ddc42ccd-978c-4363-af66-2004f91f89f4'; // the subcat requested by the booking
  
  // Update provider_details array so the app UI shows it checked
  await supabaseAdmin.from('provider_details').update({
     supported_subservices: [subcatId]
  }).eq('provider_id', providerId);
  
  // The trigger should automatically insert into provider_services. 
  // Let's verify:
  const { data: ps } = await supabaseAdmin.from('provider_services').select('*').eq('provider_id', providerId);
  console.log("Automatically synced provider_services:", ps);
}
check().catch(console.error);
