import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { EventBus } from '../events/bus';
import { cache } from '../lib/cache';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { JobService } from '../services/jobService';
import { CommonSchemas } from '../lib/schemas';
import { InvoiceService } from '../services/invoiceService';

export default async function bookingRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes in this plugin require authentication
    fastify.addHook('preValidation', requireAuth);

    /**
     * @route POST /api/v1/bookings
     * @desc Create a new booking
     */
    const createBookingSchema = {
        body: {
            type: 'object',
            required: [
                'serviceId', 'subcategoryId', 'scheduledDate', 'scheduledTimeSlot',
                'customerLatitude', 'customerLongitude', 'customerAddress',
                'totalAmount', 'catalogPrice', 'platformFee', 'taxAmount', 'serviceNameSnapshot'
            ],
            properties: {
                serviceId: { type: 'string', format: 'uuid' },
                subcategoryId: { type: 'string', format: 'uuid' },
                scheduledDate: { type: 'string', format: 'date' },
                scheduledTimeSlot: { type: 'string' },
                customerLatitude: { type: 'number', minimum: -90, maximum: 90 },
                customerLongitude: { type: 'number', minimum: -180, maximum: 180 },
                customerAddress: { type: 'string', minLength: 5 },
                specialInstructions: { type: 'string', maxLength: 500 },
                paymentMethod: { type: 'string', enum: ['cash', 'card', 'online', 'wallet', 'cod'] },
                totalAmount: { type: 'number', minimum: 0 },
                catalogPrice: { type: 'number', minimum: 0 },
                platformFee: { type: 'number', minimum: 0 },
                taxAmount: { type: 'number', minimum: 0 },
                frequency: { type: 'string' },
                serviceNameSnapshot: { type: 'string' },
                couponId: { type: 'string', format: 'uuid', nullable: true },
                couponDiscount: { type: 'number', minimum: 0 }
            },
            additionalProperties: false
        },
        response: {
            201: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            400: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.post('/', { schema: createBookingSchema }, async (request, reply) => {
        const user = request.user;
        const body = request.body;

        try {
            // 🗺️ Geo-fencing check: Is this area served?
            const { data: isServed, error: zoneError } = await supabaseAdmin
                .rpc('is_location_in_service_zone', { 
                    p_lat: body.customerLatitude, 
                    p_lng: body.customerLongitude 
                });

            if (zoneError) throw zoneError;
            if (!isServed) {
                return reply.code(400).send({ 
                    error: 'AREA_NOT_SERVED', 
                    details: 'Sorry, we do not provide services in this area yet.' 
                } as any);
            }

            // Generate a human-readable booking number
            const bookingNumber = `WK-${Date.now().toString(36).toUpperCase()}`;

            const { data, error } = await supabaseAdmin
                .from('bookings')
                .insert({
                    booking_number: bookingNumber,
                    customer_id: user.sub,
                    service_id: body.serviceId,
                    subcategory_id: body.subcategoryId,
                    scheduled_date: body.scheduledDate,
                    scheduled_time_slot: body.scheduledTimeSlot,
                    customer_latitude: body.customerLatitude,
                    customer_longitude: body.customerLongitude,
                    customer_address: body.customerAddress,
                    special_instructions: body.specialInstructions || null,
                    payment_method: body.paymentMethod || 'cash',
                    status: 'requested', // Default to requested for dispatch
                    total_amount: body.totalAmount,
                    catalog_price: body.catalogPrice,
                    platform_fee: body.platformFee,
                    tax_amount: body.taxAmount,
                    service_name_snapshot: body.serviceNameSnapshot,
                    coupon_id: body.couponId || null,
                    discount_amount: body.couponDiscount || 0,
                    payment_status: 'pending'
                })
                .select()
                .single();

            if (error) throw error;

            // 🎟️ Track coupon usage if applicable
            if (body.couponId) {
                await supabaseAdmin.from('coupon_usages').insert({
                    coupon_id: body.couponId,
                    customer_id: user.sub,
                    booking_id: data.id,
                    discount_amount: body.couponDiscount || 0
                });
            }

            // 🔥 Inline dispatch: Call dispatch_job RPC directly (works without Redis)
            // This ensures providers get notified even when Redis/EventBus is down
            try {
                const { data: dispatchCount, error: dispatchError } = await supabaseAdmin
                    .rpc('dispatch_job', { p_booking_id: data.id });

                if (dispatchError) {
                    fastify.log.error({ error: dispatchError.message, bookingId: data.id }, '[Booking] Inline dispatch_job RPC failed');
                } else {
                    fastify.log.info({ bookingId: data.id, offers: dispatchCount }, '[Booking] Inline dispatch created offers');

                    // Notify providers via socket (inline, no Redis dependency)
                    const { data: offers } = await supabaseAdmin
                        .from('job_offers')
                        .select('id, provider_id')
                        .eq('booking_id', data.id)
                        .eq('status', 'pending');

                    if (offers && offers.length > 0) {
                        const { emitToUser } = await import('../socket');
                        for (const offer of offers) {
                            // 1. Persist notification in DB
                            await supabaseAdmin.from('notifications').insert({
                                user_id: offer.provider_id,
                                title: 'New Service Request! 🚀',
                                body: `${body.serviceNameSnapshot || 'New Job'} available now.`,
                                type: 'new_job',
                                data: {
                                    bookingId: data.id,
                                    offerId: offer.id,
                                    amount: body.totalAmount,
                                    serviceName: body.serviceNameSnapshot,
                                    address: body.customerAddress
                                },
                                is_read: false
                            });

                            // 2. Emit socket event for instant popup
                            emitToUser(offer.provider_id, 'notification:alert', {
                                title: 'New Service Request! 🚀',
                                body: `${body.serviceNameSnapshot || 'New Job'} available now.`,
                                type: 'new_job',
                                data: {
                                    bookingId: data.id,
                                    offerId: offer.id,
                                    amount: body.totalAmount,
                                    serviceName: body.serviceNameSnapshot,
                                    address: body.customerAddress
                                }
                            });
                        }
                        fastify.log.info({ bookingId: data.id, providers: offers.length }, '[Booking] Notified providers via inline dispatch');
                    }
                }
            } catch (dispatchErr: any) {
                fastify.log.error({ error: dispatchErr.message }, '[Booking] Inline dispatch failed');
            }

            // Also try EventBus (non-blocking, for nudge scheduling etc.)
            EventBus.publish('booking.created', { bookingId: data.id }, { 'x-request-id': request.id }).catch(() => {});

            return reply.code(201).send({
                success: true,
                message: 'Booking created and dispatched.',
                data,
            });
        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Failed to create booking.', details: err.message });
        }
    });

    /**
     * @route GET /api/v1/bookings/:id
     * @desc Get booking by ID
     */
    const getBookingSchema = {
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
            404: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/:id', { schema: getBookingSchema }, async (request, reply) => {
        const { id } = request.params;
        const refresh = !!(request.query && (request.query as any).refresh === 'true');
        const noCache = request.headers['cache-control'] === 'no-cache';
        const forceRefresh = refresh || noCache;

        const cacheKey = `booking:detail:${id}`;

        try {
            const data = await cache.getOrSet(cacheKey, async () => {
                const { data, error } = await supabaseAdmin
                    .from('bookings')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                if (!data) return null;

                const enrichedData = { ...data };

                // Manual fetch for subcategory and provider details to avoid PGRST200 join errors
                const [subsRes, provsRes] = await Promise.all([
                    data.subcategory_id ? supabaseAdmin.from('service_subcategories').select('id, name').eq('id', data.subcategory_id).single() : { data: null },
                    data.provider_id ? supabaseAdmin.from('profiles').select('id, full_name, phone, avatar_url').eq('id', data.provider_id).single() : { data: null }
                ]);

                enrichedData.service_subcategories = subsRes.data || null;
                enrichedData.profiles = provsRes.data || null;

                return enrichedData;
            // Active bookings: 15s TTL (status changes frequently)
            // Terminal bookings (completed/cancelled): 300s TTL (immutable)
            }, ['completed', 'cancelled', 'disputed'].includes('') ? 300 : 15, forceRefresh);

            if (!data) return reply.code(404).send({ error: 'Booking not found.' });

            // Use dynamic TTL based on actual booking status
            const ttl = ['completed', 'cancelled', 'disputed'].includes((data as any)?.status) ? 300 : 15;
            if (!forceRefresh) {
                // Re-cache with correct TTL based on live status
                await cache.set(cacheKey, data, ttl);
            }

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch booking.', details: err.message });
        }
    });

    /**
     * @route GET /api/v1/bookings
     * @desc List bookings for the authenticated user
     */
    const listBookingsSchema = {
        querystring: {
            type: 'object',
            properties: {
                role: { type: 'string', enum: ['customer', 'provider'] },
                status: { type: 'string' },
                ...CommonSchemas.Pagination.properties
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.PaginatedResponse({ type: 'object', additionalProperties: true }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/', { schema: listBookingsSchema }, async (request, reply) => {
        const user = request.user;
        const { role = 'customer', status, limit = 20, offset = 0 } = request.query as any;
        const refresh = !!((request.query as any).refresh === 'true');
        const noCache = request.headers['cache-control'] === 'no-cache';
        const forceRefresh = refresh || noCache;

        const cacheKey = `bookings:${user.sub}:${role}:${status || 'all'}:${offset}:${limit}`;

        try {
            const responseData = await cache.getOrSet(cacheKey, async () => {
                let query = supabaseAdmin
                    .from('bookings')
                    .select('*', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);

                if (role === 'provider') {
                    query = query.eq('provider_id', user.sub);
                } else {
                    query = query.eq('customer_id', user.sub);
                }

                if (status) {
                    if (status.includes(',')) {
                        query = query.in('status', status.split(','));
                    } else {
                        query = query.eq('status', status);
                    }
                }

                const { data, error, count } = await query;
                if (error) throw error;

                let enrichedData = data || [];
                if (enrichedData.length > 0) {
                    const subcategoryIds = [...new Set(enrichedData.map(b => b.subcategory_id).filter(Boolean))];
                    const targetProfileIds = role === 'provider' 
                        ? [...new Set(enrichedData.map(b => b.customer_id).filter(Boolean))]
                        : [...new Set(enrichedData.map(b => b.provider_id).filter(Boolean))];

                    const [subsRes, provsRes] = await Promise.all([
                        subcategoryIds.length > 0 ? supabaseAdmin.from('service_subcategories').select('id, name').in('id', subcategoryIds) : { data: [] },
                        targetProfileIds.length > 0 ? supabaseAdmin.from('profiles').select('id, full_name, phone, avatar_url').in('id', targetProfileIds) : { data: [] }
                    ]);

                    const subsMap = new Map((subsRes.data || []).map((s: any) => [s.id, s]));
                    const profileMap = new Map((provsRes.data || []).map((p: any) => [p.id, p]));

                    enrichedData = enrichedData.map(booking => ({
                        ...booking,
                        service_subcategories: subsMap.get(booking.subcategory_id) || null,
                        profiles: profileMap.get(role === 'provider' ? booking.customer_id : booking.provider_id) || null
                    }));
                }

                return { success: true as const, count: count || 0, data: enrichedData };
            }, 30, forceRefresh);

            return reply.send(responseData);
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to list bookings.', details: err.message });
        }
    });

    /**
     * @route PATCH /api/v1/bookings/:id/status
     * @desc Update booking status
     */
    const updateStatusSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        },
        body: {
            type: 'object',
            required: ['status'],
            properties: {
                status: { 
                    type: 'string', 
                    enum: [
                        'requested', 'searching', 'confirmed', 'en_route', 
                        'arrived', 'in_progress', 'completed', 'cancelled', 'disputed'
                    ]
                },
                cancellationReason: { type: 'string', maxLength: 255 },
                proofUrl: { type: 'string', format: 'uri' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            400: CommonSchemas.ErrorResponse,
            409: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse,
            504: CommonSchemas.GatewayTimeout
        }
    } as const;

    fastify.patch('/:id/status', { schema: updateStatusSchema }, async (request, reply) => {
        const { id } = request.params;
        const { status, cancellationReason, proofUrl } = request.body;
        const user = (request as any).user;

        request.log.info({ id, status, method: request.method, url: request.url }, '[BookingRoute] PATCH status attempt');

        try {
            if (status === 'confirmed') {
                // Special case: Manual confirmation requires a provider_id check
                const { data: booking } = await supabaseAdmin.from('bookings').select('provider_id').eq('id', id).single();
                if (!booking?.provider_id) {
                    return reply.code(400).send({ 
                        success: false,
                        error: 'ILLEGAL_TRANSITION', 
                        details: 'Cannot confirm booking without a provider.' 
                    });
                }
                const data = await JobService.confirmBookingManual(id, booking.provider_id, request.id, request.log);
                return reply.send({ success: true, message: 'Booking confirmed.', data });
            }

            // Standard Status Transition (Enterprise Hardened)
            const data = await JobService.updateBookingStatus(
                id, 
                status, 
                user.sub, 
                request.log, 
                { cancellationReason, proofUrl }
            );

            return reply.send({ success: true, message: `Booking ${status}.`, data });
        } catch (err: any) {
            fastify.log.error(err);
            if (err.statusCode) {
                return reply.code(err.statusCode).send({ 
                    success: false,
                    error: err.code || 'UNEXPECTED_ERROR', 
                    details: err.message 
                });
            }
            return reply.code(500).send({ 
                success: false,
                error: 'INTERNAL_SERVER_ERROR', 
                details: err.message
            });
        }
    });

    /**
     * @route GET /api/v1/bookings/:id/cancellation-quote
     * @desc Get transparent cancellation penalty before confirming
     */
    fastify.get('/:id/cancellation-quote', async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            const data = await JobService.getCancellationQuote(id, request.log);
            return reply.send({ success: true, data });
        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(err.statusCode || 500).send({ 
                success: false, 
                error: err.code || 'UNEXPECTED_ERROR', 
                message: err.message 
            });
        }
    });

    /**
     * @route PATCH /api/v1/bookings/:id/reschedule
     * @desc Reschedule a booking (Customer only)
     */
    const rescheduleSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } }
        },
        body: {
            type: 'object',
            required: ['newDate', 'newSlot'],
            properties: {
                newDate: { type: 'string', format: 'date' },
                newSlot: { type: 'string' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({ type: 'object', additionalProperties: true }),
            400: CommonSchemas.ErrorResponse,
            403: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.patch('/:id/reschedule', { schema: rescheduleSchema }, async (request, reply) => {
        const { id } = request.params;
        const { newDate, newSlot, reason } = request.body as any;
        const user = request.user;

        try {
            // Enhanced date/slot validation
            const targetDate = new Date(newDate);
            const today = new Date();
            const currentHour = today.getHours();
            today.setHours(0, 0, 0, 0);

            if (targetDate < today) {
                return reply.code(400).send({ 
                    error: 'INVALID_DATE', 
                    details: 'Cannot reschedule to a past date.' 
                } as any);
            }

            // Same-day slot check: Prevents choosing past morning/afternoon slots today
            if (targetDate.getTime() === today.getTime()) {
                let slotDeadline = 0;
                if (newSlot.startsWith('8 AM')) slotDeadline = 8;
                if (newSlot.startsWith('12 PM')) slotDeadline = 12;
                if (newSlot.startsWith('4 PM')) slotDeadline = 16;
                
                if (currentHour >= slotDeadline) {
                    return reply.code(400).send({
                        error: 'PAST_SLOT',
                        details: 'This time slot has already passed for today. Please choose a later slot or tomorrow.'
                    } as any);
                }
            }

            const { data, error } = await supabaseAdmin.rpc('reschedule_booking_rpc', {
                p_booking_id: id,
                p_new_date: newDate,
                p_new_slot: newSlot,
                p_user_id: user.sub,
                p_reason: reason || null
            });

            if (error) throw error;

            const result = data as { success: boolean, code?: string, message?: string };
            if (!result.success) {
                return reply.code(result.code === 'UNAUTHORIZED' ? 403 : 400).send({
                    error: result.code || 'RESCHEDULE_FAILED',
                    details: result.message
                } as any);
            }

            // Invalidate Caches
            await cache.invalidatePattern(`bookings:${user.sub}:*`);
            
            // Fire event for notifications
            EventBus.publish('booking.rescheduled', { bookingId: id }, { 'x-request-id': request.id });

            return reply.send({ success: true, message: 'Booking rescheduled successfully.', data: result });
        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(500).send({ 
                error: 'INTERNAL_ERROR', 
                details: err.message 
            } as any);
        }
    });

    /**
     * @route POST /api/v1/bookings/dispatch
     * @desc Async dispatch trigger
     */
    const dispatchSchema = {
        body: {
            type: 'object',
            required: ['bookingId'],
            properties: {
                bookingId: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({
                type: 'object',
                properties: {
                    queuedAt: { type: 'string', format: 'date-time' }
                }
            }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.post('/dispatch', { schema: dispatchSchema }, async (request, reply) => {
        const { bookingId } = request.body;

        try {
            await EventBus.publish('booking.created', { bookingId }, { 'x-request-id': request.id });

            return reply.send({
                success: true,
                message: 'Booking request received. Dispatching to providers in the background.',
                data: {
                    queuedAt: new Date().toISOString()
                }
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to queue dispatch event.', details: err.message });
        }
    });

    const invoiceSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        response: {
            200: CommonSchemas.SuccessResponse({ 
                type: 'object', 
                properties: { 
                    invoiceUrl: { type: 'string' },
                    invoiceNumber: { type: 'string' },
                    invoiceType: { type: 'string' }
                } 
            }),
            404: CommonSchemas.ErrorResponse,
            403: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/:id/invoice', { schema: invoiceSchema }, async (request, reply) => {
        const { id } = request.params as any;
        const user = (request as any).user;

        try {
            // 1. Fetch invoice info
            const { data: invoice, error } = await supabaseAdmin
                .from('invoices')
                .select('invoice_number, storage_path, customer_id, invoice_type')
                .eq('booking_id', id)
                .single();

            // 2. Invoice record missing → try to generate it
            if (error || !invoice) {
                const { data: booking } = await supabaseAdmin.from('bookings').select('status, customer_id').eq('id', id).single();
                if (booking?.status === 'completed' && booking.customer_id === user.sub) {
                    const result = await InvoiceService.generateInvoice(id);
                    const { data: signed } = await supabaseAdmin.storage
                        .from('invoices')
                        .createSignedUrl(result.path, 600); // 10 mins
                    return reply.send({ success: true, invoiceUrl: signed?.signedUrl, invoiceNumber: result.invoiceNumber, invoiceType: 'INVOICE' } as any);
                }
                return reply.code(404).send({ error: 'INVOICE_NOT_FOUND', details: 'Invoice not generated for this booking yet.' } as any);
            }

            // Authorization check
            if (invoice.customer_id !== user.sub) {
                return reply.code(403).send({ error: 'UNAUTHORIZED' } as any);
            }

            // 3. storage_path is null = PDF was never uploaded successfully → re-generate
            if (!invoice.storage_path) {
                const result = await InvoiceService.generateInvoice(id);
                const { data: signed } = await supabaseAdmin.storage
                    .from('invoices')
                    .createSignedUrl(result.path, 600);
                return reply.send({ success: true, invoiceUrl: signed?.signedUrl, invoiceNumber: result.invoiceNumber, invoiceType: invoice.invoice_type || 'INVOICE' } as any);
            }

            // 4. Create signed URL for existing file
            const { data: signed, error: signedError } = await supabaseAdmin.storage
                .from('invoices')
                .createSignedUrl(invoice.storage_path, 600);

            if (signedError || !signed?.signedUrl) throw new Error('FAILED_TO_SIGN_URL');

            return reply.send({ success: true, invoiceUrl: signed.signedUrl, invoiceNumber: invoice.invoice_number, invoiceType: invoice.invoice_type } as any);
        } catch (err: any) {
            console.error(`🚨 [Booking] Invoice route error:`, err);
            return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' } as any);
        }
    });

    /**
     * @route GET /api/v1/admin/reports/gst-monthly
     * @desc Get monthly GST report for accounting (Admin only)
     */
    fastify.get('/admin/reports/gst-monthly', async (request, reply) => {
        try {
            const { data: isAdmin } = await supabaseAdmin.rpc('is_admin');
            if (!isAdmin) {
                return reply.code(403).send({ success: false, error: 'FORBIDDEN' });
            }

            const { data, error } = await supabaseAdmin
                .from('admin_gst_report')
                .select('*');

            if (error) throw error;

            return { success: true, data };
        } catch (err: any) {
            console.error(`🚨 [Admin] GST Report error:`, err);
            return reply.code(500).send({ success: false, error: 'REPORT_GENERATION_FAILED' });
        }
    });
}
