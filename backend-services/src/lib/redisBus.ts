import { redis } from './redis';
import { getShuttingDown } from './resilience';
import { v4 as uuidv4 } from 'uuid';

/**
 * ⚡ RedisBus — Elite Kafka-like Messaging using Redis Streams
 * 
 * Provides durable Pub/Sub with Consumer Groups, PEL recovery, XCLAIM janitor, and DLQ.
 */

interface Handler {
    (data: any, headers: Record<string, string>, topic: string): Promise<void>;
}

const activeConsumers: { stop: () => void }[] = [];
const HEARTBEAT_INTERVAL = 10000;
const BLOCK_TIME = 60000; // 60s
const STALE_THRESHOLD_MS = 60000; // 60s
const JANITOR_INTERVAL_MS = 300000; // 5m
const MAX_RETRIES = 5;
const MAX_MESSAGE_AGE_MS = 600_000; // 10 minutes — discard messages older than this

export const RedisBus = {
    /**
     * Publishes a message to a Redis Stream (XADD).
     */
    async publish(topic: string, payload: any, key?: string, headers?: Record<string, string>): Promise<boolean> {
        try {
            const client = redis.raw;
            const message = JSON.stringify(payload);
            const headerStr = JSON.stringify(headers || {});
            
            // XADD topic MAXLEN ~ 10000 * payload <json> headers <json> key <key>
            await client.xadd(
                topic, 
                'MAXLEN', '~', '10000', 
                '*', 
                'payload', message,
                'headers', headerStr,
                'key', key || ''
            );
            return true;
        } catch (err: any) {
            console.error(`[RedisBus ❌] Failed to publish to ${topic}:`, err.message);
            return false;
        }
    },

    /**
     * Subscribes to a stream using Consumer Groups (XREADGROUP).
     */
    async subscribe(topic: string | string[], handler: Handler, groupId?: string): Promise<void> {
        const topics = Array.isArray(topic) ? topic : [topic];
        const consumerGroup = groupId || `${topics[0].replace(/\./g, '-')}-group`;
        const consumerName = `consumer-${uuidv4().split('-')[0]}`;

        for (const t of topics) {
            let attempt = 0;
            const maxAttempts = 10;
            const subscriberClient = redis.createSubscriber ? redis.createSubscriber() : redis.raw;

            while (attempt < maxAttempts && !getShuttingDown()) {
                try {
                    // 1. Ensure Consumer Group exists
                    await subscriberClient.xgroup('CREATE', t, consumerGroup, '$', 'MKSTREAM').catch((err: any) => {
                        if (!err.message.includes('BUSYGROUP')) throw err;
                    });

                    let running = true;
                    const stop = () => { 
                        running = false; 
                        if (subscriberClient && subscriberClient.quit) subscriberClient.quit();
                    };
                    activeConsumers.push({ stop });

                    // 2. Message Processor helper
                    const processMessage = async (id: string, fields: string[], stream: string) => {
                        const data: any = {};
                        for (let i = 0; i < fields.length; i += 2) {
                            data[fields[i]] = fields[i+1];
                        }

                        try {
                            const payload = JSON.parse(data.payload);
                            const headers = JSON.parse(data.headers || '{}');
                            
                            await handler(payload, headers, stream);
                            
                            // Acknowledge (XACK)
                            await subscriberClient.xack(stream, consumerGroup, id);
                        } catch (handlerErr: any) {
                            console.error(`[RedisBus ❌] Handler error on ${stream} ID ${id}:`, handlerErr.message);
                            
                            // 💀 Check if it's a "poison pill" (too many retries)
                            const pendingInfo = await subscriberClient.xpending(stream, consumerGroup, '-', '+', 1, consumerName);
                            const deliveryCount = pendingInfo[0] ? (pendingInfo[0] as any)[3] : 0;

                            if (deliveryCount >= MAX_RETRIES) {
                                console.error(`[RedisBus 💀] Max retries reached for ${id}. Moving to DLQ.`);
                                await this.publishDLQ(stream, data.payload, `Max retries reached: ${handlerErr.message}`);
                                await subscriberClient.xack(stream, consumerGroup, id); // Remove from PEL
                            }
                        }
                    };

                    // 3. Start Message Loop
                    const poll = async () => {
                        // Phase A: Recover messages assigned to this consumer but not ACKed (PEL)
                        console.warn(`[RedisBus 🔄] Recovering pending messages for ${consumerName}...`);
                        const pending = await subscriberClient.xreadgroup(
                            'GROUP', consumerGroup, consumerName,
                            'COUNT', '10',
                            'STREAMS', t, '0'
                        );
                        if (pending) {
                            for (const [stream, messages] of pending) {
                                for (const [id, fields] of messages) {
                                    await processMessage(id, fields, stream);
                                }
                            }
                        }

                        // Phase B: Main event loop ('>')
                        while (running && !getShuttingDown()) {
                            try {
                                const results = await subscriberClient.xreadgroup(
                                    'GROUP', consumerGroup, consumerName,
                                    'COUNT', '1',
                                    'BLOCK', BLOCK_TIME,
                                    'STREAMS', t, '>'
                                );

                                if (!results) continue;

                                for (const [stream, messages] of results) {
                                    for (const [id, fields] of messages) {
                                        await processMessage(id, fields, stream);
                                    }
                                }
                            } catch (pollErr: any) {
                                if (getShuttingDown()) break;
                                console.error(`[RedisBus ❌] Poll error on ${t}:`, pollErr.message);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                        }
                    };

                    // 4. Start Janitor Loop (XCLAIM stale messages from other crashed consumers)
                    const startJanitor = async () => {
                        while (running && !getShuttingDown()) {
                            await new Promise(resolve => setTimeout(resolve, JANITOR_INTERVAL_MS));
                            if (!running || getShuttingDown()) break;

                            try {
                                // Find messages pending for > STALE_THRESHOLD but not for this specific consumer
                                const pendingList = await subscriberClient.xpending(t, consumerGroup, '-', '+', 10) as any[];
                                
                                for (const p of pendingList) {
                                    const [id, owner, idleTime, deliveryCount] = p;
                                    if (owner !== consumerName && idleTime > STALE_THRESHOLD_MS) {
                                        // If message is older than MAX_AGE, it's stale data — ACK and discard
                                        if (idleTime > MAX_MESSAGE_AGE_MS) {
                                            console.warn(`[RedisBus 🗑️] Discarding ancient message ${id} from ${owner} (Idle: ${Math.round(idleTime/1000)}s > ${MAX_MESSAGE_AGE_MS/1000}s)`);
                                            await subscriberClient.xclaim(t, consumerGroup, consumerName, STALE_THRESHOLD_MS, id);
                                            await subscriberClient.xack(t, consumerGroup, id); // Remove from PEL permanently
                                            continue;
                                        }

                                        console.warn(`[RedisBus 🕵️] Claiming stale message ${id} from ${owner} (Idle: ${idleTime}ms)`);
                                        await subscriberClient.xclaim(t, consumerGroup, consumerName, STALE_THRESHOLD_MS, id);
                                    }
                                }
                            } catch (janitorErr: any) {
                                console.error(`[RedisBus 🧹] Janitor error on ${t}:`, janitorErr.message);
                            }
                        }
                    };

                    poll();
                    startJanitor();
                    console.warn(`[RedisBus ✅] Subscribed to '${t}' (Group: ${consumerGroup}, Consumer: ${consumerName})`);
                    break; // Successfully subscribed, break out of retry loop
                } catch (err: any) {
                    attempt++;
                    if (attempt >= maxAttempts) {
                        console.error(`[RedisBus ❌] Failed to setup subscription for ${t} after ${maxAttempts} attempts:`, err.message);
                    } else {
                        // Suppress verbose logs if it's just the expected startup connection issue
                        const isConnectionErr = err.message.includes("Stream isn't writeable");
                        if (!isConnectionErr) {
                            console.warn(`[RedisBus ⚠️] Subscription attempt ${attempt} for ${t} failed. Retrying in ${attempt}s...`, err.message);
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                }
            }
        }
    },

    /**
     * Helper for Dead Letter Queue.
     */
    async publishDLQ(originalTopic: string, failedPayloadStr: string, errorReason: any): Promise<void> {
        const dlqTopic = `dlq:${originalTopic}`;
        try {
            const payload = JSON.parse(failedPayloadStr);
            await this.publish(dlqTopic, {
                originalTopic,
                failedAt: new Date().toISOString(),
                error: errorReason instanceof Error ? errorReason.message : String(errorReason),
                payload
            });
        } catch {
             await this.publish(dlqTopic, {
                originalTopic,
                failedAt: new Date().toISOString(),
                error: errorReason instanceof Error ? errorReason.message : String(errorReason),
                rawPayload: failedPayloadStr
            });
        }
    },

    /**
     * Disconnect all consumers.
     */
    async disconnectAll(): Promise<void> {
        console.warn(`[RedisBus 🛑] Stopping ${activeConsumers.length} consumers...`);
        activeConsumers.forEach(c => c.stop());
        activeConsumers.length = 0;
    }
};
