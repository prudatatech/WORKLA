import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';

export default async function draftRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/drafts — Get active drafts for the user
    // ──────────────────────────────────────────────
    fastify.get('/', async (request, reply) => {
        const user = request.user;

        try {
            const { data, error } = await supabaseAdmin
                .from('booking_drafts')
                .select(`
                    *,
                    service_subcategories (id, name, image_url)
                `)
                .eq('user_id', user.sub)
                .gt('expires_at', new Date().toISOString())
                .order('updated_at', { ascending: false });

            if (error) throw error;

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch drafts.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/drafts — Create or update a draft
    // ──────────────────────────────────────────────
    const upsertDraftSchema = {
        body: {
            type: 'object',
            required: ['serviceId'],
            properties: {
                serviceId: { type: 'string', format: 'uuid' },
                formData: { type: 'object' },
                currentStep: { type: 'integer', minimum: 1 },
                totalSteps: { type: 'integer', minimum: 1 }
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/', { schema: upsertDraftSchema }, async (request, reply) => {
        const user = request.user;
        const body = request.body;

        try {
            const now = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const draftPayload = {
                user_id: user.sub,
                service_id: body.serviceId,
                form_data: body.formData || {},
                current_step: body.currentStep || 1,
                total_steps: body.totalSteps || 3,
                updated_at: now,
                expires_at: expiresAt,
            };

            // Try to find an existing draft for this user + service first
            const { data: existing } = await supabaseAdmin
                .from('booking_drafts')
                .select('id')
                .eq('user_id', user.sub)
                .eq('service_id', body.serviceId)
                .limit(1)
                .maybeSingle();

            let data;
            if (existing) {
                // Update existing draft
                const { data: updated, error } = await supabaseAdmin
                    .from('booking_drafts')
                    .update(draftPayload)
                    .eq('id', existing.id)
                    .select()
                    .single();
                if (error) throw error;
                data = updated;
            } else {
                // Insert new draft
                const { data: inserted, error } = await supabaseAdmin
                    .from('booking_drafts')
                    .insert(draftPayload)
                    .select()
                    .single();
                if (error) throw error;
                data = inserted;
            }

            return reply.send({ success: true, data });
        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Failed to save draft.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // DELETE /api/v1/drafts/:id — Delete a specific draft
    // ──────────────────────────────────────────────
    const deleteDraftSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.delete('/:id', { schema: deleteDraftSchema }, async (request, reply) => {
        const { id } = request.params;
        const user = request.user;

        try {
            const { error } = await supabaseAdmin
                .from('booking_drafts')
                .delete()
                .eq('id', id)
                .eq('user_id', user.sub);

            if (error) throw error;

            return reply.send({ success: true, message: 'Draft deleted.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to delete draft.', details: err.message });
        }
    });
}
