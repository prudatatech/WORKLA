import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { cache } from '../lib/cache';
import { supabaseAdmin } from '../lib/supabase';

export default async function serviceRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();

    // ──────────────────────────────────────────────
    // GET /api/v1/services — List all active services
    // ──────────────────────────────────────────────
    const listServicesSchema = {
        querystring: {
            type: 'object',
            properties: {
                category: { type: 'string' },
                limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
                offset: { type: 'integer', minimum: 0, default: 0 },
                refresh: { type: 'boolean', default: false }
            }
        }
    } as const;

    fastify.get('/', { schema: listServicesSchema }, async (request, reply) => {
        const { category, limit = 50, offset = 0, refresh = false } = request.query;
        const cacheKey = `services:${category || 'all'}:${limit}:${offset}`;

        try {
            const data = await cache.getOrSet(cacheKey, async () => {
                let query = supabaseAdmin
                    .from('services')
                    .select('id, name, slug, description, image_url, display_order', { count: 'exact' })
                    .eq('is_active', true)
                    .order('display_order', { ascending: true })
                    .range(offset, offset + limit - 1);

                if (category) {
                    query = query.eq('category', category);
                }

                const res = await query;
                if (res.error) throw res.error;
                
                // Alias display_order to priority_number for frontend compatibility
                const mappedData = (res.data || []).map(s => ({
                    ...s,
                    priority_number: s.display_order
                }));

                return { count: res.count, data: mappedData };
            }, 600, refresh as boolean);

            return reply.send({ success: true, ...data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch services.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/services/featured — Home screen featured services
    // ──────────────────────────────────────────────
    const featuredSchema = {
        querystring: {
            type: 'object',
            properties: {
                refresh: { type: 'boolean', default: false }
            }
        }
    } as const;

    fastify.get('/featured', { schema: featuredSchema }, async (request, reply) => {
        const { refresh = false } = request.query;
        const cacheKey = 'services:featured:v7';

        try {
            const data = await cache.getOrSet(cacheKey, async () => {
                const { data: allSubs, error } = await supabaseAdmin
                    .from('service_subcategories')
                    .select('id, name, slug, description, image_url, service_id, base_price, display_order')
                    .eq('is_active', true)
                    .order('display_order', { ascending: true, nullsFirst: false })
                    .limit(50);

                if (error) throw error;
                
                const mappedSubs = (allSubs || []).map(s => ({
                    ...s,
                    priority_number: s.display_order
                }));

                const subs = mappedSubs;
                const popular = subs.slice(0, 8);
                
                let smartPicks = subs.slice(8, 16);
                if (smartPicks.length < 3 && subs.length > 0) {
                    smartPicks = [...subs.slice(0, 8)].reverse().slice(0, 8);
                }

                let recommended = subs.slice(16, 24);
                if (recommended.length < 3 && subs.length > 0) {
                    recommended = subs.length > 10 ? subs.slice(5, 13) : subs.slice(0, 8);
                }

                return { popular, smartPicks, recommended };
            }, 300, refresh as boolean);

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch featured.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/services/:id — Get service details
    // ──────────────────────────────────────────────
    const getServiceSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.get('/:id', { schema: getServiceSchema }, async (request, reply) => {
        const { id } = request.params;
        if (id === 'featured') return; // Should be handled by static route, but for safety

        const cacheKey = `service:${id}`;
        try {
            const data = await cache.getOrSet(cacheKey, async () => {
                const { data, error } = await supabaseAdmin
                    .from('services')
                    .select('*, service_subcategories(*)')
                    .eq('id', id)
                    .eq('is_active', true)
                    .single();

                if (error) throw error;
                return data;
            }, 600);

            if (!data) return reply.code(404).send({ error: 'Service not found.' });
            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch service.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/services/:id/subcategories — List subcategories
    // ──────────────────────────────────────────────
    const getSubcategoriesSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.get('/:id/subcategories', { schema: getSubcategoriesSchema }, async (request, reply) => {
        const { id } = request.params;
        const cacheKey = `subcategories:${id}`;

        try {
            const data = await cache.getOrSet(cacheKey, async () => {
                const { data, error } = await supabaseAdmin
                    .from('service_subcategories')
                    .select('*')
                    .eq('service_id', id)
                    .eq('is_active', true);

                if (error) throw error;
                return data;
            }, 1800);

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch subcategories.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/services/banners — Promotional banners
    // ──────────────────────────────────────────────
    const bannersSchema = {
        querystring: {
            type: 'object',
            properties: {
                refresh: { type: 'boolean', default: false }
            }
        }
    } as const;

    fastify.get('/banners', { schema: bannersSchema }, async (request, reply) => {
        const { refresh = false } = request.query;
        const cacheKey = 'services:banners:v2';

        try {
            const data = await cache.getOrSet(cacheKey, async () => {
                const { data, error } = await supabaseAdmin
                    .from('home_banners')
                    .select('*')
                    .eq('is_active', true)
                    .order('priority_number', { ascending: true })
                    .limit(10);

                if (error) throw error;
                return data;
            }, 300, refresh as boolean);

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch banners.', details: err.message });
        }
    });
}
