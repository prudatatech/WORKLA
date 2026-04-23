import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function testNotif() {
    console.log('--- Testing Notification Insert ---');
    
    const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
    const bookingId = 'c8fb6a53-1472-49ef-91fb-588123deead1';
    
    const { data, error } = await supabaseAdmin.from('notifications').insert({
        user_id: providerId,
        title: 'New Service Request! 🚀',
        body: `Test available now.`,
        type: 'new_job',
        data: {
            bookingId: bookingId,
            offerId: '8e855711-af9f-417b-b38d-bfb916cc1a38',
            amount: 100,
            serviceName: 'Test',
            address: 'Test Addr'
        },
        is_read: false
    });
    
    if (error) {
        console.error('Insert Error:', error.message, error.details, error.hint);
    } else {
        console.log('Insert Success!');
    }
}

testNotif();
