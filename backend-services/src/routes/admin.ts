import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { cache } from '../lib/cache';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { CommonSchemas } from '../lib/schemas';
import adminPayoutRoutes from './admin/payout';
import adminZoneRoutes from './admin/zones';

export default async function adminRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication + admin role check
    fastify.addHook('preValidation', requireAuth);
    fastify.addHook('preHandler', async (request, reply) => {
        const user = request.user;
        // Check if user has admin privileges and is NOT deactivated
        const { data } = await supabaseAdmin
            .from('profiles')
            .select('is_admin, deleted_at')
            .eq('id', user.sub)
            .single();

        if (!data || data.is_admin !== true || data.deleted_at) {
            request.log.warn({ userId: user.sub, email: user.email }, 'Unauthorized admin access attempt');
            return reply.code(403).send({ error: 'Forbidden. Admin access required.' });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/stats — Platform-wide dashboard statistics
    // ──────────────────────────────────────────────
    const statsSchema = {
        querystring: {
            type: 'object',
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({
                type: 'object',
                properties: {
                    totalUsers: { type: 'integer' },
                    totalBookings: { type: 'integer' },
                    activeBookings: { type: 'integer' },
                    totalRevenue: { type: 'number' },
                    currency: { type: 'string' }
                }
            }),
            500: CommonSchemas.ErrorResponse,
            504: CommonSchemas.GatewayTimeout
        }
    } as const;

    fastify.get('/stats', { schema: statsSchema }, async (request, reply) => {
        try {
            const [usersResult, bookingsResult, activeResult, revenueResult] = await Promise.all([
                supabaseAdmin
                    .from('profiles')
                    .select('*', { count: 'exact', head: true }),
                supabaseAdmin
                    .from('bookings')
                    .select('*', { count: 'exact', head: true }),
                supabaseAdmin
                    .from('bookings')
                    .select('*', { count: 'exact', head: true })
                    .in('status', ['requested', 'searching', 'confirmed', 'en_route', 'arrived', 'in_progress', 'disputed']),
                supabaseAdmin
                    .from('financial_ledger')
                    .select('amount')
                    .eq('transaction_type', 'platform_commission'),
            ]);

            const totalRevenue = (revenueResult.data || []).reduce(
                (sum: number, row: any) => sum + (parseFloat(row.amount) || 0), 0
            );

            return reply.send({
                success: true,
                data: {
                    totalUsers: usersResult.count || 0,
                    totalBookings: bookingsResult.count || 0,
                    activeBookings: activeResult.count || 0,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    currency: 'INR',
                }
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch stats.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/dashboard — Unified live dashboard feed
    // ──────────────────────────────────────────────
    const dashboardSchema = {
        querystring: {
            type: 'object',
            additionalProperties: false
        },
        response: {
            200: CommonSchemas.SuccessResponse({
                type: 'object',
                properties: {
                    metrics: {
                        type: 'object',
                        properties: {
                            customerCount: { type: 'integer' },
                            providerCount: { type: 'integer' },
                            jobsToday: { type: 'integer' },
                            mtdRevenue: { type: 'number' },
                            digitalRev: { type: 'number' }
                        }
                    },
                    pulseFeed: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    pendingApprovals: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    safetyAlerts: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    realHotZones: { type: 'array', items: { type: 'object', additionalProperties: true } }
                }
            }),
            500: CommonSchemas.ErrorResponse
        }
    } as const;

    fastify.get('/dashboard', { schema: dashboardSchema }, async (request, reply) => {
        request.log.info({ userId: (request.user as any)?.id }, '📊 Fetching Admin Dashboard...');
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const mtdStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            const [
                { count: customerCount },
                { count: providerCount },
                { count: jobsToday },
                { data: revenueData },
                { data: recentBookings },
                { data: pending },
                { data: alerts },
                { data: recentLocations }
            ] = await Promise.all([
                supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'CUSTOMER'),
                supabaseAdmin.from('provider_details').select('*', { count: 'exact', head: true }).eq('is_online', true),
                supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay.toISOString()),
                supabaseAdmin.from('worker_earnings').select('platform_fee, payment_method').gte('created_at', mtdStart),
                supabaseAdmin.from('bookings').select('*, service_subcategories(name), profiles!bookings_customer_id_fkey(full_name)').order('created_at', { ascending: false }).limit(5),
                supabaseAdmin.from('provider_details').select('*, profiles!provider_details_provider_id_fkey(full_name, email)').eq('verification_status', 'pending').limit(5),
                supabaseAdmin.from('safety_alerts').select('*, profiles(full_name), bookings(service_name_snapshot)').eq('status', 'open').order('created_at', { ascending: false }).limit(5),
                supabaseAdmin.from('bookings').select('customer_address').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(100),
            ]);

            const mtdRevenue = revenueData?.reduce((acc: number, curr: any) => acc + (Number(curr.platform_fee) || 0), 0) || 0;
            const cashComm = revenueData?.filter((r: any) => r.payment_method === 'cod').reduce((acc: number, curr: any) => acc + (Number(curr.platform_fee) || 0), 0) || 0;
            const digitalRev = mtdRevenue - cashComm;

            let realHotZones: any[] = [];
            if (recentLocations) {
                const counts: Record<string, number> = {};
                recentLocations.forEach((b: any) => {
                    const area = b.customer_address?.split(',')[0] || 'Unknown';
                    counts[area] = (counts[area] || 0) + 1;
                });
                realHotZones = Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([area, count]) => ({
                        area,
                        demand: `${Math.min(100, count * 15)}%`,
                        // Trend is difficult to calculate without historical windowing, 
                        // so we omit it rather than returning mock data (+5%)
                        color: count > 3 ? 'bg-amber-600' : 'bg-amber-500'
                    }));
            }

            return reply.send({
                success: true,
                data: {
                    metrics: {
                        customerCount: customerCount || 0,
                        providerCount: providerCount || 0,
                        jobsToday: jobsToday || 0,
                        mtdRevenue,
                        digitalRev
                    },
                    pulseFeed: recentBookings || [],
                    pendingApprovals: pending || [],
                    safetyAlerts: alerts || [],
                    realHotZones: realHotZones
                }
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch dashboard data.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/admin/safety-alerts/:id/resolve
    // ──────────────────────────────────────────────
    fastify.patch('/safety-alerts/:id/resolve', async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            const { data, error } = await supabaseAdmin
                .from('safety_alerts')
                .update({ status: 'resolved', resolved_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to resolve safety alert.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/users — Paginated user list with search
    // ──────────────────────────────────────────────
    const listUsersSchema = {
        querystring: {
            type: 'object',
            properties: {
                search: { type: 'string' },
                role: { type: 'string', enum: ['CUSTOMER', 'PROVIDER', 'ADMIN'] },
                limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                offset: { type: 'integer', minimum: 0, default: 0 }
            },
            additionalProperties: false
        }
    } as const;

    fastify.get('/users', { schema: listUsersSchema }, async (request, reply) => {
        const { search, role, limit = 20, offset = 0 } = request.query;

        try {
            let query = supabaseAdmin
                .from('profiles')
                .select('id, full_name, phone, email, role, created_at', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (search) {
                query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
            }
            if (role) {
                query = query.eq('role', role);
            }

            const { data, error, count } = await query;
            if (error) throw error;

            return reply.send({ success: true, count, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch users.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/providers — Paginated provider list
    // ──────────────────────────────────────────────
    const listProvidersSchema = {
        querystring: {
            type: 'object',
            properties: {
                search: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'verified', 'rejected'] },
                limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
                offset: { type: 'integer', minimum: 0, default: 0 }
            },
            additionalProperties: false
        }
    } as const;

    fastify.get('/providers', { schema: listProvidersSchema }, async (request, reply) => {
        const { search, status, limit = 20, offset = 0 } = request.query;
        try {
            let query = supabaseAdmin
                .from('profiles')
                .select('*, provider_details(*)', { count: 'exact' })
                .eq('role', 'PROVIDER')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (search) {
                query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
            }
            if (status) {
                query = query.eq('provider_details.verification_status', status);
            }

            const { data, error, count } = await query;
            if (error) throw error;
            return reply.send({ success: true, count, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch providers.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/bookings — All bookings with filters
    // ──────────────────────────────────────────────
    const listBookingsSchema = {
        querystring: {
            type: 'object',
            properties: {
                status: { type: 'string' },
                limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
                offset: { type: 'integer', minimum: 0, default: 0 }
            },
            additionalProperties: false
        }
    } as const;

    fastify.get('/bookings', { schema: listBookingsSchema }, async (request, reply) => {
        const { status, limit = 50, offset = 0 } = request.query;

        try {
            let query = supabaseAdmin
                .from('vw_booking_summary_fast')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (status && status !== 'all') {
                query = query.eq('status', status);
            }

            const { data, error, count } = await query;
            if (error) throw error;

            return reply.send({ success: true, count, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch bookings.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/bookings/:id — Rich booking detail
    // ──────────────────────────────────────────────
    const getBookingSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.get('/bookings/:id', { schema: getBookingSchema }, async (request, reply) => {
        const { id } = request.params;

        try {
            const { data, error } = await supabaseAdmin
                .from('bookings')
                .select(`
                    *,
                    customer:profiles!bookings_customer_id_fkey(*),
                    provider:profiles!bookings_provider_id_fkey(*, provider_details(*)),
                    service:services(*),
                    subcategory:service_subcategories(*),
                    review:booking_reviews(*),
                    financials:financial_ledger(*)
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) return reply.code(404).send({ error: 'Booking not found.' });

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch booking detail.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/providers/:id — Rich provider detail & history
    // ──────────────────────────────────────────────
    const getProviderSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.get('/providers/:id', { schema: getProviderSchema }, async (request, reply) => {
        const { id } = request.params;

        try {
            // 1. Get Profile & Provider Details
            const { data: provider, error: fetchErr } = await supabaseAdmin
                .from('profiles')
                .select('*, provider_details(*)')
                .eq('id', id)
                .single();

            if (fetchErr || !provider) return reply.code(404).send({ error: 'Provider not found.' });

            // 2. Get Recent Bookings
            const { data: recentBookings } = await supabaseAdmin
                .from('bookings')
                .select(`
                    id, booking_number, status, total_amount, created_at,
                    customer:profiles!bookings_customer_id_fkey(full_name)
                `)
                .eq('provider_id', id)
                .order('created_at', { ascending: false })
                .limit(10);

            // 3. Get Financial Stats
            const { data: ledger } = await supabaseAdmin
                .from('financial_ledger')
                .select('amount, transaction_type')
                .eq('profile_id', id);

            const totalEarnings = (ledger || [])
                .filter(l => l.transaction_type === 'provider_credit')
                .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

            return reply.send({
                success: true,
                data: {
                    ...provider,
                    recentBookings: recentBookings || [],
                    stats: {
                        totalEarnings: Math.round(totalEarnings * 100) / 100,
                        bookingCount: provider.total_jobs_completed || 0
                    }
                }
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch provider detail.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/customers/:id — Rich customer detail & history
    // ──────────────────────────────────────────────
    const getCustomerSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.get('/customers/:id', { schema: getCustomerSchema }, async (request, reply) => {
        const { id } = request.params;

        try {
            // 1. Get Profile
            const { data: customer, error: fetchErr } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchErr || !customer) return reply.code(404).send({ error: 'Customer not found.' });

            // 2. Get Recent Bookings
            const { data: recentBookings } = await supabaseAdmin
                .from('bookings')
                .select(`
                    id, booking_number, status, total_amount, created_at,
                    service_name_snapshot
                `)
                .eq('customer_id', id)
                .order('created_at', { ascending: false })
                .limit(10);

            // 3. Get Financial Stats (Total Spend)
            const { data: ledger } = await supabaseAdmin
                .from('financial_ledger')
                .select('amount, transaction_type')
                .eq('profile_id', id);

            const totalSpend = (ledger || [])
                .filter(l => l.transaction_type === 'customer_payment' || l.transaction_type === 'payment')
                .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

            // 4. Get Addresses
            const { data: addresses } = await supabaseAdmin
                .from('address_book')
                .select('*')
                .eq('user_id', id);

            return reply.send({
                success: true,
                data: {
                    ...customer,
                    recentBookings: recentBookings || [],
                    addresses: addresses || [],
                    stats: {
                        totalSpend: Math.round(totalSpend * 100) / 100,
                        bookingCount: recentBookings?.length || 0
                    }
                }
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch customer detail.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/admin/users/:id — Admin user management (verify, ban, etc.)
    // ──────────────────────────────────────────────
    const patchUserSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        body: {
            type: 'object',
            properties: {
                is_verified: { type: 'boolean' },
                is_banned: { type: 'boolean' },
                role: { type: 'string', enum: ['CUSTOMER', 'PROVIDER', 'ADMIN'] }
            },
            additionalProperties: false
        }
    } as const;

    fastify.patch('/users/:id', { schema: patchUserSchema }, async (request, reply) => {
        const { id } = request.params;
        const { is_verified, is_banned, role } = request.body;

        const safeUpdates: any = {};
        if (is_verified !== undefined) safeUpdates.is_verified = is_verified;
        if (is_banned !== undefined) safeUpdates.is_banned = is_banned;
        if (role !== undefined) safeUpdates.role = role;

        try {
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .update({ ...safeUpdates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            fastify.log.info({ action: 'admin.user.update', targetId: id, fields: Object.keys(safeUpdates) }, 'Admin updated user');
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update user.', details: err.message });
        }
    });

    // ══════════════════════════════════════════════
    // CATALOG — Categories CRUD
    // ══════════════════════════════════════════════

    // GET /api/v1/admin/categories — List all categories
    fastify.get('/categories', async (request, reply) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('service_categories')
                .select('*')
                .order('priority_number', { ascending: false })
                .order('name', { ascending: true });
            if (error) throw error;
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch categories.', details: err.message });
        }
    });

    // GET /api/v1/admin/categories/:id — Get category detail
    fastify.get('/categories/:id', { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } }, async (request, reply) => {
        const { id } = request.params as any;
        try {
            const { data, error } = await supabaseAdmin.from('service_categories').select('*').eq('id', id).single();
            if (error) throw error;
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(err.code === 'PGRST116' ? 404 : 500).send({ error: 'Failed to fetch category details.', details: err.message });
        }
    });

    // POST /api/v1/admin/categories — Create a category
    const createCategorySchema = {
        body: {
            type: 'object',
            required: ['name'],
            properties: {
                name: { type: 'string', minLength: 2 },
                description: { type: 'string' },
                icon_name: { type: 'string' },
                image_url: { type: 'string' },
                priority_number: { type: 'integer' },
                display_order: { type: 'integer' },
                is_active: { type: 'boolean', default: true }
            }
        }
    } as const;

    fastify.post('/categories', { schema: createCategorySchema }, async (request, reply) => {
        const body = request.body as any;
        try {
            const slug = body.name.toLowerCase().replace(/\s+/g, '-');
            const priorityNumber = body.priority_number ?? body.display_order ?? 0;
            const displayOrder = body.display_order ?? body.priority_number ?? 0;
            
            const { data, error } = await supabaseAdmin
                .from('service_categories')
                .insert([{ ...body, slug, priority_number: priorityNumber, display_order: displayOrder }])
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            return reply.code(201).send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to create category.', details: err.message });
        }
    });

    // PATCH /api/v1/admin/categories/:id — Update a category
    const updateCategorySchema = {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                icon_name: { type: 'string' },
                image_url: { type: 'string' },
                priority_number: { type: 'integer' },
                display_order: { type: 'integer' },
                is_active: { type: 'boolean' }
            }
        }
    } as const;

    fastify.patch('/categories/:id', { schema: updateCategorySchema }, async (request, reply) => {
        const { id } = request.params as any;
        const body = request.body as any;
        try {
            const updates: any = { ...body, updated_at: new Date().toISOString() };
            if (body.priority_number !== undefined) updates.display_order = body.priority_number;
            if (body.display_order !== undefined) updates.priority_number = body.display_order;

            const { data, error } = await supabaseAdmin
                .from('service_categories')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update category.', details: err.message });
        }
    });

    // DELETE /api/v1/admin/categories/:id — Delete a category
    fastify.delete('/categories/:id', { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } }, async (request, reply) => {
        const { id } = request.params as any;
        try {
            const { error } = await supabaseAdmin.from('service_categories').delete().eq('id', id);
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            return reply.send({ success: true, message: 'Category deleted.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to delete category.', details: err.message });
        }
    });

    // ══════════════════════════════════════════════
    // CATALOG — Services CRUD
    // ══════════════════════════════════════════════

    // GET /api/v1/admin/services — List all services
    fastify.get('/services', async (request, reply) => {
        try {
            const { data, error, count } = await supabaseAdmin
                .from('services')
                .select('*', { count: 'exact' })
                .order('priority_number', { ascending: false })
                .order('name', { ascending: true });

            if (error) throw error;
            return reply.send({ success: true, count, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch services.', details: err.message });
        }
    });

    // GET /api/v1/admin/services/:id — Get service detail
    fastify.get('/services/:id', { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } }, async (request, reply) => {
        const { id } = request.params as any;
        try {
            const { data, error } = await supabaseAdmin.from('services').select('*').eq('id', id).single();
            if (error) throw error;
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(err.code === 'PGRST116' ? 404 : 500).send({ error: 'Failed to fetch service details.', details: err.message });
        }
    });

    // POST /api/v1/admin/services — Create a service
    const createServiceSchema = {
        body: {
            type: 'object',
            required: ['name', 'description'],
            properties: {
                name: { type: 'string', minLength: 2 },
                description: { type: 'string' },
                image_url: { type: ['string', 'null'] },
                priority_number: { type: 'integer', default: 0 },
                is_active: { type: 'boolean', default: true },
                category: { type: 'string' },
                is_popular: { type: 'boolean', default: false },
                is_smart_pick: { type: 'boolean', default: false },
                is_recommended: { type: 'boolean', default: false }
            }
        }
    } as const;

    fastify.post('/services', { schema: createServiceSchema }, async (request, reply) => {
        const body = request.body;
        try {
            const slug = (body.name || '').toLowerCase().replace(/\s+/g, '-');
            const { data, error } = await supabaseAdmin
                .from('services')
                .insert([{ ...body, slug }])
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            fastify.log.info({ action: 'admin.service.create', serviceId: data.id }, 'Service created by admin');
            return reply.code(201).send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to create service.', details: err.message });
        }
    });

    // PATCH /api/v1/admin/services/:id — Update a service
    const updateServiceSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        body: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                image_url: { type: ['string', 'null'] },
                priority_number: { type: 'integer' },
                is_active: { type: 'boolean' },
                category: { type: 'string' },
                is_popular: { type: 'boolean' },
                is_smart_pick: { type: 'boolean' },
                is_recommended: { type: 'boolean' }
            }
        }
    } as const;

    fastify.patch('/services/:id', { schema: updateServiceSchema }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        try {
            const { data, error } = await supabaseAdmin
                .from('services')
                .update({ ...body, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            await cache.invalidate(`service:${id}`);
            fastify.log.info({ action: 'admin.service.update', serviceId: id }, 'Service updated by admin');
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update service.', details: err.message });
        }
    });

    // DELETE /api/v1/admin/services/:id — Delete a service
    const deleteServiceSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.delete('/services/:id', { schema: deleteServiceSchema }, async (request, reply) => {
        const { id } = request.params;
        try {
            const { error } = await supabaseAdmin.from('services').delete().eq('id', id);
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            await cache.invalidate(`service:${id}`);
            fastify.log.info({ action: 'admin.service.delete', serviceId: id }, 'Service deleted by admin');
            return reply.send({ success: true, message: 'Service deleted.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to delete service.', details: err.message });
        }
    });

    // ── Subcategories ──

    // GET /api/v1/admin/subcategories — List all subcategories
    fastify.get('/subcategories', async (request, reply) => {
        try {
            const { data, error, count } = await supabaseAdmin
                .from('service_subcategories')
                .select('*', { count: 'exact' })
                .order('name', { ascending: true });

            if (error) throw error;
            return reply.send({ success: true, count, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch subcategories.', details: err.message });
        }
    });

    // GET /api/v1/admin/subcategories/:id — Get subcategory detail
    fastify.get('/subcategories/:id', { schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } }, async (request, reply) => {
        const { id } = request.params as any;
        try {
            const { data, error } = await supabaseAdmin.from('service_subcategories').select('*').eq('id', id).single();
            if (error) throw error;
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(err.code === 'PGRST116' ? 404 : 500).send({ error: 'Failed to fetch subcategory details.', details: err.message });
        }
    });

    // POST /api/v1/admin/subcategories — Create a subcategory
    const createSubSchema = {
        body: {
            type: 'object',
            required: ['name', 'service_id', 'base_price'],
            properties: {
                name: { type: 'string' },
                service_id: { type: 'string', format: 'uuid' },
                description: { type: 'string' },
                base_price: { type: 'number', minimum: 0 },
                unit: { type: 'string', enum: ['fixed', 'hourly', 'daily'], default: 'fixed' },
                image_url: { type: ['string', 'null'] },
                is_active: { type: 'boolean', default: true },
                display_order: { type: 'integer', default: 0 },
                priority_number: { type: 'integer', default: 0 },
                is_one_time: { type: 'boolean', default: true },
                is_daily: { type: 'boolean', default: false },
                is_weekly: { type: 'boolean', default: false },
                is_monthly: { type: 'boolean', default: false },
                is_popular: { type: 'boolean', default: false },
                is_smart_pick: { type: 'boolean', default: false },
                is_recommended: { type: 'boolean', default: false },
                long_description: { type: ['string', 'null'] },
                benefits: { type: 'array', items: { type: 'string' }, default: [] },
                exclusions: { type: 'array', items: { type: 'string' }, default: [] },
                faqs: { type: 'array', items: { type: 'object' }, default: [] },
                gallery_urls: { type: 'array', items: { type: 'string' }, default: [] }
            }
        }
    } as const;

    fastify.post('/subcategories', { schema: createSubSchema }, async (request, reply) => {
        const body = request.body;
        try {
            const slug = (body.name || '').toLowerCase().replace(/\s+/g, '-');
            
            // Ensure BOTH display_order and priority_number are populated for cross-API compatibility
            const displayOrder = body.display_order ?? body.priority_number ?? 0;
            const priorityNumber = body.priority_number ?? body.display_order ?? 0;
            
            const { data, error } = await supabaseAdmin
                .from('service_subcategories')
                .insert([{ 
                    ...body, 
                    slug, 
                    display_order: displayOrder,
                    priority_number: priorityNumber,
                    unit: body.unit || 'fixed' 
                }])
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            if (body.service_id) await cache.invalidate(`subcategories:${body.service_id}`);
            fastify.log.info({ action: 'admin.subcategory.create', subId: data.id }, 'Subcategory created by admin');
            return reply.code(201).send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to create subcategory.', details: err.message });
        }
    });

    // PATCH /api/v1/admin/subcategories/:id — Update a subcategory
    const updateSubSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        body: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                service_id: { type: 'string', format: 'uuid' },
                description: { type: 'string' },
                base_price: { type: 'number', minimum: 0 },
                unit: { type: 'string', enum: ['fixed', 'hourly', 'daily'] },
                image_url: { type: ['string', 'null'] },
                is_active: { type: 'boolean' },
                display_order: { type: 'integer' },
                priority_number: { type: 'integer' },
                is_one_time: { type: 'boolean' },
                is_daily: { type: 'boolean' },
                is_weekly: { type: 'boolean' },
                is_monthly: { type: 'boolean' },
                is_popular: { type: 'boolean' },
                is_smart_pick: { type: 'boolean' },
                is_recommended: { type: 'boolean' },
                long_description: { type: ['string', 'null'] },
                benefits: { type: 'array', items: { type: 'string' } },
                exclusions: { type: 'array', items: { type: 'string' } },
                faqs: { type: 'array', items: { type: 'object' } },
                gallery_urls: { type: 'array', items: { type: 'string' } }
            }
        }
    } as const;

    fastify.patch('/subcategories/:id', { schema: updateSubSchema }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        try {
            // Handle cross-utility for ordering columns
            const updates: any = { ...body };
            if (body.display_order !== undefined) updates.priority_number = body.display_order;
            if (body.priority_number !== undefined) updates.display_order = body.priority_number;

            const { data, error } = await supabaseAdmin
                .from('service_subcategories')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:*');
            if (data.service_id) await cache.invalidate(`subcategories:${data.service_id}`);
            fastify.log.info({ action: 'admin.subcategory.update', subId: id }, 'Subcategory updated by admin');
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update subcategory.', details: err.message });
        }
    });

    // DELETE /api/v1/admin/subcategories/:id — Delete a subcategory
    const deleteSubSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.delete('/subcategories/:id', { schema: deleteSubSchema }, async (request, reply) => {
        const { id } = request.params;
        try {
            const { data: sub } = await supabaseAdmin.from('service_subcategories').select('service_id').eq('id', id).single();
            const { error } = await supabaseAdmin.from('service_subcategories').delete().eq('id', id);
            if (error) throw error;
            
            await cache.invalidatePattern('services:*');
            if (sub?.service_id) await cache.invalidate(`subcategories:${sub.service_id}`);

            fastify.log.info({ action: 'admin.subcategory.delete', subId: id }, 'Subcategory deleted by admin');
            return reply.send({ success: true, message: 'Subcategory deleted.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to delete subcategory.', details: err.message });
        }
    });

    // ── Banners ──

    // GET /api/v1/admin/banners — List all banners
    fastify.get('/banners', async (request, reply) => {
        try {
            const { data, error } = await supabaseAdmin
                .from('home_banners')
                .select('*')
                .order('priority_number', { ascending: false });
            if (error) throw error;
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch banners.', details: err.message });
        }
    });

    // POST /api/v1/admin/banners — Create a banner
    const createBannerSchema = {
        body: {
            type: 'object',
            required: ['image_url', 'action_type'],
            properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                image_url: { type: 'string', format: 'uri' },
                action_type: { type: 'string', enum: ['url', 'service', 'category', 'none'] },
                action_value: { type: 'string' },
                is_active: { type: 'boolean', default: true },
                priority_number: { type: 'integer', default: 0 }
            }
        }
    } as const;

    fastify.post('/banners', { schema: createBannerSchema }, async (request, reply) => {
        const body = request.body;
        try {
            const { data, error } = await supabaseAdmin
                .from('home_banners')
                .insert([body])
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:banners:*');
            fastify.log.info({ action: 'admin.banner.create', bannerId: data.id }, 'Banner created by admin');
            return reply.code(201).send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to create banner.', details: err.message });
        }
    });

    // PATCH /api/v1/admin/banners/:id — Update a banner
    const updateBannerSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string' }
            }
        },
        body: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                image_url: { type: 'string' },
                action_type: { type: 'string', enum: ['url', 'service', 'category', 'none'] },
                action_value: { type: 'string' },
                is_active: { type: 'boolean' },
                priority_number: { type: 'integer' }
            }
        }
    } as const;

    fastify.patch('/banners/:id', { schema: updateBannerSchema }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;
        try {
            const { data, error } = await supabaseAdmin
                .from('home_banners')
                .update(body)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            await cache.invalidatePattern('services:banners:*');
            fastify.log.info({ action: 'admin.banner.update', bannerId: id }, 'Banner updated by admin');
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update banner.', details: err.message });
        }
    });

    // DELETE /api/v1/admin/banners/:id — Delete a banner
    const deleteBannerSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string' }
            }
        }
    } as const;

    fastify.delete('/banners/:id', { schema: deleteBannerSchema }, async (request, reply) => {
        const { id } = request.params;
        try {
            const { error } = await supabaseAdmin.from('home_banners').delete().eq('id', id);
            if (error) throw error;
            await cache.invalidatePattern('services:banners:*');
            fastify.log.info({ action: 'admin.banner.delete', bannerId: id }, 'Banner deleted by admin');
            return reply.send({ success: true, message: 'Banner deleted.' });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to delete banner.', details: err.message });
        }
    });

    // ── Providers Admin ──

    // PATCH /api/v1/admin/providers/:id — Verify/suspend provider
    const patchProviderSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        },
        body: {
            type: 'object',
            properties: {
                is_verified: { type: 'boolean' },
                is_suspended: { type: 'boolean' },
                is_online: { type: 'boolean' },
                verification_status: { type: 'string', enum: ['pending', 'verified', 'rejected'] }
            },
            additionalProperties: false
        }
    } as const;

    fastify.patch('/providers/:id', { schema: patchProviderSchema }, async (request, reply) => {
        const { id } = request.params;
        const { is_verified, is_suspended, is_online, verification_status } = request.body;

        const safeUpdates: any = {};
        if (is_verified !== undefined) safeUpdates.is_verified = is_verified;
        if (is_suspended !== undefined) safeUpdates.is_suspended = is_suspended;
        if (is_online !== undefined) safeUpdates.is_online = is_online;
        if (verification_status !== undefined) safeUpdates.verification_status = verification_status;

        try {
            const { data, error } = await supabaseAdmin
                .from('provider_details')
                .update({ ...safeUpdates, updated_at: new Date().toISOString() })
                .eq('provider_id', id)
                .select()
                .single();
            if (error) throw error;
            fastify.log.info({ action: 'admin.provider.update', providerId: id, fields: Object.keys(safeUpdates) }, 'Provider updated by admin');
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update provider.', details: err.message });
        }
    });

    // ── Payouts Admin ──
    await fastify.register(adminPayoutRoutes, { prefix: '/payouts' });

    // ── Zones Admin ──
    await fastify.register(adminZoneRoutes, { prefix: '/zones' });
}

