import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';

export default async function availabilityRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/availability — Get provider availability
    // ──────────────────────────────────────────────
    fastify.get('/', async (request, reply) => {
        const user = request.user;
        
        if (user.role !== 'PROVIDER' && user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Access Denied: Provider role required.' });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('provider_availability')
                .select('*')
                .eq('provider_id', user.sub)
                .order('day_of_week', { ascending: true })
                .order('start_time', { ascending: true });

            if (error) throw error;

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch availability.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/availability — Bulk upsert availability
    // ──────────────────────────────────────────────
    const bulkUpsertSchema = {
        body: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
                type: 'object',
                required: ['day_of_week', 'start_time', 'end_time'],
                properties: {
                    day_of_week: { type: 'integer', minimum: 0, maximum: 6 },
                    start_time: { type: 'string', pattern: '^([01]\\d|2[0-3]):?([0-5]\\d)$' },
                    end_time: { type: 'string', pattern: '^([01]\\d|2[0-3]):?([0-5]\\d)$' },
                    is_available: { type: 'boolean' }
                },
                additionalProperties: false
            }
        }
    } as const;

    fastify.post('/', { schema: bulkUpsertSchema }, async (request, reply) => {
        const user = request.user;
        const slots = request.body;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied: Only providers can set availability.' });
        }

        try {
            // Add provider_id to each slot
            const processedSlots = slots.map(s => ({
                ...s,
                provider_id: user.sub,
                updated_at: new Date().toISOString()
            }));

            const { data, error } = await supabaseAdmin
                .from('provider_availability')
                .upsert(processedSlots, { onConflict: 'provider_id, day_of_week, start_time' })
                .select();

            if (error) throw error;

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to save availability.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/availability/:id — Toggle availability
    // ──────────────────────────────────────────────
    const toggleAvailabilitySchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        body: {
            type: 'object',
            required: ['is_available'],
            properties: {
                is_available: { type: 'boolean' }
            },
            additionalProperties: false
        }
    } as const;

    fastify.patch('/:id', { schema: toggleAvailabilitySchema }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { is_available } = request.body;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('provider_availability')
                .update({ 
                    is_available,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .eq('provider_id', user.sub) // Security check
                .select()
                .single();

            if (error) throw error;

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update availability slot.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // DELETE /api/v1/availability/:id — Remove a slot
    // ──────────────────────────────────────────────
    const deleteSlotSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.delete('/:id', { schema: deleteSlotSchema }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            const { error } = await supabaseAdmin
                .from('provider_availability')
                .delete()
                .eq('id', id)
                .eq('provider_id', user.sub);

            if (error) throw error;

            return reply.send({ success: true, message: 'Slot removed.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to delete availability slot.', details: err.message });
        }
    });
}
