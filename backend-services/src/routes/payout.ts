import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';

export default async function payoutRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    fastify.addHook('preValidation', requireAuth);

    /**
     * POST /api/v1/payouts/request
     * Allows a provider to request a withdrawal of their balance.
     */
    const payoutRequestSchema = {
        body: {
            type: 'object',
            required: ['amount'],
            properties: {
                amount: { type: 'number', minimum: 100 } // Minimum withdrawal limit
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/request', { schema: payoutRequestSchema }, async (request, reply) => {
        const user = request.user;
        const { amount } = request.body;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied: Only providers can request payouts.' });
        }

        try {
            // 1. Check provider balance (wallet)
            const { data: wallet, error: walletErr } = await supabaseAdmin
                .from('wallets')
                .select('balance')
                .eq('user_id', user.sub)
                .single();

            if (walletErr || !wallet) {
                return reply.code(400).send({ error: 'Wallet not found.' });
            }

            if (wallet.balance < amount) {
                return reply.code(400).send({ error: 'Insufficient balance.' });
            }

            // 2. Create payout record
            const { data: payout, error: payoutErr } = await supabaseAdmin
                .from('payouts')
                .insert({
                    provider_id: user.sub,
                    amount: amount,
                    status: 'pending'
                })
                .select()
                .single();

            if (payoutErr) throw payoutErr;

            // 3. Optional: Deduct from wallet immediately (or wait for approval?)
            // Usually, we deduct immediately and mark it as "frozen" or just decrease balance
            // For now, we'll keep it simple and just record the request.
            
            return reply.send({
                success: true,
                message: 'Payout request submitted successfully.',
                data: payout
            });

        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Failed to process payout request.', details: err.message });
        }
    });

    /**
     * GET /api/v1/payouts/history
     * Get payout history for the logged in provider
     */
    const payoutHistorySchema = {
        querystring: {
            type: 'object',
            properties: {
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                offset: { type: 'integer', minimum: 0, default: 0 }
            }
        }
    } as const;

    fastify.get('/history', { schema: payoutHistorySchema }, async (request, reply) => {
        const user = request.user;
        const { limit = 20, offset = 0 } = request.query;

        if (user.role !== 'PROVIDER' && user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('payouts')
                .select('*')
                .eq('provider_id', user.sub)
                .order('initiated_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                console.error('[PAYOUT ERROR]', error.message);
                throw error;
            }

            return reply.send({ success: true, data });
        } catch {
            return reply.code(500).send({ error: 'Failed to fetch payout history.' });
        }
    });
}
