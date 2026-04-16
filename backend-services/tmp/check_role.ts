import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
  const { data: profile } = await supabaseAdmin.from('profiles').select('id, role').eq('id', providerId).single();
  console.log("Profile role:", profile);
}
check().catch(console.error);
