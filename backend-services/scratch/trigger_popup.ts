import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase';

async function triggerPopup() {
    console.log('--- Triggering Provider Popup ---');
    
    const providerId = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
    const bookingId = 'c8fb6a53-1472-49ef-91fb-588123deead1';
    
    // This will trigger the Supabase Realtime listener in the provider app
    const { data, error } = await supabaseAdmin.from('notifications').insert({
        user_id: providerId,
        title: 'New Service Request! 🚀',
        body: `Testing popup via DB trigger.`,
        data: {
            type: 'new_job',
            bookingId: bookingId,
            offerId: '8e855711-af9f-417b-b38d-bfb916cc1a38',
            amount: 550,
            serviceName: 'Test Service',
            address: 'Provider Testing Address'
        },
        is_read: false
    });
    
    if (error) {
        console.error('Failed to trigger popup:', error.message);
    } else {
        console.log('Popup triggered successfully! Check the provider app.');
    }
}

triggerPopup();
