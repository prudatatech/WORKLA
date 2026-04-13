import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../../lib/supabase';
import { requireAuth } from '../../middlewares/auth';

export default async function adminZoneRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    
    // 🛡️ Require auth for all admin routes
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/admin/zones — List all service zones
    // ──────────────────────────────────────────────
    fastify.get('/', async (request, reply) => {
        try {
            // We use a raw query or RPC if we want to return GeoJSON directly, 
            // but for now simple select is fine, PostGIS might return WKB (hex).
            // Let's use a select that converts geometry to GeoJSON string.
            const { data, error } = await supabaseAdmin
                .from('service_zones')
                .select('id, name, description, status, created_at, boundary');

            if (error) throw error;

            return reply.send({ success: true, data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch service zones.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /api/v1/admin/zones — Create a new zone
    // ──────────────────────────────────────────────
    const createZoneSchema = {
        body: {
            type: 'object',
            required: ['name', 'geoJson'],
            properties: {
                name: { type: 'string', minLength: 3 },
                description: { type: 'string' },
                status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
                geoJson: { type: 'object', additionalProperties: true } // Expecting Feature or Polygon
            },
            additionalProperties: false
        }
    } as const;

    fastify.post('/', { schema: createZoneSchema }, async (request, reply) => {
        const { name, description, status, geoJson } = request.body;

        try {
            // Convert GeoJSON to WKT or use ST_GeomFromGeoJSON in a raw RPC
            // Since Supabase client doesn't support raw SQL easily without a dedicated RPC:
            // Let's create a helper RPC 'create_service_zone' in the migration if needed, 
            // or just format the Polygon string here if it's a simple Polygon.
            
            // For robustness, we'll assume the client sends a clean GeoJSON Polygon.
            // We'll use an RPC to handle the conversion safely.
            const { data, error } = await supabaseAdmin.rpc('upsert_service_zone', {
                p_name: name,
                p_description: description || null,
                p_status: status,
                p_geojson: JSON.stringify(geoJson)
            });

            if (error) throw error;

            return reply.code(201).send({ success: true, message: 'Service zone created.', data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to create service zone.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PATCH /api/v1/admin/zones/:id — Update zone
    // ──────────────────────────────────────────────
    const updateZoneSchema = {
        params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } }
        },
        body: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                status: { type: 'string', enum: ['active', 'inactive'] },
                geoJson: { type: 'object', additionalProperties: true }
            },
            additionalProperties: false
        }
    } as const;

    fastify.patch('/:id', { schema: updateZoneSchema }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body;

        try {
            const { data, error } = await supabaseAdmin.rpc('upsert_service_zone', {
                p_id: id,
                p_name: body.name || null,
                p_description: body.description || null,
                p_status: body.status || null,
                p_geojson: body.geoJson ? JSON.stringify(body.geoJson) : null
            });

            if (error) throw error;

            return reply.send({ success: true, message: 'Service zone updated.', data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update service zone.', details: err.message });
        }
    });
}
