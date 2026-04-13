import { esClient } from '../../lib/elasticsearch';
import { EventBus } from '../bus';

/**
 * Search Data Sync Worker
 * 
 * Asynchronously listens to database changes (via EventBus) and upserts 
 * data into Elasticsearch so the search index is always fresh.
 */
export async function startSearchWorker() {
    console.warn('🔎 Search Sync Worker started. Listening for provider events...');

    const { isElasticsearchConnected } = await import('../../lib/elasticsearch');

    EventBus.subscribe(['provider.location_updated', 'provider.profile_updated'], async (data: any, _headers, topic) => {
        if (!isElasticsearchConnected()) return; // Fail fast if ES is offline

        try {
            if (topic === 'provider.location_updated') {
                await esClient.update({
                    index: 'providers',
                    id: data.providerId,
                    doc: {
                        location: { lat: data.latitude, lon: data.longitude },
                        updated_at: new Date().toISOString()
                    },
                    doc_as_upsert: true
                });
                console.warn(`[Worker 📍] Synced location to ES for provider ${data.providerId}`);
            } else if (topic === 'provider.profile_updated') {
                await esClient.update({
                    index: 'providers',
                    id: data.providerId,
                    doc: { ...data.profileInfo, updated_at: new Date().toISOString() },
                    doc_as_upsert: true
                });
                console.warn(`[Worker 📝] Synced profile to ES for provider ${data.providerId}`);
            }
        } catch (err: any) {
            console.error(`[Worker ❌] Failed to sync ES for ${data.providerId} on topic ${topic}:`, err.message);
        }
    }, 'search-sync-worker');
}
