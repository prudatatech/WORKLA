const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend-services/.env' });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabaseAdmin.from('bookings').select('id, status, provider_id, customer_id, scheduled_date').order('created_at', { ascending: false }).limit(5);
  console.log("RECENT BOOKINGS:", data);
  if (error) console.error("ERROR:", error);
}
check();
