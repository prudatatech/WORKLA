import { Client } from '@elastic/elasticsearch';
import { config } from './config';
import { getBackoffMs, getShuttingDown } from './resilience';

// Force IPv4 to avoid Windows ECONNREFUSED on ::1 (IPv6 localhost)
const ELASTIC_URL = config.ELASTIC_URL.replace('localhost', '127.0.0.1');
const ELASTIC_USERNAME = process.env.ELASTIC_USERNAME;
const ELASTIC_PASSWORD = process.env.ELASTIC_PASSWORD;

let isElasticConnected = false;

// 🛡️ High-Speed Search Engine Connection
export const esClient = new Client({
    node: ELASTIC_URL,
    auth: ELASTIC_USERNAME && ELASTIC_PASSWORD ? {
        username: ELASTIC_USERNAME,
        password: ELASTIC_PASSWORD
    } : undefined,
    requestTimeout: config.ELASTIC_TIMEOUT_MS,   // Tunable query timeout
    maxRetries: 2,          // Only retry twice to avoid slow startup
    sniffOnStart: false,    // Disable sniffing - causes issues in single-node dev setups
});

export const isElasticsearchConnected = () => isElasticConnected;

/**
 * Initializes the required Elasticsearch indices and mappings.
 * Uses a background retry loop to ensure "hydration" if ES boots up late.
 */
export async function initializeElasticsearch(retryCount = 0) {
    const isLocalhost = ELASTIC_URL.includes('localhost') || ELASTIC_URL.includes('127.0.0.1');
    const isProd = config.NODE_ENV === 'production';

    if (ELASTIC_URL === 'none' || ELASTIC_URL === 'false' || (isLocalhost && isProd)) {
        if (retryCount === 0) {
            console.warn(`[Elasticsearch 🛑] Disabled ${isLocalhost ? 'due to localhost URL in production' : 'via env var'}.`);
        }
        return;
    }

    const indexName = 'providers';

    try {
        const exists = await esClient.indices.exists({ index: indexName });

        if (!exists) {
            await esClient.indices.create({
                index: indexName,
                mappings: {
                    properties: {
                        provider_id: { type: 'keyword' },
                        business_name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                        services: { type: 'keyword' },
                        rating: { type: 'float' },
                        total_jobs: { type: 'integer' },
                        location: { type: 'geo_point' },
                        is_verified: { type: 'boolean' },
                        updated_at: { type: 'date' }
                    }
                }
            });
            console.warn(`[Elasticsearch ✅] Created index '${indexName}' with geo_point mapping.`);
        } else {
            console.warn(`[Elasticsearch 🔎] Connected. Index '${indexName}' already exists.`);
        }
        isElasticConnected = true;
    } catch (error: any) {
        isElasticConnected = false;
        if (getShuttingDown()) return;
        
        if (retryCount >= 5) {
            console.warn(`[Elasticsearch 🛑] Giving up connection after 5 attempts. Search features disabled.`);
            return;
        }

        const backoffMs = getBackoffMs(retryCount);
        console.warn(`[Elasticsearch ⚠️] Link down. Retrying in ${Math.round(backoffMs/1000)}s...`);
        
        setTimeout(() => {
            initializeElasticsearch(retryCount + 1).catch(() => { /* error ignored */ });
        }, backoffMs);
    }
}
