import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';

export default async function earningsRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/earnings/summary — Provider earnings overview
    // ──────────────────────────────────────────────
    fastify.get('/summary', { schema: { querystring: { type: 'object', additionalProperties: false } } }, async (request, reply) => {
        const user = request.user;

        if (user.role !== 'PROVIDER' && user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            // Priority 1: Try the optimized view
            const { data, error } = await supabaseAdmin
                .from('provider_earnings_summary')
                .select('*')
                .eq('provider_id', user.sub)
                .single();

            if (error) {
                // If view fails (e.g. missing), Fallback to direct calculation
                if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    
                    const { data: todayStats } = await supabaseAdmin
                        .from('worker_earnings')
                        .select('net_amount')
                        .eq('provider_id', user.sub)
                        .gte('created_at', todayStr);

                    const { count: jobCount } = await supabaseAdmin
                        .from('worker_earnings')
                        .select('*', { count: 'exact', head: true })
                        .eq('provider_id', user.sub);

                    return reply.send({
                        success: true,
                        data: {
                            todayNet: (todayStats || []).reduce((sum, e) => sum + Number(e.net_amount), 0),
                            jobCount: jobCount || 0,
                            rating: 0 // Default until profile is fetched
                        }
                    });
                }
                throw error;
            }

            return reply.send({
                success: true,
                data: {
                    todayNet: Number(data.today_net || 0),
                    jobCount: Number(data.completed_jobs || 0),
                    rating: Number(data.rating || 0)
                },
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch earnings.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/earnings/history — Paginated transaction history
    // ──────────────────────────────────────────────
    const historySchema = {
        querystring: {
            type: 'object',
            properties: {
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                offset: { type: 'integer', minimum: 0, default: 0 }
            }
        }
    } as const;

    fastify.get('/history', { schema: historySchema }, async (request, reply) => {
        const user = request.user;
        const { limit = 20, offset = 0 } = request.query;

        if (user.role !== 'PROVIDER' && user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            // Step 1: Fetch raw earnings
            const { data: earnings, error, count } = await supabaseAdmin
                .from('worker_earnings')
                .select('*', { count: 'exact' })
                .eq('provider_id', user.sub)
                .order('created_at', { ascending: false })
                .range(offset, offset + Number(limit) - 1);

            if (error) throw error;

            // Step 2: Fetch related bookings manually to avoid join/relationship errors
            const bookingIds = (earnings || []).map(e => e.booking_id).filter(Boolean);
            let bookingsMap: Record<string, any> = {};

            if (bookingIds.length > 0) {
                const { data: bookings } = await supabaseAdmin
                    .from('bookings')
                    .select('id, service_name_snapshot')
                    .in('id', bookingIds);
                
                if (bookings) {
                    bookingsMap = bookings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {});
                }
            }

            // Map to EarningItem format
            const history = (earnings || []).map(item => ({
                id: item.id,
                type: 'earning',
                description: bookingsMap[item.booking_id]?.service_name_snapshot || 'Job Earning',
                amount: item.net_amount,
                status: item.status,
                created_at: item.created_at,
                payment_method: 'online'
            }));

            return reply.send({ success: true, count, data: history });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch history.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/earnings/wallet — Get wallet balance
    // ──────────────────────────────────────────────
    fastify.get('/wallet', { schema: { querystring: { type: 'object', additionalProperties: false } } }, async (request, reply) => {
        const user = request.user;

        try {
            const { data: summary, error } = await supabaseAdmin
                .from('provider_earnings_summary')
                .select('total_earnings')
                .eq('provider_id', user.sub)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            return reply.send({
                success: true,
                data: {
                    digital_balance: Number(summary?.total_earnings || 0),
                    total_liability: 0, // Placeholder
                    total_earned: Number(summary?.total_earnings || 0),
                },
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch wallet.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/earnings/wallet/topup — Top up wallet balance
    // ──────────────────────────────────────────────
    const topupSchema = {
        body: {
            type: 'object',
            required: ['amount'],
            properties: {
                amount: { type: 'number', minimum: 1, maximum: 50000 },
                paymentMethod: { type: 'string', enum: ['upi', 'card', 'netbanking'], default: 'upi' }
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/wallet/topup', { schema: topupSchema }, async (request, reply) => {
        const user = request.user;
        const { amount, paymentMethod = 'upi' } = request.body;

        try {
            // 1. Get or create wallet
            const { data: initialWallet, error: walletError } = await supabaseAdmin
                .from('wallets')
                .select('user_id, balance')
                .eq('user_id', user.sub)
                .single();
            
            let wallet = initialWallet;

            if (walletError && walletError.code === 'PGRST116') {
                // No wallet exists — create one
                const { data: newWallet, error: createError } = await supabaseAdmin
                    .from('wallets')
                    .insert({ user_id: user.sub, balance: 0 })
                    .select('user_id, balance')
                    .single();
                if (createError) throw createError;
                wallet = { id: newWallet.user_id, balance: newWallet.balance };
            } else if (walletError) {
                throw walletError;
            }

            const newBalance = (wallet!.balance || 0) + amount;

            // 2. Update balance
            const { error: updateError } = await supabaseAdmin
                .from('wallets')
                .update({ balance: newBalance })
                .eq('id', wallet!.id);

            if (updateError) throw updateError;

            // 3. Log the transaction
            await supabaseAdmin.from('wallet_transactions').insert({
                wallet_id: (wallet as any).user_id || (wallet as any).id,
                user_id: user.sub,
                type: 'credit',
                amount,
                description: `Wallet top-up via ${paymentMethod}`,
                balance_after: newBalance,
            });

            return reply.send({
                success: true,
                message: 'Wallet topped up successfully.',
                data: { balance: newBalance },
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to top up wallet.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/earnings/wallet/withdraw — Request Payout
    // ──────────────────────────────────────────────
    const withdrawSchema = {
        body: {
            type: 'object',
            required: ['amount'],
            properties: {
                amount: { type: 'number', minimum: 100, maximum: 50000 },
                transferMethod: { type: 'string', enum: ['bank_transfer', 'upi'], default: 'bank_transfer' },
                details: { type: 'object', additionalProperties: true }
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/wallet/withdraw', { schema: withdrawSchema }, async (request, reply) => {
        const user = request.user;
        const { amount, transferMethod = 'bank_transfer', details = {} } = request.body;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Only providers can request withdrawals.' });
        }

        try {
            // 1. Double-check balance from our optimized view
            const { data: summary, error: summaryError } = await supabaseAdmin
                .from('provider_earnings_summary')
                .select('total_earnings')
                .eq('provider_id', user.sub)
                .single();

            if (summaryError) throw summaryError;
            
            const currentBalance = Number(summary?.total_earnings || 0);

            if (currentBalance < amount) {
                return reply.code(400).send({ 
                    error: 'Insufficient balance.', 
                    details: `Requested: ₹${amount}, Available: ₹${currentBalance}` 
                });
            }

            // 2. Insert withdrawal request
            // The database trigger (trg_payout_escrow_sync) will atomically:
            // - Verify the balance AGAIN at DB level
            // - Lock the funds in PAYOUT_RESERVE_LIABILITY
            // - Decrease PROVIDER_PAYABLE_LIABILITY
            const { data: payout, error: payoutError } = await supabaseAdmin
                .from('payout_requests')
                .insert({
                    provider_id: user.sub,
                    amount,
                    transfer_method: transferMethod,
                    transfer_details: details,
                    status: 'pending'
                })
                .select()
                .single();

            if (payoutError) {
                // Check for custom trigger exception
                if (payoutError.message.includes('Insufficient digital earnings')) {
                    return reply.code(400).send({ error: 'Insufficient balance at ledger level.' });
                }
                throw payoutError;
            }

            return reply.send({
                success: true,
                message: 'Payout request submitted and funds secured in escrow.',
                data: {
                    payoutId: payout.id,
                    amount: payout.amount,
                    status: payout.status
                }
            });
        } catch (err: any) {
            fastify.log.error(err, 'Withdrawal request failed');
            return reply.code(500).send({ error: 'Failed to process withdrawal request.', details: err.message });
        }
    });
}
