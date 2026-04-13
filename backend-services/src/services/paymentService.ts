const Razorpay = require('razorpay');
import { config } from '../lib/config';
import { supabaseAdmin } from '../lib/supabase';
import { FastifyBaseLogger } from 'fastify';
import crypto from 'crypto';

const rzp = new Razorpay({
    key_id: config.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    key_secret: config.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

export const PaymentService = {
    /**
     * Creates a Razorpay Order for a specific booking.
     */
    async createOrder(bookingId: string, userId: string, logger: FastifyBaseLogger) {
        logger.info({ bookingId, userId }, '[PaymentService] Creating Razorpay Order');

        // 1. Fetch booking to get amount
        const { data: booking, error: fetchErr } = await supabaseAdmin
            .from('bookings')
            .select('total_amount, payment_status, customer_id')
            .eq('id', bookingId)
            .single();

        if (fetchErr || !booking) {
            logger.error({ fetchErr, bookingId }, '[PaymentService] Booking fetch failed');
            throw { statusCode: 404, message: `Booking not found (ID: ${bookingId}).` };
        }

        if (booking.customer_id !== userId) {
            throw { statusCode: 403, message: 'You do not have permission to pay for this booking.' };
        }

        // 2. Create Razorpay Order
        // Razorpay expects amount in paise (e.g., 100 INR = 10000 paise)
        const amountInPaise = Math.round(booking.total_amount * 100);
        
        try {
            const order = await rzp.orders.create({
                amount: amountInPaise,
                currency: 'INR',
                receipt: `receipt_${bookingId.substring(0, 8)}`,
                notes: {
                    booking_id: bookingId,
                    customer_id: userId
                }
            });

            // 3. Store order in payments table
            const { error: insertErr } = await supabaseAdmin
                .from('payments')
                .insert({
                    booking_id: bookingId,
                    customer_id: userId,
                    amount: booking.total_amount,
                    currency: order.currency || 'INR',
                    status: 'pending',
                    razorpay_order_id: order.id,
                    method: 'online'
                });

            if (insertErr) {
                logger.error({ error: insertErr.message, orderId: order.id }, '[PaymentService] Failed to record order in DB');
                // We don't throw here as the order is created in Razorpay, 
                // but we should ideally have logged it.
            }

            return {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: config.RAZORPAY_KEY_ID
            };
        } catch (rzpErr: any) {
            logger.error({ 
                error: rzpErr.message, 
                stack: rzpErr.stack,
                amount: amountInPaise,
                bookingId 
            }, '[PaymentService] Razorpay Order Creation Failed');
            throw { 
                statusCode: 500, 
                message: rzpErr.message || 'Failed to initiate payment with Razorpay.' 
            };
        }
    },

    /**
     * Verifies the Razorpay payment signature.
     */
    verifySignature(orderId: string, paymentId: string, signature: string) {
        const secret = config.RAZORPAY_KEY_SECRET || '';
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(orderId + "|" + paymentId);
        const generatedSignature = hmac.digest('hex');
        return generatedSignature === signature;
    },

    /**
     * Completes the payment process after verification.
     */
    async completePayment(orderId: string, paymentId: string, logger: FastifyBaseLogger) {
        logger.info({ orderId, paymentId }, '[PaymentService] Completing payment in DB');

        // 1. Fetch current payment status to handle idempotency
        const { data: currentPayment, error: fetchErr } = await supabaseAdmin
            .from('payments')
            .select('id, status, booking_id')
            .eq('razorpay_order_id', orderId)
            .single();

        if (fetchErr || !currentPayment) {
            logger.error({ error: fetchErr?.message, orderId }, '[PaymentService] Payment record not found during completion');
            return false;
        }

        if (currentPayment.status === 'captured') {
            logger.info({ orderId }, '[PaymentService] Payment already captured, skipping.');
            return true;
        }

        // 2. Update payment record
        const { error: pUpdateErr } = await supabaseAdmin
            .from('payments')
            .update({
                status: 'captured',
                razorpay_payment_id: paymentId,
                updated_at: new Date().toISOString()
            })
            .eq('razorpay_order_id', orderId);

        if (pUpdateErr) {
            logger.error({ error: pUpdateErr.message, orderId }, '[PaymentService] Payment record update failed');
            return false;
        }

        // 3. Update booking payment status
        const { error: bUpdateErr } = await supabaseAdmin
            .from('bookings')
            .update({ payment_status: 'paid' })
            .eq('id', currentPayment.booking_id);

        if (bUpdateErr) {
            logger.error({ error: bUpdateErr.message, bookingId: currentPayment.booking_id }, '[PaymentService] Booking status update failed');
            // Note: We might want a retry logic here if this fails but payment was captured
        }

        return true;
    },

    /**
     * Handles Razorpay Webhooks (Enterprise hardening)
     */
    /**
     * Handles Razorpay Webhooks (Elite Hardening)
     */
    async handleWebhook(rawBody: string, signature: string, logger: FastifyBaseLogger) {
        const webhookSecret = config.RAZORPAY_WEBHOOK_SECRET || '';
        
        // 1. Verify Webhook Signature using raw body
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (expectedSignature !== signature) {
            logger.warn({ signature, expectedSignature }, '[PaymentService] Invalid Webhook Signature');
            return false;
        }

        const body = JSON.parse(rawBody);
        const event = body.event;
        const payload = body.payload.payment.entity;

        logger.info({ event, paymentId: payload.id }, '[PaymentService] Processing Webhook Event');

        if (event === 'payment.captured') {
            const orderId = payload.order_id;
            const paymentId = payload.id;
            await this.completePayment(orderId, paymentId, logger);
        } else if (event === 'payment.failed') {
            const orderId = payload.order_id;
            await supabaseAdmin
                .from('payments')
                .update({ status: 'failed', updated_at: new Date().toISOString() })
                .eq('razorpay_order_id', orderId);
        }

        return true;
    },

    /**
     * Processes a refund for a specific booking.
     */
    async refundPayment(bookingId: string, logger: FastifyBaseLogger) {
        logger.info({ bookingId }, '[PaymentService] Initiating Refund');

        // 1. Find the successful payment
        const { data: payment, error: fetchErr } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('booking_id', bookingId)
            .eq('status', 'captured')
            .single();

        if (fetchErr || !payment || !payment.razorpay_payment_id) {
            logger.warn({ bookingId, fetchErr }, '[PaymentService] No captured payment found for refund');
            return false;
        }

        try {
            // 2. Call Razorpay Refund API
            const refund = await rzp.payments.refund(payment.razorpay_payment_id, {
                amount: Math.round(payment.amount * 100),
                notes: {
                    booking_id: bookingId,
                    reason: 'Booking cancelled'
                }
            });

            // 3. Update payment record to 'refunded'
            await supabaseAdmin
                .from('payments')
                .update({ 
                    status: 'refunded', 
                    updated_at: new Date().toISOString(),
                    metadata: { refund_id: refund.id }
                })
                .eq('id', payment.id);

            logger.info({ bookingId, refundId: refund.id }, '[PaymentService] Refund successful');
            return true;
        } catch (err: any) {
            logger.error({ error: err.message, bookingId }, '[PaymentService] Refund failed');
            return false;
        }
    }
};
