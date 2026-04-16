import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const { data, error } = await supabaseAdmin.rpc('inspect_schema_logic', { p_proname: 'accept_job_offer_rpc' });
  
  if (error) {
    // If inspect_schema_logic doesn't exist, try raw SQL via a known functional RPC or just check if the accept rpc itself works
    console.log("Checking accept_job_offer_rpc directly...");
    const { error: rpcError } = await supabaseAdmin.rpc('accept_job_offer_rpc', {
        p_provider_id: '00000000-0000-0000-0000-000000000000',
        p_offer_id: '00000000-0000-0000-0000-000000000000',
        p_booking_id: '00000000-0000-0000-0000-000000000000'
    });
    console.log("RPC Error (if any):", rpcError);
  } else {
    console.log("Function definition:", data);
  }
}

check().catch(console.error);
