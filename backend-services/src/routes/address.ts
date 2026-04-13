import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';
import { cache } from '../lib/cache';

const ADDR_TTL = 120; // 2 minutes — addresses rarely change

export default async function addressRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes in this file require authentication
    fastify.addHook('preValidation', requireAuth);

    /**
     * @route GET /api/v1/addresses
     * @desc Get all saved addresses for the current user
     */
    fastify.get('/', async (request, reply) => {
        const userId = request.user.sub;
        const cacheKey = `addresses:${userId}`;

        // 1. Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) return cached;

        // 2. Cache miss — fetch from DB
        const { data, error } = await supabaseAdmin
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', userId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        // 3. Store in cache
        await cache.set(cacheKey, data, ADDR_TTL);

        return data;
    });

    const createAddressSchema = {
        body: {
            type: 'object',
            required: ['name', 'full_address'],
            properties: {
                name: { type: 'string', minLength: 2 },
                full_address: { type: 'string', minLength: 10 },
                label: { type: 'string', enum: ['Home', 'Work', 'Other'] },
                landmark: { type: 'string' },
                latitude: { type: 'number', minimum: -90, maximum: 90 },
                longitude: { type: 'number', minimum: -180, maximum: 180 },
                is_default: { type: 'boolean' }
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/', { schema: createAddressSchema }, async (request, reply) => {
        const userId = request.user.sub;
        const body = request.body;

        // Check if this is the first address, if so, make it default
        const { count } = await supabaseAdmin
            .from('customer_addresses')
            .select('*', { count: 'exact', head: true })
            .eq('customer_id', userId);

        const isDefault = (count === 0) || body.is_default === true;

        // If setting as default, unset others first
        if (isDefault) {
            await supabaseAdmin
                .from('customer_addresses')
                .update({ is_default: false })
                .eq('customer_id', userId);
        }

        const { data, error } = await supabaseAdmin
            .from('customer_addresses')
            .insert({
                customer_id: userId,
                label: body.label || 'Home',
                name: body.name,
                full_address: body.full_address,
                landmark: body.landmark || null,
                latitude: body.latitude || null,
                longitude: body.longitude || null,
                is_default: isDefault
            })
            .select()
            .single();

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        // Invalidate cache so next GET is fresh
        await cache.invalidate(`addresses:${userId}`);

        return data;
    });

    const updateAddressSchema = {
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
                name: { type: 'string', minLength: 2 },
                full_address: { type: 'string', minLength: 10 },
                label: { type: 'string', enum: ['Home', 'Work', 'Other'] },
                landmark: { type: 'string' },
                latitude: { type: 'number', minimum: -90, maximum: 90 },
                longitude: { type: 'number', minimum: -180, maximum: 180 },
                is_default: { type: 'boolean' }
            },
            additionalProperties: false
        }
    } as const;

    fastify.patch('/:id', { schema: updateAddressSchema }, async (request, reply) => {
        const userId = request.user.sub;
        const { id } = request.params;
        const body = request.body;

        // Security check: Ensure address belongs to user
        const { data: existing } = await supabaseAdmin
            .from('customer_addresses')
            .select('customer_id')
            .eq('id', id)
            .single();

        if (!existing || existing.customer_id !== userId) {
            return reply.code(403).send({ error: 'Forbidden: You do not own this address' });
        }

        // If updating to default, unset others
        if (body.is_default === true) {
            await supabaseAdmin
                .from('customer_addresses')
                .update({ is_default: false })
                .eq('customer_id', userId);
        }

        const { data, error } = await supabaseAdmin
            .from('customer_addresses')
            .update({
                label: body.label,
                name: body.name,
                full_address: body.full_address,
                landmark: body.landmark,
                latitude: body.latitude,
                longitude: body.longitude,
                is_default: body.is_default
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        // Invalidate cache
        await cache.invalidate(`addresses:${userId}`);

        return data;
    });

    const deleteAddressSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', format: 'uuid' }
            }
        }
    } as const;

    fastify.delete('/:id', { schema: deleteAddressSchema }, async (request, reply) => {
        const userId = request.user.sub;
        const { id } = request.params;

        // Security check
        const { data: existing } = await supabaseAdmin
            .from('customer_addresses')
            .select('customer_id')
            .eq('id', id)
            .single();

        if (!existing || existing.customer_id !== userId) {
            return reply.code(403).send({ error: 'Forbidden' });
        }

        const { error } = await supabaseAdmin
            .from('customer_addresses')
            .delete()
            .eq('id', id);

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        // Invalidate cache
        await cache.invalidate(`addresses:${userId}`);

        return { success: true };
    });
}
