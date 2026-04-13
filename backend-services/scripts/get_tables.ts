import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getTables() {
  // Query the information_schema to get all public tables
  const { data, error } = await supabase.rpc('get_all_tables_info_v2').catch(() => null) || 
    await supabase.from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE');
    
  if (error || !data) {
    // Manually fetch via postgres REST if rpc/view fails due to permissions on information_schema (PostgREST hides it)
    console.log("Could not query information_schema directly via client. Attempting another way or will need a raw SQL query.");
  } else {
    console.log("TABLES:", data);
  }
}

getTables();
