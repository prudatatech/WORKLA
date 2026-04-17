import { supabaseAdmin } from '../../lib/supabase';
import { emitToUser } from '../../socket';
import { EventBus } from '../bus';
import { InvoiceService } from '../../services/invoiceService';
import { PushNotificationService } from '../../services/pushNotificationService';

/**
 * Notification & Dispatch Worker
 * 
 * Subscribes to backend domain events and:
 *   1. Persists a notification record in Postgres (`notifications` table).
 *   2. Emits a real-time socket event so the in-app toast fires instantly.
 */
export async function startNotificationWorker() {
    console.warn('🤖 Notification Worker started. Listening for events...');

    // ──────────────────────────────────────────────
    // Helper: persist + emit a notification
    // ──────────────────────────────────────────────
    async function notifyUser(
        userId: string,
        title: string,
        body: string,
        type: string,
        payload: Record<string, any> = {}
    ) {
        // 1. Persist in the `notifications` table
        // Elite Hardening: Track both in-app and push delivery status
        const { error } = await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            title,
            body,
            type,
            data: payload,
            is_read: false,
            delivery_status: { 
                in_app: 'delivered',
                push_sent: true,
                pushed_at: new Date().toISOString()
            }
        });

        if (error) {
            console.error(`[Worker ❌] Failed to insert notification for ${userId}:`, error.message);
        }

        // 2. Emit socket event for instant in-app toast
        emitToUser(userId, 'notification:alert', {
            title,
            body,
            type,
            data: payload
        });

        // 3. 🚀 Push Notification Delivery (for "Always On")
        // Job alerts use high-priority channel with ringtone. All others use default.
        try {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('expo_push_token')
                .eq('id', userId)
                .single();
            
            if (profile?.expo_push_token) {
                if (type === 'new_job' || type === 'job_nudge') {
                    // 🔔 High-priority: wakes device even when app is killed
                    await PushNotificationService.sendJobAlert(
                        profile.expo_push_token,
                        title,
                        body,
                        { ...payload, type }
                    );
                } else {
                    await PushNotificationService.sendNotification(
                        profile.expo_push_token,
                        title,
                        body,
                        { ...payload, type }
                    );
                }
            }
        } catch (pushErr: any) {
            console.error(`[Worker ⚠️] Push delivery skipped for ${userId}:`, pushErr.message);
        }
    }

    /**
     * 🚀 AUTO-NUDGE LOOP (Delayed 5 minutes)
     * If a booking is still 'searching' after 5 mins, nudge the top providers.
     */
    async function scheduleNudge(bookingId: string) {
        setTimeout(async () => {
            console.warn(`[Worker ⏰] Running 5-min nudge check for booking ${bookingId}`);
            
            const { data: booking } = await supabaseAdmin
                .from('bookings')
                .select('status, booking_number, service_name_snapshot')
                .eq('id', bookingId)
                .single();

            if (booking && booking.status === 'searching') {
                console.warn(`[Worker ⚡] Booking ${bookingId} still unfilled. Nudging providers...`);
                
                // Find providers who were offered but haven't responded
                const { data: offers } = await supabaseAdmin
                    .from('job_offers')
                    .select('provider_id')
                    .eq('booking_id', bookingId)
                    .eq('status', 'pending')
                    .limit(5);

                if (offers) {
                    for (const offer of offers) {
                        await notifyUser(
                            offer.provider_id, 
                            'Job Still Available! ⏳', 
                            `Booking ${booking.booking_number} for ${booking.service_name_snapshot} is still waiting for a provider. Check it out!`,
                            'job_nudge',
                            { bookingId }
                        );
                    }
                }
            }
        }, 5 * 60 * 1000); // 5 Minutes
    }


    // ──────────────────────────────────────────────
    // Consolidated Worker Group: workla-notification-worker
    // ──────────────────────────────────────────────
    const topics = [
        'booking.created',
        'booking.confirmed',
        'booking.en_route',
        'booking.arrived',
        'booking.completed',
        'booking.disputed',
        'booking.cancelled',
        'booking.rescheduled',
        'provider.status_changed',
        'payout.status_changed',
        'referral.reward_credited',
        'payment.received',
        'payment.refunded',
        'provider.document_reviewed'
    ];

    EventBus.subscribe(topics, async (data: any, _headers, topic) => {
        try {
            switch (topic) {
                case 'booking.created': {
                    console.warn(`[Worker 🔔] Handling 'booking.created' for ID ${data.bookingId}...`);
                    
                    // ⚡ DISPATCH: Find eligible providers and create job_offers
                    const { data: dispatchCount, error: dispatchError } = await supabaseAdmin
                        .rpc('dispatch_job', { p_booking_id: data.bookingId });
                    
                    if (dispatchError) {
                        console.error(`[Worker ❌] dispatch_job RPC failed:`, dispatchError.message);
                    } else {
                        console.warn(`[Worker 📡] dispatch_job created ${dispatchCount} offers for booking ${data.bookingId}`);
                    }

                    // ⏰ Schedule a nudge in 5 mins if still searching
                    scheduleNudge(data.bookingId);

                    // Now fetch the newly created offers and notify providers
                    const { data: b } = await supabaseAdmin.from('bookings').select('id, booking_number, total_amount, customer_address, service_name_snapshot').eq('id', data.bookingId).single();
                    const { data: offers } = await supabaseAdmin.from('job_offers').select('id, provider_id').eq('booking_id', data.bookingId).eq('status', 'pending');
                    if (offers && offers.length > 0) {
                        for (const offer of offers) {
                            await notifyUser(offer.provider_id, 'New Service Request! 🚀', `${b?.service_name_snapshot || 'New Job'} available now.`, 'new_job', { bookingId: data.bookingId, offerId: offer.id, amount: b?.total_amount, serviceName: b?.service_name_snapshot, address: b?.customer_address });
                        }
                        console.warn(`[Worker ✅] Notified ${offers.length} providers for booking ${data.bookingId}`);
                    } else {
                        console.warn(`[Worker ⚠️] No eligible providers found for booking ${data.bookingId}. Check: provider skills, online status, verification, proximity.`);
                    }
                    break;
                }
                case 'booking.confirmed': {
                    const { data: booking } = await supabaseAdmin.from('bookings').select('customer_id, booking_number').eq('id', data.bookingId).single();
                    if (booking) await notifyUser(booking.customer_id, 'Provider Assigned! ✅', `A provider has confirmed your booking ${booking.booking_number}.`, 'booking_update', { bookingId: data.bookingId, status: 'confirmed' });
                    break;
                }
                case 'booking.en_route': {
                    const { data: booking } = await supabaseAdmin.from('bookings').select('customer_id').eq('id', data.bookingId).single();
                    if (booking) await notifyUser(booking.customer_id, 'Provider is En Route! 🚴‍♂️', 'Your provider is on the way to your location.', 'booking_update', { bookingId: data.bookingId, status: 'en_route' });
                    break;
                }
                case 'booking.arrived': {
                    const { data: booking } = await supabaseAdmin.from('bookings').select('customer_id').eq('id', data.bookingId).single();
                    if (booking) await notifyUser(booking.customer_id, 'Provider Arrived! 🏠', 'Your provider has reached your location.', 'booking_update', { bookingId: data.bookingId, status: 'arrived' });
                    break;
                }
                case 'booking.completed': {
                    const { data: booking } = await supabaseAdmin.from('bookings').select('customer_id').eq('id', data.bookingId).single();
                    if (booking) await notifyUser(booking.customer_id, 'Job Completed! ✨', 'Your service request has been successfully completed. Please leave a rating!', 'booking_update', { bookingId: data.bookingId, status: 'completed' });
                    
                    // 📄 Generate GST Invoice
                    try {
                        await InvoiceService.generateInvoice(data.bookingId);
                        console.warn(`[Worker 📄] Invoice generated for completed booking ${data.bookingId}`);
                    } catch (invErr: any) {
                        console.error(`[Worker ❌] Invoice generation failed for ${data.bookingId}:`, invErr.message);
                    }
                    break;
                }
                case 'booking.disputed': {
                    const { data: booking } = await supabaseAdmin.from('bookings').select('customer_id, provider_id, booking_number').eq('id', data.bookingId).single();
                    if (booking) {
                        await notifyUser(booking.customer_id, 'Booking Disputed ⚠️', `Your booking ${booking.booking_number} has been marked as disputed. Support will review shortly.`, 'booking_update', { bookingId: data.bookingId, status: 'disputed' });
                        if (booking.provider_id) await notifyUser(booking.provider_id, 'Job Disputed ⚠️', `Job ${booking.booking_number} has been marked as disputed. Please stop work if in progress.`, 'booking_update', { bookingId: data.bookingId, status: 'disputed' });
                    }
                    break;
                }
                case 'booking.cancelled': {
                    const { data: booking } = await supabaseAdmin.from('bookings').select('customer_id, provider_id, booking_number').eq('id', data.bookingId).single();
                    if (booking) {
                        await notifyUser(booking.customer_id, 'Booking Cancelled ❌', `Your booking ${booking.booking_number} has been cancelled.`, 'booking_update', { bookingId: data.bookingId, status: 'cancelled' });
                        if (booking.provider_id) await notifyUser(booking.provider_id, 'Job Cancelled ❌', `Job ${booking.booking_number} has been cancelled by the customer.`, 'booking_update', { bookingId: data.bookingId, status: 'cancelled' });
                    }
                    break;
                }
                case 'booking.rescheduled': {
                    console.warn(`[Worker 🔔] Handling 'booking.rescheduled' for ID ${data.bookingId}...`);
                    
                    // 1. Fetch booking details (including the potentially cleared provider_id from events)
                    const { data: booking } = await supabaseAdmin.from('bookings').select('id, booking_number, customer_id, provider_id, service_name_snapshot, scheduled_date, scheduled_time_slot').eq('id', data.bookingId).single();
                    if (!booking) break;

                    // 2. Notify Customer
                    await notifyUser(booking.customer_id, 'Rescheduled Successfully 📅', `Your booking ${booking.booking_number} is now scheduled for ${booking.scheduled_date} at ${booking.scheduled_time_slot}.`, 'booking_update', { bookingId: data.bookingId, status: 'rescheduled' });

                    // 3. Notify Previous Provider (if was confirmed)
                    // We can check the most recent event to find who was the previous provider
                    const { data: lastEvent } = await supabaseAdmin
                        .from('booking_events')
                        .select('metadata')
                        .eq('booking_id', data.bookingId)
                        .eq('event_type', 'rescheduled')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    if (lastEvent?.metadata?.old_provider_id) {
                        await notifyUser(
                            lastEvent.metadata.old_provider_id, 
                            'Job Rescheduled 📅', 
                            `Job ${booking.booking_number} has been rescheduled by the customer. You are no longer assigned to this job.`,
                            'job_cancelled',
                            { bookingId: data.bookingId }
                        );
                    }

                    // 4. Re-Dispatch: Trigger dispatch_job RPC
                    const { data: dispatchCount, error: dispatchError } = await supabaseAdmin
                        .rpc('dispatch_job', { p_booking_id: data.bookingId });
                    
                    if (dispatchError) {
                        console.error(`[Worker ❌] dispatch_job (reschedule) failed:`, dispatchError.message);
                    } else {
                        console.warn(`[Worker 📡] Re-dispatched rescheduled job ${data.bookingId}. New offers: ${dispatchCount}`);
                    }

                    // 5. Notify New Providers (similar to booking.created)
                    const { data: offers } = await supabaseAdmin.from('job_offers').select('id, provider_id').eq('booking_id', data.bookingId).eq('status', 'pending');
                    if (offers) {
                        for (const offer of offers) {
                            await notifyUser(offer.provider_id, 'New Job (Rescheduled) 🚀', `${booking.service_name_snapshot} available for new slot.`, 'new_job', { bookingId: data.bookingId, offerId: offer.id });
                        }
                    }

                    break;
                }
                case 'payout.status_changed': {
                    const statusText = data.status === 'completed' ? 'Approved ✅' : 'Rejected ❌';
                    const message = data.status === 'completed' 
                        ? `Your withdrawal of ₹${data.amount} has been approved and disbursed.🏦`
                        : `Your withdrawal of ₹${data.amount} was rejected. ${data.remarks ? 'Reason: ' + data.remarks : 'Please contact support for details.'}`;
                    
                    await notifyUser(
                        data.providerId, 
                        `Payout ${statusText}`, 
                        message, 
                        'payout_update', 
                        { payoutId: data.payoutId, status: data.status, amount: data.amount }
                    );
                    break;
                }
                case 'referral.reward_credited': {
                    await notifyUser(
                        data.userId,
                        data.rewardType === 'welcome' ? '🎁 Welcome Reward!' : '🎉 Referral Reward!',
                        `You earned ₹${data.amount} in your Workla Wallet. Check it out!`,
                        'payment',
                        { amount: data.amount, rewardType: data.rewardType }
                    );
                    break;
                }
                case 'provider.status_changed':
                    console.warn(`[Worker 📡] Provider ${data.providerId} went ${data.isOnline ? 'ONLINE' : 'OFFLINE'}`);
                    break;
                case 'payment.received':
                    console.warn(`[Worker 💰] Payment clearing for TSX ${data.transactionId} — ₹${data.amount}`);
                    break;
                case 'payment.refunded':
                    console.warn(`[Worker 💸] Payment refunded for booking ${data.bookingId}. Generating Credit Note...`);
                    try {
                        await InvoiceService.generateInvoice(data.bookingId, 'CREDIT_NOTE');
                        const { data: booking } = await supabaseAdmin.from('bookings').select('customer_id').eq('id', data.bookingId).single();
                        if (booking) await notifyUser(booking.customer_id, 'Refund Processed 💸', 'A credit note has been generated and is available in your booking history.', 'payment');
                    } catch (cnErr: any) {
                        console.error(`[Worker ❌] Credit Note generation failed:`, cnErr.message);
                    }
                    break;
                case 'provider.document_reviewed': {
                    const { documentId, status, rejectionReason } = data;
                    // Fetch document info to get provider_id and type
                    const { data: doc } = await supabaseAdmin
                        .from('provider_documents')
                        .select('provider_id, document_type')
                        .eq('id', documentId)
                        .single();

                    if (doc) {
                        const title = status === 'verified' ? 'Document Verified! ✅' : 'Document Rejected ❌';
                        const body = status === 'verified' 
                            ? `Your ${doc.document_type.toUpperCase()} has been approved. You're one step closer to going online!`
                            : `Your ${doc.document_type.toUpperCase()} was rejected: ${rejectionReason || 'Please re-upload a clear image.'}`;

                        await notifyUser(doc.provider_id, title, body, 'verification_update', { documentId, status });
                    }
                    break;
                }
            }
        } catch (error: any) {
            console.error(`[Worker ❌] Failed to process ${topic} for ${data.bookingId || data.providerId}:`, error.message);
        }
    }, 'workla-notification-worker');
}
