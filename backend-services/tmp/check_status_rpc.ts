import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  console.log("Checking update_booking_status_hardened_rpc...");
  const { error } = await supabaseAdmin.rpc('update_booking_status_hardened_rpc', {
      p_booking_id: '00000000-0000-0000-0000-000000000000',
      p_new_status: 'en_route',
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_cancellation_reason: null,
      p_proof_url: null
  });
  
  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("RPC call initiated (likely returned success: false or similar).");
  }
}

check().catch(console.error);
