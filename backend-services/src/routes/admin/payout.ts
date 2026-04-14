import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../../lib/supabase';
import { requireAuth } from '../../middlewares/auth';
import { EventBus } from '../../events/bus';

export default async function adminPayoutRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ Require auth for all admin routes
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/payouts — List all payout requests
    // ──────────────────────────────────────────────
    const listPayoutsSchema = {
        querystring: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['pending', 'completed', 'rejected'] },
                limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
                offset: { type: 'integer', minimum: 0, default: 0 }
            }
        }
    } as const;

    fastify.get('/', { schema: listPayoutsSchema }, async (request, reply) => {
        const { status, limit = 50, offset = 0 } = request.query;
        try {
            let query = supabaseAdmin
                .from('payout_requests')
                .select('*', { count: 'exact' });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;

            // Enrich with profile data (provider_id -> profiles)
            const providerIds = [...new Set((data || []).map((p: any) => p.provider_id).filter(Boolean))];
            let profilesMap: Record<string, any> = {};
            if (providerIds.length > 0) {
                const { data: profiles } = await supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, phone, email')
                    .in('id', providerIds);
                if (profiles) {
                    profilesMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));
                }
            }

            const enriched = (data || []).map((payout: any) => ({
                ...payout,
                profiles: profilesMap[payout.provider_id] || null
            }));

            return reply.send({ success: true, count, data: enriched });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch payout requests.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/admin/payouts/:id — Update status (Approve/Reject)
    // ──────────────────────────────────────────────
    const updatePayoutSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        body: {
            type: 'object',
            required: ['status'],
            properties: {
                status: { type: 'string', enum: ['completed', 'rejected'] },
                remarks: { type: 'string', maxLength: 500 }
            },
            additionalProperties: false
        }
    } as const;

    fastify.patch('/:id', { schema: updatePayoutSchema }, async (request, reply) => {
        const { id } = request.params;
        const { status, remarks } = request.body;

        try {
            // 1. Fetch the request to ensure it is pending
            const { data: payout, error: fetchError } = await supabaseAdmin
                .from('payout_requests')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError || !payout) {
                return reply.code(404).send({ error: 'Payout request not found.' });
            }

            if (payout.status !== 'pending') {
                return reply.code(409).send({ error: `Request is already ${payout.status}.` });
            }

            // 2. Update status and remarks.
            const { error: updateError } = await supabaseAdmin
                .from('payout_requests')
                .update({
                    status,
                    remarks: remarks || null
                })
                .eq('id', id);

            if (updateError) throw updateError;

            // 3. Emit event for notifications
            EventBus.publish('payout.status_changed', {
                payoutId: id,
                providerId: payout.provider_id,
                status,
                amount: payout.amount,
                remarks: remarks || null
            }, { 'x-request-id': request.id });

            return reply.send({ success: true, message: `Payout request securely marked as ${status}.` });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update payout request.', details: err.message });
        }
    });
}
