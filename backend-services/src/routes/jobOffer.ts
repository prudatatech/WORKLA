import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { JobService } from '../services/jobService';
import { cache } from '../lib/cache';

export default async function jobOfferRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/job-offers — List pending offers for the provider
    // ──────────────────────────────────────────────
    const listJobOffersSchema = {
        querystring: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'expired'], default: 'pending' },
                limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
                offset: { type: 'integer', minimum: 0, default: 0 }
            }
        }
    } as const;

    fastify.get('/', { schema: listJobOffersSchema }, async (request, reply) => {
        const user = request.user;
        const { status = 'pending', limit = 20, offset = 0 } = request.query as any;
        const refresh = !!((request.query as any).refresh === 'true');
        const noCache = request.headers['cache-control'] === 'no-cache';
        const forceRefresh = refresh || noCache;

        if (user.role !== 'PROVIDER' && user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        const cacheKey = `job_offers:${user.sub}:${status}:${offset}:${limit}`;

        try {
            const responseData = await cache.getOrSet(cacheKey, async () => {
                // 1. Lazy Expiration: Mark offers older than 5 mins as expired
                await JobService.expireStaleOffers();

                // 2. Fetch current offers
                const { data, error, count } = await supabaseAdmin
                    .from('job_offers')
                    .select(`
                        *,
                        bookings (
                            id, booking_number, service_id, scheduled_date, scheduled_time_slot,
                            customer_address, customer_latitude, customer_longitude, special_instructions,
                            profiles!bookings_customer_id_fkey (full_name, phone, avatar_url)
                        )
                    `, { count: 'exact' })
                    .eq('provider_id', user.sub)
                    .eq('status', status)
                    .order('offered_at', { ascending: false })
                    .range(offset, offset + limit - 1);

                if (error) throw error;

                return { success: true, count: count || 0, data: data || [] };
            }, 30, forceRefresh);

            return reply.send(responseData);
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch job offers.', details: err.message });
        }
    });


    // ──────────────────────────────────────────────
    // POST /api/v1/job-offers/:id/accept — Provider accepts the offer
    // ──────────────────────────────────────────────
    const acceptJobOfferSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.post('/:id/accept', { schema: acceptJobOfferSchema }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            // Verify the offer belongs to this provider and is pending
            const { data: offer, error: fetchError } = await supabaseAdmin
                .from('job_offers')
                .select('id, booking_id, status')
                .eq('id', id)
                .eq('provider_id', user.sub)
                .single();

            if (fetchError || !offer) {
                return reply.code(404).send({ error: 'Job offer not found.' });
            }
            if (offer.status !== 'pending') {
                return reply.code(409).send({ error: `This offer is already ${offer.status}.` });
            }

            await JobService.acceptJobOffer(user.sub, offer.id, offer.booking_id, request.id, request.log);

            return reply.send({
                success: true,
                message: 'Job offer accepted. You are now assigned to this booking.',
            });
        } catch (err: any) {
            fastify.log.error(err);
            if (err.statusCode) {
                return reply.code(err.statusCode).send({ error: err.code, message: err.message });
            }
            return reply.code(500).send({ error: 'Failed to accept offer.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/job-offers/by-booking/:bookingId/accept — Accept job by Booking ID
    // ──────────────────────────────────────────────
    const claimJobSchema = {
        params: {
            type: 'object',
            required: ['bookingId'],
            properties: {
                bookingId: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.post('/by-booking/:bookingId/accept', { schema: claimJobSchema }, async (request, reply) => {
        const user = request.user;
        const { bookingId } = request.params;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            // Find a pending offer for this booking and provider
            const { data: offer, error: fetchError } = await supabaseAdmin
                .from('job_offers')
                .select('id, booking_id')
                .eq('booking_id', bookingId)
                .eq('provider_id', user.sub)
                .eq('status', 'pending')
                .single();

            if (fetchError || !offer) {
                return reply.code(404).send({ error: 'No pending job offer found for this booking.' });
            }

            await JobService.acceptJobOffer(user.sub, offer.id, offer.booking_id, request.id, request.log);

            return reply.send({ success: true, message: 'Job claimed successfully.' });
        } catch (err: any) {
            fastify.log.error(err);
            if (err.statusCode) {
                return reply.code(err.statusCode).send({ error: err.code, message: err.message });
            }
            return reply.code(500).send({ error: 'Failed to claim job.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/job-offers/:id/reject — Provider declines the offer
    // ──────────────────────────────────────────────
    const rejectJobOfferSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        body: {
            type: 'object',
            properties: {
                reason: { type: 'string', maxLength: 255 }
            }
        }
    } as const;

    fastify.post('/:id/reject', { schema: rejectJobOfferSchema }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { reason } = request.body;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            await JobService.rejectJobOffer(user.sub, id, reason);

            return reply.send({ success: true, message: 'Job offer rejected.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to reject offer.', details: err.message });
        }
    });
}
