import { FastifyInstance } from 'fastify';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { esClient } from '../lib/elasticsearch';

export default async function searchRoutes(fastifyInstance: FastifyInstance) {
    const fastify = fastifyInstance.withTypeProvider<JsonSchemaToTsProvider>();

    /**
     * High-Speed Geospatial & Full-Text Search
     * Bypasses Postgres completely for sub-millisecond discovery.
     */
    const searchSchema = {
        querystring: {
            type: 'object',
            properties: {
                q: { type: 'string', minLength: 1 },
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lon: { type: 'number', minimum: -180, maximum: 180 },
                radius: { type: 'string', pattern: '^\\d+(km|m|mi)$', default: '10km' },
                minRating: { type: 'number', minimum: 0, maximum: 5, default: 0 }
            }
        }
    } as const;

    fastify.get('/', {
        schema: searchSchema,
        config: {
            rateLimit: {
                max: 30, // Strict limit for heavy search/scraping protection
                timeWindow: '1 minute'
            }
        }
    }, async (request, reply) => {
        const { q, lat, lon, radius = '10km', minRating = 0 } = request.query;

        // Check if search service is online before attempting query
        const { isElasticsearchConnected } = await import('../lib/elasticsearch');
        if (!isElasticsearchConnected()) {
            return reply.status(503).send({ 
                success: false, 
                error: 'Search Unavailable', 
                message: 'The search engine is temporarily offline. Please try again in 30 seconds.'
            });
        }

        try {
            // Construct the Elastic boolean query
            const mustClauses: any[] = [];
            const filterClauses: any[] = [];

            // 1. Full-text search on business name or services
            if (q) {
                mustClauses.push({
                    multi_match: {
                        query: q,
                        fields: ['business_name^3', 'services'], // boost business name
                        fuzziness: 'AUTO'
                    }
                });
            } else {
                mustClauses.push({ match_all: {} });
            }

            // 2. Geospatial Filtering (ST_DWithin equivalent)
            if (lat && lon) {
                filterClauses.push({
                    geo_distance: {
                        distance: radius,
                        location: {
                            lat: lat,
                            lon: lon
                        }
                    }
                });
            }

            // 3. Rating Filtering
            if (minRating > 0) {
                filterClauses.push({
                    range: {
                        rating: { gte: minRating }
                    }
                });
            }

            // Execute the blazing fast query
            const result: any = await esClient.search({
                index: 'providers',
                query: {
                    bool: {
                        must: mustClauses,
                        filter: filterClauses
                    }
                },
                // Sort by distance if coordinates provided, else by rating
                sort: lat && lon ? [
                    {
                        _geo_distance: {
                            location: { lat: lat, lon: lon },
                            order: 'asc',
                            unit: 'km'
                        }
                    }
                ] : [{ rating: { order: 'desc' } }]
            });

            // Format response exactly like the frontend expects
            const hits = result.hits.hits.map((hit: any) => ({
                id: hit._id,
                score: hit._score,
                ...hit._source,
                distance_km: hit.sort ? hit.sort[0] : null // Distance comes back in the sort array
            }));

            return reply.send({ success: true, count: hits.length, data: hits });

        } catch (err: any) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Search Engine Error', details: err.message });
        }
    });
}
