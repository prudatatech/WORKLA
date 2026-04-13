import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function check() {
  const providerId = "14900651-067f-4b5c-82a7-f63c3932c4a9";
  let query = supabaseAdmin
      .from('bookings')
      .select('id, status, provider_id', { count: 'exact' })
      .order('created_at', { ascending: false });

  query = query.eq('provider_id', providerId);
  const statusStr = 'confirmed,en_route,arrived,in_progress';
  query = query.in('status', statusStr.split(','));

  const { data, error, count } = await query;
  console.log("Count:", count);
  console.log("Data:", JSON.stringify(data, null, 2));
  if (error) console.error("ERR:", error);
}
check();
