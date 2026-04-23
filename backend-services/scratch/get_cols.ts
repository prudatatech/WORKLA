
import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function diagnose() {
    const dummyId = '00000000-0000-0000-0000-000000000000';
    const { data: sub, error: subErr } = await supabaseAdmin.from('service_subcategories').select('id').limit(1).single();
    
    if (subErr) {
        console.error('Error fetching subcategory:', subErr.message);
        return;
    }

    const { error: insErr } = await supabaseAdmin.from('booking_drafts').insert({
        user_id: dummyId,
        service_id: sub.id,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        form_data: {},
        current_step: 1,
        total_steps: 4
    });
    
    if (insErr) {
        console.error('Insert error:', insErr.message);
        return;
    }

    const { data: row, error: selErr } = await supabaseAdmin.from('booking_drafts').select('*').eq('user_id', dummyId).single();
    if (selErr) {
        console.error('Select error:', selErr.message);
    } else if (row) {
        console.log('Columns in booking_drafts:', Object.keys(row));
    }
    
    await supabaseAdmin.from('booking_drafts').delete().eq('user_id', dummyId);
}

diagnose();
