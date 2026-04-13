import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';

export default async function couponRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // POST /api/v1/coupons/validate — Validate a coupon code
    // ──────────────────────────────────────────────
    const validateCouponSchema = {
        body: {
            type: 'object',
            required: ['code', 'orderAmount'],
            properties: {
                code: { type: 'string', minLength: 3, maxLength: 20 },
                serviceId: { type: 'string', format: 'uuid' },
                orderAmount: { type: 'number', minimum: 0 }
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/validate', { schema: validateCouponSchema }, async (request, reply) => {
        const user = request.user;
        const { code, orderAmount } = request.body;

        try {
            const now = new Date().toISOString();

            // 1. Find the coupon
            const { data: coupon, error } = await supabaseAdmin
                .from('coupon_codes')
                .select('*')
                .eq('code', code.toUpperCase().trim())
                .eq('is_active', true)
                .lte('valid_from', now)
                .gte('valid_until', now)
                .single();

            if (error || !coupon) {
                return reply.code(404).send({ error: 'Invalid or expired coupon code.' });
            }

            // 2. Check usage limit
            if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
                return reply.code(410).send({ error: 'This coupon has reached its maximum usage limit.' });
            }

            // 3. Check per-user usage limit
            if (coupon.max_uses_per_user) {
                const { count } = await supabaseAdmin
                    .from('coupon_usage')
                    .select('*', { count: 'exact', head: true })
                    .eq('coupon_id', coupon.id)
                    .eq('user_id', user.sub);

                if ((count || 0) >= coupon.max_uses_per_user) {
                    return reply.code(410).send({ error: 'You have already used this coupon the maximum number of times.' });
                }
            }

            // 4. Check minimum order amount
            if (coupon.min_order_amount && orderAmount < coupon.min_order_amount) {
                return reply.code(400).send({
                    error: `Minimum order amount for this coupon is ₹${coupon.min_order_amount}.`
                });
            }

            // 5. Calculate discount
            let discount = 0;
            if (coupon.discount_type === 'percentage') {
                discount = (orderAmount * coupon.discount_value) / 100;
                if (coupon.max_discount_amount) {
                    discount = Math.min(discount, coupon.max_discount_amount);
                }
            } else {
                discount = coupon.discount_value;
            }

            discount = Math.min(discount, orderAmount); // Cannot exceed order amount

            return reply.send({
                success: true,
                data: {
                    couponId: coupon.id,
                    code: coupon.code,
                    discountType: coupon.discount_type,
                    discountValue: coupon.discount_value,
                    calculatedDiscount: Math.round(discount * 100) / 100,
                    finalAmount: Math.round((orderAmount - discount) * 100) / 100,
                }
            });
        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Failed to validate coupon.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/coupons/apply — Apply a coupon to a booking
    // ──────────────────────────────────────────────
    const applyCouponSchema = {
        body: {
            type: 'object',
            required: ['couponId', 'bookingId'],
            properties: {
                couponId: { type: 'string', format: 'uuid' },
                bookingId: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/apply', { schema: applyCouponSchema }, async (request, reply) => {
        const user = request.user;
        const { couponId, bookingId } = request.body;

        try {
            // Record usage
            const { error: usageError } = await supabaseAdmin
                .from('coupon_usage')
                .insert({
                    coupon_id: couponId,
                    user_id: user.sub,
                    booking_id: bookingId,
                });

            if (usageError) throw usageError;

            // Increment usage counter on the coupon itself
            await supabaseAdmin.rpc('increment_coupon_usage', { p_coupon_id: couponId });

            return reply.send({ success: true, message: 'Coupon applied successfully.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to apply coupon.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/coupons — List available coupons for the user
    // ──────────────────────────────────────────────
    fastify.get('/', async (request, reply) => {
        try {
            const now = new Date().toISOString();

            const { data, error } = await supabaseAdmin
                .from('coupon_codes')
                .select('id, code, description, discount_type, discount_value, max_discount_amount, min_order_amount, valid_until')
                .eq('is_active', true)
                .lte('valid_from', now)
                .gte('valid_until', now)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch coupons.', details: err.message });
        }
    });
}
