import { supabaseAdmin } from '../src/lib/supabase';

async function check() {
  const { data, error } = await supabaseAdmin.from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  if (error) {
    console.error("Error fetching tables:", error);
    return;
  }
  
  console.log("Existing tables in public schema:");
  console.log(data.map(t => t.table_name).sort());
}

check().catch(console.error);
