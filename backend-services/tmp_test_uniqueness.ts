
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActualConstraints() {
    console.log('Checking for PRIMARY KEY or UNIQUE constraints on public.bookings(id)...');
    
    // We'll try to insert a duplicate ID. If it succeeds, it's definitely NOT a PK.
    const testId = '00000000-0000-0000-0000-000000000000';
    
    console.log('Attempting to insert two rows with same ID to test uniqueness...');
    // We use a dummy booking number to avoid that constraint
    const dummyBooking = {
        id: testId,
        booking_number: 'TEST-12345',
        customer_id: '14900651-067f-4b5c-82a7-f63c3932c4a9',
        service_name_snapshot: 'Test',
        scheduled_date: '2026-03-18',
        customer_address: 'Test',
        catalog_price: 0,
        total_amount: 0
    };

    const { error: error1 } = await supabase.from('bookings').insert(dummyBooking);
    if (error1) {
        console.log('First insert error (might be expected if row exists):', error1.message);
    } else {
        const { error: error2 } = await supabase.from('bookings').insert({...dummyBooking, booking_number: 'TEST-54321'});
        if (error2) {
            console.log('Second insert FAILED (This means ID IS UNIQUE/PK):', error2.message);
        } else {
            console.log('Second insert SUCCEEDED!!! ID IS NOT A PRIMARY KEY!');
        }
    }
    
    // Cleanup
    await supabase.from('bookings').delete().eq('id', testId);
}

checkActualConstraints();
