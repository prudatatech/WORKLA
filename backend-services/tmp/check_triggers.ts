import { supabaseAdmin } from '../src/lib/supabase';

async function listTriggers() {
    const { data: triggers, error } = await supabaseAdmin.from('_dummy').select('*').limit(1).then(() => {
        return supabaseAdmin.rpc('exec_sql', { 
            sql: "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.bookings'::regclass" 
        });
    }).catch(() => {
        // Fallback: try to see if I can find them in migrations
        return { data: null, error: 'RPC NOT FOUND' };
    });

    if (error) {
        console.error('Trigger check failed:', error);
    } else {
        console.log('Triggers:', JSON.stringify(triggers, null, 2));
    }
}

listTriggers();
