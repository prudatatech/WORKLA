import { supabaseAdmin } from '../src/lib/supabase';
import fs from 'fs';

async function applyFix() {
    const sql = fs.readFileSync('../supabase/migrations/096_hardened_acceptance_fix.sql', 'utf8');
    console.log('Applying migration 096...');
    
    // We try to use a dummy RPC to run the SQL if exec_sql doesn't exist,
    // though usually we'd need a way to run arbitrary SQL.
    // If I can't run it via RPC, I'll have to ask the user to run it.
    
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql });
    
    if (error) {
        console.error('Failed to apply fix via RPC:', error);
        console.log('Please apply the contents of supabase/migrations/096_hardened_acceptance_fix.sql manually in the Supabase SQL Editor.');
    } else {
        console.log('Fix applied successfully!');
    }
}

applyFix();
