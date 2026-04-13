import { supabaseAdmin } from '../lib/supabase';
import { EventBus } from '../events/bus';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUS_FLOW } from '../lib/constants';
import { FastifyBaseLogger } from 'fastify';
import { cache } from '../lib/cache';

/**
 * JobService
 * 
 * Unified service for handling job lifecycle logic, specifically around 
 * acquisitions, assignment, and status-dependent state consistency.
 */
export const JobService = {
    /**
     * Checks if a provider is currently busy with an active job.
     * Returns the active booking ID if busy, otherwise null.
     */
    getActiveJob: async (providerId: string): Promise<string | null> => {
        const { data, error } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('provider_id', providerId)
            .in('status', ACTIVE_BOOKING_STATUSES)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('[JobService] getActiveJob check failed:', error.message);
            return null;
        }

        return data ? data.id : null;
    },

    isProviderBusy: async (providerId: string): Promise<boolean> => {
        return (await JobService.getActiveJob(providerId)) !== null;
    },

    acceptJobOffer: async (providerId: string, offerId: string, bookingId: string, reqId: string, logger: FastifyBaseLogger) => {
        logger.info({ providerId, offerId, bookingId, reqId }, '[JobService] Attempting atomic job acceptance');

        const { data, error } = await supabaseAdmin.rpc('accept_job_offer_rpc', {
            p_provider_id: providerId,
            p_offer_id: offerId,
            p_booking_id: bookingId
        });

        if (error) {
            logger.error({ error: error.message, providerId, bookingId }, '[JobService] RPC Execution Failed');
            throw error;
        }

        const result = data as { success: boolean, code?: string, message?: string, customer_id?: string };

        if (!result.success) {
            logger.warn({ code: result.code, message: result.message, providerId, bookingId }, '[JobService] Atomic acceptance rejected');
            throw { statusCode: 409, code: result.code, message: result.message };
        }

        logger.info({ providerId, bookingId }, '[JobService] Atomic acceptance successful');

        // 🔥 Direct Cache Invalidation (no pattern matching to avoid Upstash KEYS blocking)
        if (result.customer_id) {
            cache.invalidate(`bookings:${result.customer_id}:customer:all:0:20`).catch(() => {});
            cache.invalidate(`bookings:${result.customer_id}:customer:requested,searching:0:20`).catch(() => {});
        }
        cache.invalidate(`bookings:${providerId}:provider:confirmed,en_route,arrived,in_progress:0:20`).catch(() => {});
        cache.invalidate(`bookings:${providerId}:provider:all:0:20`).catch(() => {});

        // Fire event for notification
        EventBus.publish('booking.confirmed', {
            bookingId,
            providerId,
        }, { 'x-request-id': reqId });

        return true;
    },

    confirmBookingManual: async (bookingId: string, providerId: string, reqId: string, logger: FastifyBaseLogger) => {
        logger.info({ bookingId, providerId, reqId }, '[JobService] Admin manually confirming booking');
        
        const { data, error } = await supabaseAdmin.rpc('confirm_booking_manual_rpc', {
            p_booking_id: bookingId,
            p_provider_id: providerId
        });

        if (error) {
            logger.error({ error: error.message, bookingId }, '[JobService] Manual Confirmation RPC Failed');
            throw error;
        }

        const result = data as { success: boolean, code?: string, message?: string, customer_id?: string };

        if (!result.success) {
            logger.warn({ code: result.code, message: result.message, providerId, bookingId }, '[JobService] Manual confirmation rejected');
            throw { statusCode: 409, code: result.code, message: result.message };
        }

        logger.info({ bookingId, providerId }, '[JobService] Manual Confirmation Successful');

        // 🔥 Direct Cache Invalidation (no pattern matching)
        if (result.customer_id) {
            cache.invalidate(`bookings:${result.customer_id}:customer:all:0:20`).catch(() => {});
            cache.invalidate(`bookings:${result.customer_id}:customer:requested,searching:0:20`).catch(() => {});
        }
        cache.invalidate(`bookings:${providerId}:provider:confirmed,en_route,arrived,in_progress:0:20`).catch(() => {});
        cache.invalidate(`bookings:${providerId}:provider:all:0:20`).catch(() => {});

        // 3. Notify
        EventBus.publish('booking.confirmed', {
            bookingId,
            providerId,
        }, { 'x-request-id': reqId });

        return true;
    },

    cleanupStaleOffers: async (booking_id: string, exceptOfferId?: string) => {
        const query = supabaseAdmin
            .from('job_offers')
            .update({ status: 'expired', responded_at: new Date().toISOString() })
            .eq('booking_id', booking_id)
            .eq('status', 'pending');

        if (exceptOfferId) {
            query.neq('id', exceptOfferId);
        }

        await query;
    },

    expireStaleOffers: async () => {
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        await supabaseAdmin
            .from('job_offers')
            .update({ status: 'expired', responded_at: new Date().toISOString() })
            .eq('status', 'pending')
            .lt('offered_at', fiveMinsAgo);
    },

    rejectJobOffer: async (providerId: string, offerId: string, reason?: string) => {
        const { data: offer, error: fetchError } = await supabaseAdmin
            .from('job_offers')
            .select('id, status')
            .eq('id', offerId)
            .eq('provider_id', providerId)
            .single();

        if (fetchError || !offer) {
            throw { statusCode: 404, code: 'NOT_FOUND', message: 'Job offer not found.' };
        }

        if (offer.status !== 'pending') {
            throw { statusCode: 409, code: 'INVALID_STATUS', message: `This offer is already ${offer.status}.` };
        }

        const { error } = await supabaseAdmin
            .from('job_offers')
            .update({
                status: 'rejected',
                responded_at: new Date().toISOString(),
                rejection_reason: reason || null,
            })
            .eq('id', offerId)
            .eq('status', 'pending'); // Atomic check

        if (error) throw error;
        return true;
    },

    /**
     * Enterprise Hardened: Update booking status with state machine enforcement.
     */
    updateBookingStatus: async (
        bookingId: string, 
        newStatus: string, 
        userId: string,
        logger: FastifyBaseLogger,
        metadata: { cancellationReason?: string, proofUrl?: string } = {}
    ) => {
        logger.info({ bookingId, newStatus, userId }, '[JobService] Attempting status transition');

        // 1. Fetch current status and ownership context
        const { data: booking, error: fetchError } = await supabaseAdmin
            .from('bookings')
            .select('status, customer_id, provider_id')
            .eq('id', bookingId)
            .single();

        if (fetchError || !booking) {
            logger.error({ fetchError, booking, bookingId }, '[JobService] Booking not found during initial fetch');
            throw { statusCode: 404, code: 'NOT_FOUND', message: 'Booking not found.' };
        }

        // 2. Idempotency Check: If already in target status, return early success
        if (booking.status === newStatus) {
            logger.info({ bookingId, status: booking.status }, '[JobService] Already in target status, returning success for idempotency.');
            const { data: fullBooking } = await supabaseAdmin
                .from('bookings')
                .select('*')
                .eq('id', bookingId)
                .single();
            return fullBooking;
        }

        // 3. State Machine Validation
        const allowedTransitions = BOOKING_STATUS_FLOW[booking.status] || [];
        if (!allowedTransitions.includes(newStatus)) {
            logger.warn({ current: booking.status, target: newStatus }, '[JobService] Illegal status transition attempted');
            throw { 
                statusCode: 400, 
                code: 'ILLEGAL_TRANSITION', 
                message: `Cannot move booking from ${booking.status} to ${newStatus}.` 
            };
        }

        // 3. Atomic Database Update via Hardened RPC
        const { data, error } = await supabaseAdmin.rpc('update_booking_status_hardened_rpc', {
            p_booking_id: bookingId,
            p_new_status: newStatus,
            p_user_id: userId,
            p_cancellation_reason: metadata.cancellationReason || null,
            p_proof_url: metadata.proofUrl || null
        });

        if (error) {
            logger.error({ error: error.message }, '[JobService] Atomic status update failed');
            throw { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Failed to execute status update RPC.' };
        }

        const result = data as { success: boolean, code?: string, message?: string, booking?: any };

        if (!result.success) {
            logger.warn({ code: result.code, message: result.message }, '[JobService] Atomic status update rejected by RPC');
            throw { statusCode: 409, code: result.code || 'CONFLICT', message: result.message || 'Status transition failed.' };
        }

        const updatedBooking = result.booking;

        // 5. Shared side-effects: Direct Cache Invalidation (no pattern matching)
        if (updatedBooking.customer_id) {
            cache.invalidate(`bookings:${updatedBooking.customer_id}:customer:all:0:20`).catch(() => {});
            cache.invalidate(`bookings:${updatedBooking.customer_id}:customer:confirmed,en_route,arrived,in_progress:0:20`).catch(() => {});
        }
        if (updatedBooking.provider_id) {
            cache.invalidate(`bookings:${updatedBooking.provider_id}:provider:all:0:20`).catch(() => {});
            cache.invalidate(`bookings:${updatedBooking.provider_id}:provider:confirmed,en_route,arrived,in_progress:0:20`).catch(() => {});
            cache.invalidate(`bookings:${updatedBooking.provider_id}:provider:completed:0:20`).catch(() => {});
            cache.invalidate(`bookings:${updatedBooking.provider_id}:provider:cancelled:0:20`).catch(() => {});
        }

        // 6. Shared side-effects: Event Publishing
        EventBus.publish(`booking.${newStatus}`, { bookingId }, { 'x-request-id': 'system-internal' });

        logger.info({ bookingId, from: booking.status, to: newStatus }, '[JobService] Status transition successful');
        return updatedBooking;
    },

    getCancellationQuote: async (bookingId: string, logger: FastifyBaseLogger) => {
        logger.info({ bookingId }, '[JobService] Fetching cancellation quote');

        const { data, error } = await supabaseAdmin.rpc('calculate_cancellation_penalty', {
            p_booking_id: bookingId
        });

        if (error) {
            logger.error({ error: error.message }, '[JobService] Failed to calculate cancellation penalty');
            throw { statusCode: 500, code: 'CALCULATION_FAILED', message: 'Failed to calculate cancellation fee.' };
        }

        return data as { penalty: number; reason: string; grace_remaining_seconds?: number };
    }
};
