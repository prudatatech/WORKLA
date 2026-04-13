import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { requireAuth } from '../middlewares/auth';
import { PaymentService } from '../services/paymentService';
import { CommonSchemas } from '../lib/schemas';

export default async function paymentRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();

    /**
     * @route POST /api/v1/payments/orders
     * @desc Create a Razorpay order for a booking
     */
    const createOrderSchema = {
        body: {
            type: 'object',
            required: ['bookingId'],
            properties: {
                bookingId: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        },
        response: {
            201: CommonSchemas.SuccessResponse({
                type: 'object',
                properties: {
                    orderId: { type: 'string' },
                    amount: { type: 'number' },
                    currency: { type: 'string' },
                    keyId: { type: 'string' }
                }
            }),
            403: CommonSchemas.ErrorResponse,
            404: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.post('/orders', { 
        schema: createOrderSchema,
        preHandler: [requireAuth] 
    }, async (request, reply) => {
        const { bookingId } = request.body;
        const userId = request.user.sub;

        try {
            const data = await PaymentService.createOrder(bookingId, userId, request.log);
            return reply.code(201).send({
                success: true,
                message: 'Razorpay order created.',
                data
            });
        } catch (err: any) {
            const statusCode = err.statusCode || 500;
            return reply.code(statusCode).send({ 
                success: false,
                error: 'ORDER_CREATION_FAILED', 
                details: err.message 
            });
        }
    });

    /**
     * @route POST /api/v1/payments/verify
     * @desc Verify Razorpay payment signature
     */
    const verifyPaymentSchema = {
        body: {
            type: 'object',
            required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'],
            properties: {
                razorpay_order_id: { type: 'string' },
                razorpay_payment_id: { type: 'string' },
                razorpay_signature: { type: 'string' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            400: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.post('/verify', { 
        schema: verifyPaymentSchema,
        preHandler: [requireAuth] 
    }, async (request, reply) => {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;

        const isValid = PaymentService.verifySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            return reply.code(400).send({ 
                success: false,
                error: 'INVALID_SIGNATURE', 
                details: 'Payment verification failed.' 
            });
        }

        const success = await PaymentService.completePayment(
            razorpay_order_id,
            razorpay_payment_id,
            request.log
        );

        if (!success) {
            return reply.code(500).send({ 
                success: false,
                error: 'PAYMENT_UPDATE_FAILED', 
                details: 'Failed to update payment status in database.' 
            });
        }

        return reply.send({
            success: true,
            message: 'Payment verified and completed.',
            data: {}
        });
    });

    /**
     * @route POST /api/v1/payments/webhook
     * @desc Razorpay Webhook Handler
     */
    fastify.post('/webhook', async (request, reply) => {
        const signature = request.headers['x-razorpay-signature'] as string;
        
        if (!signature) {
            return reply.code(400).send({ error: 'Missing signature' });
        }

        // Use the rawBody captured by the content type parser for reliable signature verification
        const rawBody = (request as any).rawBody || JSON.stringify(request.body);
        const success = await PaymentService.handleWebhook(rawBody, signature, request.log);

        if (!success) {
            return reply.code(400).send({ error: 'Webhook processing failed' });
        }

        return reply.code(200).send({ status: 'ok' });
    });
}
