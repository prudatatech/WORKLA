import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { CommonSchemas } from '../lib/schemas';

export default async function reviewRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // POST /api/v1/reviews — Submit a review after booking completion
    // ──────────────────────────────────────────────
    const submitReviewSchema = {
        body: {
            type: 'object',
            required: ['bookingId', 'providerId', 'rating'],
            properties: {
                bookingId: { type: 'string', format: 'uuid' },
                providerId: { type: 'string', format: 'uuid' },
                rating: { type: 'integer', minimum: 1, maximum: 5 },
                reviewText: { type: 'string', maxLength: 1000 }
            },
            additionalProperties: false
        },
        response: {
            201: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            409: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.post('/', { schema: submitReviewSchema }, async (request, reply) => {
        const user = request.user;
        const body = request.body;

        try {
            // 1. Check if review already exists for this booking
            const { data: existingReview } = await supabaseAdmin
                .from('booking_reviews')
                .select('id')
                .eq('booking_id', body.bookingId)
                .eq('reviewer_id', user.sub)
                .single();

            if (existingReview) {
                return reply.code(409).send({ error: 'You have already reviewed this booking.' });
            }

            // 2. Insert the review
            const { data, error } = await supabaseAdmin
                .from('booking_reviews')
                .insert({
                    booking_id: body.bookingId,
                    provider_id: body.providerId,
                    reviewer_id: user.sub,
                    rating: body.rating,
                    review_text: body.reviewText || null,
                })
                .select()
                .single();

            if (error) throw error;

            // 3. Update the provider's aggregated rating (materialized view refresh)
            const { error: rpcError } = await supabaseAdmin.rpc('refresh_provider_stats', {
                p_provider_id: body.providerId,
            });

            if (rpcError) {
                fastify.log.warn(`[Reviews ⚠️] Could not refresh stats for ${body.providerId}: ${rpcError.message}`);
            }

            // 4. Update the booking itself with the rating
            const { error: bookingUpdateError } = await supabaseAdmin
                .from('bookings')
                .update({ customer_rating: body.rating })
                .eq('id', body.bookingId);

            if (bookingUpdateError) {
                fastify.log.error(`[Reviews ❌] Failed to update booking ${body.bookingId}: ${bookingUpdateError.message}`);
            }

            return reply.code(201).send({
                success: true,
                message: 'Review submitted successfully.',
                data,
            });
        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Failed to submit review.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/reviews/booking/:bookingId — Get review for a specific booking
    // ──────────────────────────────────────────────
    const getReviewSchema = {
        params: {
            type: 'object',
            required: ['bookingId'],
            properties: {
                bookingId: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            404: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/booking/:bookingId', { schema: getReviewSchema }, async (request, reply) => {
        const { bookingId } = request.params;

        try {
            const { data, error } = await supabaseAdmin
                .from('booking_reviews')
                .select('*, profiles!booking_reviews_reviewer_id_fkey(full_name, avatar_url)')
                .eq('booking_id', bookingId)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
            if (!data) return reply.send({ success: true, data: null, message: 'No review found.' });

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch review.', details: err.message });
        }
    });
}
