
import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function diagnose() {
    console.log('--- Inspecting booking_drafts table ---');
    
    // Get column info
    const { data: cols, error: colsErr } = await supabaseAdmin.rpc('get_table_columns', { p_table_name: 'booking_drafts' });
    if (colsErr) {
        console.error('Error getting columns (RPC might not exist, trying fallback):', colsErr.message);
        // Fallback: just try to select one row
        const { data: sample, error: sampleErr } = await supabaseAdmin.from('booking_drafts').select('*').limit(1);
        if (sampleErr) {
            console.error('Error fetching sample:', sampleErr.message);
        } else {
            console.log('Sample row (keys only):', Object.keys(sample[0] || {}));
        }
    } else {
        console.log('Columns:', cols);
    }

    // Get constraints info via a generic query if possible, or just look for fk_booking_draft_service
    // Since we can't run raw SQL easily without a helper RPC, let's try to infer from data or existing RPCs.
    
    // Check if we can find what fk_booking_draft_service points to by looking at typical naming conventions
    // or by trying to insert a dummy record and seeing the error (already done in logs).
    
    // The logs said: fk_booking_draft_service
    // Usually this would be: 
    // ALTER TABLE booking_drafts ADD CONSTRAINT fk_booking_draft_service FOREIGN KEY (service_id) REFERENCES services(id);
    // BUT in the GET route (line 22 of draft.ts), it was joining with `service_subcategories`.
    
    // Let's check if 'service_subcategories' exists and has 'id'.
    const { data: subcats, error: subErr } = await supabaseAdmin.from('service_subcategories').select('id').limit(1);
    console.log('service_subcategories check:', subErr ? subErr.message : 'Exists');

    const { data: services, error: servErr } = await supabaseAdmin.from('services').select('id').limit(1);
    console.log('services check:', servErr ? servErr.message : 'Exists');
}

diagnose();
