import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { CommonSchemas } from '../lib/schemas';

export default async function notificationRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/notifications — User notification inbox
    // ──────────────────────────────────────────────
    const listNotificationsSchema = {
        querystring: {
            type: 'object',
            properties: {
                unreadOnly: { type: 'boolean', default: false },
                ...CommonSchemas.Pagination.properties
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.PaginatedResponse({ type: 'object', additionalProperties: true }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/', { schema: listNotificationsSchema }, async (request, reply) => {
        const user = request.user;
        const { limit = 20, offset = 0, unreadOnly = false } = request.query;

        try {
            let query = supabaseAdmin
                .from('notifications')
                .select('*', { count: 'exact' })
                .eq('user_id', user.sub)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (unreadOnly) {
                query = query.eq('is_read', false);
            }

            const { data, error, count } = await query;
            if (error) throw error;

            // Also get unread count
            const { count: unreadCount } = await supabaseAdmin
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.sub)
                .eq('is_read', false);

            return reply.send({
                success: true,
                count: count || 0,
                unreadCount: unreadCount || 0,
                data: data || [],
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch notifications.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/notifications/:id/read — Mark a notification as read
    // ──────────────────────────────────────────────
    const markReadSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.patch('/:id/read', { schema: markReadSchema }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;

        try {
            const { data, error } = await supabaseAdmin
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.sub) // Ensure user owns this notification
                .select()
                .single();

            if (error) throw error;

            return reply.send({ success: true, message: 'Notification marked as read.', data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update notification.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/notifications/read-all — Mark all notifications as read
    // ──────────────────────────────────────────────
    const readAllSchema = {
        body: {
            type: 'object',
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.patch('/read-all', { schema: readAllSchema }, async (request, reply) => {
        const user = request.user;

        try {
            const { error } = await supabaseAdmin
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('user_id', user.sub)
                .eq('is_read', false);

            if (error) throw error;

            return reply.send({ success: true as const, message: 'All notifications marked as read.', data: {} });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update all notifications.', details: err.message });
        }
    });
}
