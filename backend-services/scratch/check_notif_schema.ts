import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function checkNotifSchema() {
    console.log('--- Checking Notification Table Schema ---');
    
    // Create a dummy record with only user_id and title to see if it succeeds and what columns it has
    const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
    const { data: row1, error: err1 } = await supabaseAdmin.from('notifications').insert({
        user_id: providerId,
        title: 'Test',
        body: 'Test'
    }).select().single();
    
    if (err1) {
        console.log('Insert bare failed:', err1.message);
    } else {
        console.log('Columns in notifications:', Object.keys(row1));
        await supabaseAdmin.from('notifications').delete().eq('id', row1.id);
    }
}

checkNotifSchema();
