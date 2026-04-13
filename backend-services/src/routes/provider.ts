import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { EventBus } from '../events/bus';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { CommonSchemas } from '../lib/schemas';
import { ACTIVE_BOOKING_STATUSES } from '../lib/constants';
import { VerificationService } from '../services/verificationService';

export default async function providerRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/providers/me — Get own provider profile
    // ──────────────────────────────────────────────
    const meSchema = {
        response: {
            200: CommonSchemas.SuccessResponse({
                type: 'object',
                properties: {
                    ...CommonSchemas.ProfileMask.properties,
                    hasActiveJob: { type: 'boolean' },
                    activeJobId: { type: 'string', format: 'uuid', nullable: true }
                }
            }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/me', { schema: meSchema }, async (request, reply) => {
        const user = request.user;

        try {
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('id', user.sub)
                .single();

            if (error) throw error;

            // Fetch any current active booking
            const { data: activeBooking } = await supabaseAdmin
                .from('bookings')
                .select('id')
                .eq('provider_id', user.sub)
                .in('status', ACTIVE_BOOKING_STATUSES)
                .limit(1)
                .single();

            return reply.send({ 
                success: true, 
                data: {
                    ...data,
                    hasActiveJob: !!activeBooking,
                    activeJobId: activeBooking?.id || null
                }
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch profile.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/providers/analytics — Get dashboard stats
    // ──────────────────────────────────────────────
    const analyticsSchema = {
        response: {
            200: CommonSchemas.SuccessResponse({
                type: 'object',
                properties: {
                    todayJobs: { type: 'integer' },
                    todayEarnings: { type: 'number' },
                    weeklyData: { type: 'array', items: { type: 'number' } },
                    rating: { type: 'number' },
                    responseTime: { type: 'integer' },
                    completionRate: { type: 'integer' },
                    peakHours: { type: 'string' },
                    reviewCount: { type: 'integer' }
                }
            }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/analytics', { schema: analyticsSchema }, async (request, reply) => {
        const user = request.user;

        try {
            // 1. Get Today's stats
            const todayStr = new Date().toISOString().split('T')[0];
            const nextDayObj = new Date();
            nextDayObj.setDate(nextDayObj.getDate() + 1);
            const nextDayStr = nextDayObj.toISOString().split('T')[0];

            const { data: todayBookings, error: todayErr } = await supabaseAdmin
                .from('bookings')
                .select('id, total_amount')
                .eq('provider_id', user.sub)
                .eq('status', 'completed')
                .gte('updated_at', todayStr)
                .lt('updated_at', nextDayStr);

            if (todayErr) throw todayErr;

            const todayJobs = todayBookings.length;
            const todayEarnings = todayBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);

            // 2. Get Weekly Earnings (Last 7 days)
            const weekStr = new Date();
            weekStr.setDate(weekStr.getDate() - 6);
            weekStr.setHours(0,0,0,0);

            const { data: weekBookings, error: weekErr } = await supabaseAdmin
                .from('bookings')
                .select('total_amount, updated_at')
                .eq('provider_id', user.sub)
                .eq('status', 'completed')
                .gte('updated_at', weekStr.toISOString());
            
            if (weekErr) throw weekErr;

            const weeklyData = [0, 0, 0, 0, 0, 0, 0];
            const now = new Date();
            now.setHours(0,0,0,0);
            
            for (const b of weekBookings) {
                const bDate = new Date(b.updated_at);
                bDate.setHours(0,0,0,0);
                const diffTime = now.getTime() - bDate.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                const index = 6 - diffDays;
                if (index >= 0 && index <= 6) {
                    weeklyData[index] += Number(b.total_amount) || 0;
                }
            }

            // 3. Get rating
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('average_rating')
                .eq('id', user.sub)
                .single();

            const rating = profile?.average_rating || 0;

            // 4. Calculate Response Time (Avg time to accept an offer in minutes)
            const { data: offers } = await supabaseAdmin
                .from('job_offers')
                .select('created_at, responded_at')
                .eq('provider_id', user.sub)
                .eq('status', 'accepted')
                .limit(50);
            
            let responseTime = 0;
            if (offers && offers.length > 0) {
                const totalMins = offers.reduce((sum, o) => {
                    const start = new Date(o.created_at).getTime();
                    const end = new Date(o.responded_at).getTime();
                    return sum + (end - start) / (1000 * 60);
                }, 0);
                responseTime = Math.round(totalMins / offers.length);
            }

            // 5. Completion Rate
            const { data: rateStats } = await supabaseAdmin
                .from('bookings')
                .select('status')
                .eq('provider_id', user.sub)
                .in('status', ['completed', 'cancelled']);
            
            let completionRate = 100;
            if (rateStats && rateStats.length > 0) {
                const completed = rateStats.filter(b => b.status === 'completed').length;
                completionRate = Math.round((completed / rateStats.length) * 100);
            }

            // 6. Peak Hours (Most frequent completion hours)
            const hourCounts: Record<number, number> = {};
            for (const b of weekBookings) {
                const hour = new Date(b.updated_at).getHours();
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            }
            let peakHours = "No data";
            if (Object.keys(hourCounts).length > 0) {
                const topHour = Number(Object.keys(hourCounts).reduce((a, b) => hourCounts[Number(a)] > hourCounts[Number(b)] ? a : b));
                const endHour = (topHour + 2) % 24;
                const format = (h: number) => h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`;
                peakHours = `${format(topHour)} - ${format(endHour)}`;
            }

            // 7. Total Reviews Count
            const { count: reviewCount, error: _reviewErr } = await supabaseAdmin
                .from('booking_reviews')
                .select('*', { count: 'exact', head: true })
                .eq('provider_id', user.sub);

            return reply.send({ 
                success: true, 
                data: { 
                    todayJobs, 
                    todayEarnings, 
                    weeklyData, 
                    rating,
                    responseTime,
                    completionRate,
                    peakHours,
                    reviewCount: reviewCount || 0
                } 
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch analytics.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/providers/analytics/earnings — Deep-dive earnings breakdown
    // ──────────────────────────────────────────────
    const earningsAnalyticsSchema = {
        querystring: {
            type: 'object',
            properties: {
                period: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'weekly' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({
                type: 'object',
                properties: {
                    period: { type: 'string' },
                    totalEarnings: { type: 'number' },
                    jobCount: { type: 'integer' },
                    history: { type: 'array', items: { type: 'object', additionalProperties: true } }
                }
            }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/analytics/earnings', { schema: earningsAnalyticsSchema }, async (request, reply) => {
        const user = request.user;
        const { period = 'weekly' } = request.query;

        try {
            const startDate = new Date();
            if (period === 'daily') {
                startDate.setHours(0, 0, 0, 0);
            } else if (period === 'weekly') {
                startDate.setDate(startDate.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
            } else if (period === 'monthly') {
                startDate.setMonth(startDate.getMonth() - 1);
                startDate.setHours(0, 0, 0, 0);
            }

            const { data: bookings, error } = await supabaseAdmin
                .from('bookings')
                .select('id, total_amount, updated_at, service_name_snapshot, status')
                .eq('provider_id', user.sub)
                .eq('status', 'completed')
                .gte('updated_at', startDate.toISOString())
                .order('updated_at', { ascending: false });

            if (error) throw error;

            const totalEarnings = bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
            const jobCount = bookings.length;

            return reply.send({
                success: true,
                data: {
                    period,
                    totalEarnings,
                    jobCount,
                    history: bookings
                }
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch earnings analysis.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/providers/me — Update own profile
    // ──────────────────────────────────────────────
    const updateMeSchema = {
        body: {
            type: 'object',
            properties: {
                full_name: { type: 'string', minLength: 2 },
                phone: { type: 'string', pattern: '^[0-9+ ]+$' },
                avatar_url: { type: 'string', format: 'uri' },
                business_name: { type: 'string' },
                bio: { type: 'string', maxLength: 500 },
                service_radius_km: { type: 'number', minimum: 1, maximum: 100 },
                service_area: { type: 'object', nullable: true } // GeoJSON polygon
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

    fastify.patch('/me', { schema: updateMeSchema }, async (request, reply) => {
        const user = request.user;
        const updates = request.body;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied: Only providers can update these details.' });
        }

        if (Object.keys(updates).length === 0) {
            return reply.code(400).send({ error: 'No fields provided for update.' });
        }

        try {
            const now = new Date().toISOString();
            
            // 1. Prepare updates for 'profiles' table
            const profileFields = ['full_name', 'phone', 'avatar_url'];
            const profileUpdates: any = { updated_at: now };
            profileFields.forEach(f => { if ((updates as any)[f] !== undefined) profileUpdates[f] = (updates as any)[f]; });

            // 2. Prepare updates for 'provider_details' table
            const detailFields = ['business_name', 'bio', 'service_radius_km', 'service_area'];
            const detailUpdates: any = { updated_at: now };
            detailFields.forEach(f => { if ((updates as any)[f] !== undefined) detailUpdates[f] = (updates as any)[f]; });

            // 3. Execute updates in parallel
            const promises: Promise<any>[] = [];
            if (Object.keys(profileUpdates).length > 1) {
                promises.push(Promise.resolve(supabaseAdmin.from('profiles').update(profileUpdates).eq('id', user.sub).select().single()));
            } else {
                promises.push(Promise.resolve({ data: null, error: null }));
            }

            if (Object.keys(detailUpdates).length > 1) {
                promises.push(Promise.resolve(supabaseAdmin.from('provider_details')
                    .upsert({ ...detailUpdates, provider_id: user.sub }, { onConflict: 'provider_id' })
                    .select()
                    .single()
                ));
            } else {
                promises.push(Promise.resolve({ data: null, error: null }));
            }

            const [profileResult, detailResult] = await Promise.all(promises);

            if (profileResult.error) throw profileResult.error;
            if (detailResult.error) throw detailResult.error;

            const data = profileResult.data || {}; 
            const detailsData = detailResult.data || {};

            // Sync profile changes to Elasticsearch
            EventBus.publish('provider.profile_updated', {
                providerId: user.sub,
                profileInfo: {
                    business_name: detailsData.business_name || data.business_name || data.full_name,
                    rating: detailsData.avg_rating || data.average_rating,
                    is_verified: detailsData.verification_status === 'verified' || data.is_verified,
                }
            }, { 'x-request-id': request.id });

            return reply.send({ success: true, data: { ...data, ...detailsData } });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update profile.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/providers/online — Toggle Online Status
    // ──────────────────────────────────────────────
    const updateOnlineSchema = {
        body: {
            type: 'object',
            required: ['is_online'],
            properties: {
                is_online: { type: 'boolean' }
            },
            additionalProperties: false
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', const: true },
                    is_online: { type: 'boolean' }
                }
            },
            403: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.patch('/online', { schema: updateOnlineSchema }, async (request, reply) => {
        const user = request.user;
        const { is_online } = request.body;

        try {
            // Check verification status first
            const { data: profile, error: pError } = await supabaseAdmin
                .from('provider_details')
                .select('verification_status')
                .eq('provider_id', user.sub)
                .single();

            if (pError || !profile) throw new Error('PROVIDER_NOT_FOUND');

            if (is_online && profile.verification_status !== 'verified') {
                return reply.code(403).send({ 
                    success: false, 
                    error: 'NOT_VERIFIED', 
                    details: 'Your documents must be verified by an admin before you can go online.' 
                });
            }

            // Upsert to handle missing provider_details row gracefully
            const { data, error } = await supabaseAdmin
                .from('provider_details')
                .upsert({ provider_id: user.sub, is_online, updated_at: new Date().toISOString() }, { onConflict: 'provider_id' })
                .select('is_online')
                .single();

            if (error) throw error;

            // Broadcast status change via Kafka so matching engine knows immediately
            EventBus.publish('provider.status_changed', {
                providerId: user.sub,
                isOnline: data.is_online,
                timestamp: new Date().toISOString()
            }, { 'x-request-id': request.id });

            return reply.send({ success: true, is_online: data.is_online });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update online status.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/providers/location — Update GPS coordinates
    // ──────────────────────────────────────────────
    const updateLocationSchema = {
        body: {
            type: 'object',
            required: ['latitude', 'longitude'],
            properties: {
                latitude: { type: 'number', minimum: -90, maximum: 90 },
                longitude: { type: 'number', minimum: -180, maximum: 180 }
            },
            additionalProperties: false
        },
        response: {
            200: { type: 'object', properties: { success: { type: 'boolean', const: true } } },
            400: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    // 🚦 Server-side throttle: max 1 location update per 30 seconds per provider
    const locationThrottle = new Map<string, number>();
    const LOCATION_THROTTLE_MS = 30_000;

    fastify.post('/location', { schema: updateLocationSchema }, async (request, reply) => {
        const user = request.user;
        const { latitude, longitude } = request.body;

        if (!latitude || !longitude) {
            return reply.code(400).send({ error: 'latitude and longitude are required.' });
        }

        // Throttle check: silently skip if updated within last 30s
        const lastUpdate = locationThrottle.get(user.sub);
        const now = Date.now();
        if (lastUpdate && (now - lastUpdate) < LOCATION_THROTTLE_MS) {
            return reply.send({ success: true }); // Return OK but skip DB write
        }
        locationThrottle.set(user.sub, now);

        try {
            const nowISO = new Date().toISOString();

            // Step 1: Try to UPDATE existing row
            const { data: updated, error: updateError } = await supabaseAdmin
                .from('provider_locations')
                .update({ latitude, longitude, recorded_at: nowISO })
                .eq('provider_id', user.sub)
                .select('provider_id')
                .maybeSingle();

            if (updateError) throw updateError;

            // Step 2: If no existing row, INSERT a new one
            if (!updated) {
                const { error: insertError } = await supabaseAdmin
                    .from('provider_locations')
                    .insert({ provider_id: user.sub, latitude, longitude, recorded_at: nowISO });

                if (insertError) throw insertError;
            }

            // Skip EventBus for location — ES is not available on Railway
            // EventBus.publish('provider.location_updated', ...) removed to save Redis/ES resources

            return reply.send({ success: true });
        } catch (err: any) {
            console.error('[Location Update Error]:', err);
            return reply.code(500).send({ error: 'Failed to update location.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/providers/:id — Get public provider profile
    // ──────────────────────────────────────────────
    const getPublicProviderSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse(CommonSchemas.ProfileMask),
            404: CommonSchemas.ErrorResponse,
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/:id', { schema: getPublicProviderSchema }, async (request, reply) => {
        const { id } = request.params;

        try {
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .select('id, full_name, avatar_url, phone, average_rating, total_jobs_completed, is_verified, bio')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) return reply.code(404).send({ error: 'Provider not found.' });

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch provider.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/providers/:id/reviews — Get provider reviews
    // ──────────────────────────────────────────────
    const getProviderReviewsSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            },
            additionalProperties: false
        },
        querystring: CommonSchemas.Pagination,
        response: {
            200: CommonSchemas.PaginatedResponse({ type: 'object', additionalProperties: true }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/:id/reviews', { schema: getProviderReviewsSchema }, async (request, reply) => {
        const { id } = request.params;
        const { limit = 10, offset = 0 } = request.query;

        try {
            const { data, error, count } = await supabaseAdmin
                .from('booking_reviews')
                .select('*, profiles!booking_reviews_reviewer_id_fkey(full_name, avatar_url)', { count: 'exact' })
                .eq('provider_id', id)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;

            return reply.send({ success: true, count: count || 0, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch reviews.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/providers/verification-status — Get verification status
    // ──────────────────────────────────────────────
    fastify.get('/verification-status', async (request, reply) => {
        const user = request.user;
        try {
            const status = await VerificationService.getProviderVerificationStatus(user.sub);
            return reply.send({ success: true, data: status });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch verification status.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/providers/documents — Submit a document
    // ──────────────────────────────────────────────
    const submitDocSchema = {
        body: {
            type: 'object',
            required: ['document_type', 'document_number', 'document_url'],
            properties: {
                document_type: { type: 'string', enum: ['aadhaar', 'pan'] },
                document_number: { type: 'string', minLength: 5 },
                document_url: { type: 'string' } // Could be path or URL
            }
        }
    } as const;

    fastify.post('/documents', { schema: submitDocSchema }, async (request, reply) => {
        const user = request.user;
        const { document_type, document_number, document_url } = request.body;

        try {
            const data = await VerificationService.submitDocument(
                user.sub, 
                document_type as any, 
                document_number, 
                document_url
            );
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to submit document.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/providers/admin/review-document — Admin Document Review
    // ──────────────────────────────────────────────
    const reviewDocSchema = {
        body: {
            type: 'object',
            required: ['documentId', 'status'],
            properties: {
                documentId: { type: 'string', format: 'uuid' },
                status: { type: 'string', enum: ['verified', 'rejected'] },
                rejectionReason: { type: 'string' }
            }
        }
    } as const;

    fastify.post('/admin/review-document', { schema: reviewDocSchema }, async (request, reply) => {
        const user = request.user;

        try {
            // Role check
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', user.sub)
                .single();

            if (profile?.role !== 'ADMIN') {
                return reply.code(403).send({ error: 'Access Denied: Admin only.' });
            }

            const result = await VerificationService.reviewDocument(request.body);
            
            // Log event for notification worker
            EventBus.publish('provider.document_reviewed', {
                adminId: user.sub,
                ...request.body
            }, { 'x-request-id': request.id });

            return reply.send({ success: true, data: result });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to review document.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/providers/admin/pending-verifications — Admin List
    // ──────────────────────────────────────────────
    fastify.get('/admin/pending-verifications', async (request, reply) => {
        const user = request.user;

        try {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', user.sub)
                .single();

            if (profile?.role !== 'ADMIN') {
                return reply.code(403).send({ error: 'Access Denied: Admin only.' });
            }

            const data = await VerificationService.getPendingVerifications();
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch pending verifications.', details: err.message });
        }
    });
}
