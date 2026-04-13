import { RedisBus } from '../lib/redisBus';
import { getShuttingDown } from '../lib/resilience';

/**
 * ⚡ Redis-Powered EventBus
 * 
 * Durable, horizontally scalable messaging using Redis Streams.
 */

interface Handler {
    (data: any, headers: Record<string, string>, topic: string): Promise<void>;
}

export const EventBus = {
    /**
     * Publishes an event to a specific Redis Stream.
     */
    async publish(topic: string, payload: any, headers?: Record<string, string>, key?: string): Promise<void> {
        const reqId = headers && headers['x-request-id'] ? `[${headers['x-request-id']}] ` : '';
        
        const routingKey = key || 
            payload.bookingId || 
            payload.providerId || 
            payload.userId ||
            payload.id;

        const logKey = routingKey ? ` (Key: ${routingKey})` : '';
        console.warn(`[EventBus 📤]${reqId}Publishing to '${topic}'${logKey}...`);
        
        const success = await RedisBus.publish(topic, payload, routingKey, headers);
        if (!success) {
            console.error(`[EventBus ❌]${reqId}Failed to publish message to stream '${topic}'`);
        }
    },

    /**
     * Subscribes to one or more Redis Streams as a part of a consumer group.
     */
    async subscribe(topic: string | string[], handler: Handler, groupId?: string): Promise<void> {
        const topics = Array.isArray(topic) ? topic : [topic];
        
        try {
            await RedisBus.subscribe(topics, handler, groupId);
        } catch (error: any) {
            if (getShuttingDown()) return;
            console.error(`[EventBus ❌] Failed to subscribe to streams '${topics.join(', ')}': ${error.message}`);
        }
    },
    
    /**
     * Gracefully shutdown all active consumers.
     */
    async disconnectAll() {
        await RedisBus.disconnectAll();
    }
};

