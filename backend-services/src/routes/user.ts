import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { CommonSchemas } from '../lib/schemas';

export default async function userRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/users/me — Get authenticated user profile
    // ──────────────────────────────────────────────
    fastify.get('/me', async (request, reply) => {
        const user = request.user;

        try {
            // Fetch profile
            const { data: profile, error: profileErr } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('id', user.sub)
                .single();

            if (profileErr) throw profileErr;

            // Fetch wallet balance
            const { data: wallet } = await supabaseAdmin
                .from('wallets')
                .select('balance')
                .eq('customer_id', user.sub)
                .single();

            // Fetch unread notifications count
            const { count: unreadCount } = await supabaseAdmin
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.sub)
                .eq('is_read', false);

            return reply.send({ 
                success: true, 
                data: {
                    ...profile,
                    wallet_balance: wallet?.balance || 0,
                    unread_notifications: unreadCount || 0
                } 
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch profile.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/users/me — Update own profile
    // ──────────────────────────────────────────────
    const updateMeSchema = {
        body: {
            type: 'object',
            properties: {
                full_name: { type: 'string', minLength: 2 },
                phone: { type: 'string', pattern: '^[0-9+ ]+$' },
                avatar_url: { type: 'string', format: 'uri' },
                bio: { type: 'string', maxLength: 500 },
                business_name: { type: 'string', maxLength: 255 },
                gstin: { type: 'string', pattern: '^[0-9A-Z]{15}$' }
            },
            additionalProperties: false
        }
    } as const;

    fastify.patch('/me', { schema: updateMeSchema }, async (request, reply) => {
        const user = request.user;
        const updates = request.body;

        if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Access Denied: Use the provider/admin endpoints for non-customer updates.' });
        }

        if (Object.keys(updates).length === 0) {
            return reply.code(400).send({ error: 'No fields provided for update.' });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', user.sub)
                .select()
                .single();

            if (error) throw error;

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update profile.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/users/me/bookings/stats — Quick booking stats
    // ──────────────────────────────────────────────
    fastify.get('/me/bookings/stats', async (request, reply) => {
        const user = request.user;

        try {
            const [totalResult, activeResult, completedResult] = await Promise.all([
                supabaseAdmin
                    .from('bookings')
                    .select('*', { count: 'exact', head: true })
                    .eq('customer_id', user.sub),
                supabaseAdmin
                    .from('bookings')
                    .select('*', { count: 'exact', head: true })
                    .eq('customer_id', user.sub)
                    .in('status', ['requested', 'confirmed', 'in_progress']),
                supabaseAdmin
                    .from('bookings')
                    .select('*', { count: 'exact', head: true })
                    .eq('customer_id', user.sub)
                    .eq('status', 'completed'),
            ]);

            return reply.send({
                success: true,
                data: {
                    total: totalResult.count || 0,
                    active: activeResult.count || 0,
                    completed: completedResult.count || 0,
                },
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch stats.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/users/push-token — Register Expo Push Token
    // ──────────────────────────────────────────────
    const updatePushTokenSchema = {
        body: {
            type: 'object',
            required: ['token'],
            properties: {
                token: { type: 'string', minLength: 10 }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({ type: 'object', properties: { token: { type: 'string' } } }),
            400: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.patch('/push-token', { schema: updatePushTokenSchema }, async (request, reply) => {
        const user = request.user;
        const { token } = request.body;

        try {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update({ 
                    expo_push_token: token,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', user.sub);

            if (error) throw error;

            request.log.info(`[PushToken] Updated token for user ${user.sub}`);

            return reply.send({ 
                success: true, 
                data: { token } 
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update push token.', details: err.message });
        }
    });
}
