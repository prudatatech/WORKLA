import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth } from '../middlewares/auth';

export default async function scheduleRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();
    // 🛡️ All routes require authentication
    fastify.addHook('preValidation', requireAuth);

    // ──────────────────────────────────────────────
    // GET /api/v1/schedule — Get provider's weekly schedule
    // ──────────────────────────────────────────────
    fastify.get('/', async (request, reply) => {
        const user = request.user;

        if (user.role !== 'PROVIDER' && user.role !== 'ADMIN') {
            return reply.code(403).send({ error: 'Access Denied.' });
        }

        try {
            const { data, error } = await supabaseAdmin
                .from('provider_schedules')
                .select('*')
                .eq('provider_id', user.sub)
                .order('day_of_week', { ascending: true });

            if (error) throw error;

            return reply.send({ success: true, data: data || [] });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to fetch schedule.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // PUT /api/v1/schedule — Set/Replace entire weekly schedule
    // ──────────────────────────────────────────────
    const putScheduleSchema = {
        body: {
            type: 'array',
            minItems: 1,
            maxItems: 7,
            items: {
                type: 'object',
                required: ['dayOfWeek', 'startTime', 'endTime', 'isAvailable'],
                properties: {
                    dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
                    startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):?([0-5]\\d)$' },
                    endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):?([0-5]\\d)$' },
                    isAvailable: { type: 'boolean' }
                },
                additionalProperties: false
            }
        }
    } as const;

    fastify.put('/', { schema: putScheduleSchema }, async (request, reply) => {
        const user = request.user;
        const schedules = request.body;

        if (user.role !== 'PROVIDER') {
            return reply.code(403).send({ error: 'Access Denied: Only providers can set their schedule.' });
        }

        try {
            // Delete existing schedule
            await supabaseAdmin
                .from('provider_schedules')
                .delete()
                .eq('provider_id', user.sub);

            // Insert new schedule
            const rows = schedules.map(s => ({
                provider_id: user.sub,
                day_of_week: s.dayOfWeek,
                start_time: s.startTime,
                end_time: s.endTime,
                is_available: s.isAvailable,
            }));

            const { data, error } = await supabaseAdmin
                .from('provider_schedules')
                .insert(rows)
                .select();

            if (error) throw error;

            return reply.send({ success: true, message: 'Schedule updated.', data });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to update schedule.', details: err.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/schedule/availability — Check provider availability for a date
    // ──────────────────────────────────────────────
    const checkAvailabilitySchema = {
        querystring: {
            type: 'object',
            required: ['providerId', 'date'],
            properties: {
                providerId: { type: 'string', format: 'uuid' },
                date: { type: 'string', format: 'date' }
            }
        }
    } as const;

    fastify.get('/availability', { schema: checkAvailabilitySchema }, async (request, reply) => {
        const { providerId, date } = request.query;

        try {
            const dayOfWeek = new Date(date).getDay();

            // 1. Check if provider has a schedule entry for this day
            const { data: schedule, error: schedError } = await supabaseAdmin
                .from('provider_schedules')
                .select('*')
                .eq('provider_id', providerId)
                .eq('day_of_week', dayOfWeek)
                .eq('is_available', true)
                .single();

            if (schedError || !schedule) {
                return reply.send({
                    success: true,
                    available: false,
                    message: 'Provider is not available on this day.',
                });
            }

            // 2. Check how many bookings they already have that day
            const { count: existingBookings } = await supabaseAdmin
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('provider_id', providerId)
                .eq('scheduled_date', date)
                .in('status', ['confirmed', 'in_progress']);

            return reply.send({
                success: true,
                available: true,
                schedule: {
                    startTime: schedule.start_time,
                    endTime: schedule.end_time,
                },
                existingBookings: existingBookings || 0,
            });
        } catch (err: any) {
            return reply.code(500).send({ error: 'Failed to check availability.', details: err.message });
        }
    });
}
