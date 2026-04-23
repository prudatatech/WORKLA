
import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function diagnose() {
    console.log('--- Inspecting Constraints ---');
    
    const { data, error } = await supabaseAdmin.rpc('inspect_constraints', { p_table_name: 'booking_drafts' });
    
    if (error) {
        console.log('inspect_constraints RPC failed. Trying generic query RPC if it exists...');
        // Try to see if there is a 'query' or 'exec' RPC - unlikely but worth a check of available RPCs
        const { data: rpcs, error: rpcErr } = await supabaseAdmin.from('_rpc').select('*').limit(1); // This is not how it works
    } else {
        console.log('Constraints:', JSON.stringify(data, null, 2));
    }

    // Try to get table info via postgrest introspection if enabled
    // Actually, let's just try to insert a draft with a known service ID and a known subcategory ID and see which one works.
    
    const { data: srv } = await supabaseAdmin.from('services').select('id').limit(1).single();
    const { data: sub } = await supabaseAdmin.from('service_subcategories').select('id').limit(1).single();
    
    console.log('Testing with Service ID:', srv?.id);
    console.log('Testing with Subcategory ID:', sub?.id);

    if (srv) {
        const { error: err1 } = await supabaseAdmin.from('booking_drafts').insert({
            user_id: '00000000-0000-0000-0000-000000000000', // Dummy
            service_id: srv.id,
            expires_at: new Date().toISOString()
        });
        console.log('Insert with Service ID result:', err1 ? err1.message : 'Success');
    }

    if (sub) {
        const { error: err2 } = await supabaseAdmin.from('booking_drafts').insert({
            user_id: '00000000-0000-0000-0000-000000000000', // Dummy
            service_id: sub.id,
            expires_at: new Date().toISOString()
        });
        console.log('Insert with Subcategory ID result:', err2 ? err2.message : 'Success');
    }
}

diagnose();
