import { supabaseAdmin } from '../src/lib/supabase';

async function listFuncs() {
    const { data, error } = await supabaseAdmin.from('_dummy').select('*').limit(1).then(() => {
        return supabaseAdmin.rpc('get_functions', {}); 
    }).catch(() => ({ data: null, error: 'RPC NOT FOUND' }));
    
    // If that fails, let's try to just call accept_job_offer_rpc with dummy data to see what happens
    console.log('Trying dummy RPC call...');
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('accept_job_offer_rpc', {
        p_provider_id: '00000000-0000-0000-0000-000000000000',
        p_offer_id: '00000000-0000-0000-0000-000000000000',
        p_booking_id: '00000000-0000-0000-0000-000000000000'
    });
    console.log('RPC Response:', rpcData, rpcError);
}

listFuncs();
