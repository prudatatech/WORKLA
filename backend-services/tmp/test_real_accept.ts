import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
  // Get the latest pending offer for this provider
  const { data: offer } = await supabaseAdmin
    .from('job_offers')
    .select('*')
    .eq('provider_id', providerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!offer) {
    console.error("No pending offer found to test acceptance.");
    return;
  }

  console.log("Attempting to accept offer:", offer.id, "for booking:", offer.booking_id);

  const { data, error } = await supabaseAdmin.rpc('accept_job_offer_rpc', {
    p_provider_id: providerId,
    p_offer_id: offer.id,
    p_booking_id: offer.booking_id
  });

  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("RPC Result:", data);
  }
}

check().catch(console.error);
