import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { config } from './lib/config';
import WebSocket from 'ws';
import Fastify from 'fastify';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { setShuttingDown } from './lib/resilience';

// Initialize Sentry early so it catches startup sequence errors
if (config.SENTRY_DSN) {
    Sentry.init({
        dsn: config.SENTRY_DSN,
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,  // Save quota in production
        profilesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
}

// Route Imports
import addressRoutes from './routes/address';
import adminRoutes from './routes/admin';
import bookingRoutes from './routes/booking';
import couponRoutes from './routes/coupon';
import draftRoutes from './routes/draft';
import availabilityRoutes from './routes/availability';
import paymentRoutes from './routes/payment';
import earningsRoutes from './routes/earnings';
import jobOfferRoutes from './routes/jobOffer';
import notificationRoutes from './routes/notification';
import payoutRoutes from './routes/payout';
import providerRoutes from './routes/provider';
import reviewRoutes from './routes/review';
import scheduleRoutes from './routes/schedule';
import searchRoutes from './routes/search';
import serviceRoutes from './routes/service';
import userRoutes from './routes/user';

const isDev = config.NODE_ENV !== 'production';

const server = Fastify({
    logger: true,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: config.BODY_LIMIT,
    connectionTimeout: config.SERVER_TIMEOUT_MS, // Tunable limit to mitigate Slowloris attacks
    keepAliveTimeout: 65000,  // 65s for Railway/AWS load balancer compatibility
});

// ── Structured HTTP Access Logging Hook ─────────────────
server.addHook('onResponse', (request, reply, done) => {
    // Skip health check spam in logs
    if (request.url !== '/health' && request.url !== '/nginx-health') {
        request.log.info({
            reqId: request.id,
            latency_ms: Math.round(reply.elapsedTime),
            status: reply.statusCode,
        }, `${request.method} ${request.url} - request completed`);
    }
    done();
});

// ── Disable Client-Side HTTP Caching Globally ───────────
// Forces the frontend React Native fetch/OkHttp to always ask the server for fresh data.
// This is critical because our caching happens in Redis, not on the user's phone.
server.addHook('onSend', (request, reply, payload, done) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    reply.header('Surrogate-Control', 'no-store');
    done(null, payload);
});

// ── Razorpay Webhook Raw Body Handler ───────────────────
// We need the raw body for reliable HMAC signature verification.
server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    if (req.url.endsWith('/payments/webhook')) {
        try {
            const rawBody = body.toString();
            const json = JSON.parse(rawBody);
            (req as any).rawBody = rawBody; // Store raw string for signature verification
            done(null, json);
        } catch (err: any) {
            err.statusCode = 400;
            done(err, undefined);
        }
    } else {
        // Standard JSON parsing for other routes
        try {
            const json = JSON.parse(body.toString());
            done(null, json);
        } catch (err: any) {
            err.statusCode = 400;
            done(err, undefined);
        }
    }
});

// ── Binary Upload Handler for Proxy ─────────────────────
// 🚀 Support ALL image formats (jpeg, png, heic, webp) + raw binary data
server.addContentTypeParser(/^image\/.*/, { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body);
});

server.addContentTypeParser(['application/octet-stream', 'multipart/form-data'], { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body);
});

// ── Global Error Handler ────────────────────────────────
server.setErrorHandler((error: any, request, reply) => {
    if (config.SENTRY_DSN) {
        Sentry.captureException(error, {
            tags: { reqId: request.id },
            extra: { url: request.url, method: request.method }
        });
    }

    const statusCode = error.statusCode || 500;
    const isPayloadTooLarge = error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || statusCode === 413;
    const isRateLimit = statusCode === 429;
    const isClientError = statusCode >= 400 && statusCode < 500 && !isPayloadTooLarge && !isRateLimit;
    const isDatabaseTimeout = error.message === 'DATABASE_TIMEOUT';
    const isCircuitOpen = error.message === 'DATABASE_CIRCUIT_OPEN';

    if (isPayloadTooLarge) {
        // Log as a warning for security auditing (DoS detection)
        request.log.warn({
            url: request.url,
            method: request.method,
            reqId: request.id,
            errorCode: error.code
        }, 'Security Alert: Payload Size Limit Exceeded');
    } else if (isRateLimit) {
        request.log.warn({
            url: request.url,
            ip: request.ip,
            reqId: request.id,
        }, 'Rate limit exceeded');
    } else if (isClientError) {
        request.log.warn({
            url: request.url,
            method: request.method,
            reqId: request.id,
            errorCode: error.code,
            msg: error.message
        }, 'Client Error (4xx)');
    } else if (isDatabaseTimeout || isCircuitOpen) {
        request.log.error({
            url: request.url,
            method: request.method,
            reqId: request.id,
        }, isCircuitOpen ? 'Database Circuit Open (fail-fast)' : 'Database Query Timeout');
    } else {
        server.log.error({
            reqId: request.id,
            err: {
                message: error.message,
                code: error.code,
                stack: config.NODE_ENV === 'production' ? undefined : error.stack,
            },
        }, 'Unhandled API Error');
    }

    // Send generic response to client to avoid leaking internals
    if (isDatabaseTimeout || isCircuitOpen) {
        return reply.status(isCircuitOpen ? 503 : 504).send({
            success: false,
            error: isCircuitOpen ? 'SERVICE_TEMPORARILY_UNAVAILABLE' : 'DATABASE_TIMEOUT',
            details: isCircuitOpen 
                ? 'The database is recovering. Requests are being rejected temporarily. Please retry in a few seconds.'
                : 'The database took too long to respond. Please try again later.',
            reqId: request.id
        });
    }

    reply.status(isPayloadTooLarge ? 413 : statusCode).send({
        success: false,
        error: isPayloadTooLarge ? 'Payload Too Large' : (error.message || 'Internal Server Error'),
        message: isPayloadTooLarge 
            ? `Request body exceeds the maximum allowed size of ${Math.round(config.BODY_LIMIT / 1024 / 1024 * 100) / 100}MB.`
            : undefined,
        reqId: request.id
    });
});

async function startServer() {
    // ── 1. Core Security ────────────────────────────────
    await server.register(helmet);
    // CORS: Whitelist allowed origins (configurable via CORS_ORIGINS env var)
    const allowedOrigins = config.CORS_ORIGINS;

    const defaultOrigins = [
        'http://localhost:3000',     // Admin portal (dev)
        'http://localhost:8081',     // Expo dev client
        'http://192.168.1.112:3000', // Admin portal (local network)
    ];

    const origins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;

    await server.register(cors, {
        // React Native apps (Android/iOS) do NOT send an Origin header.
        // A strict whitelist would silently block all mobile API calls in production.
        // We use a function to: allow all mobile (no-origin) requests + allow whitelisted browser origins.
        origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
            // No origin = React Native / cURL / Postman — always allow
            if (!origin) return cb(null, true);

            // Browser origin — check against whitelist
            if (origins.includes(origin)) return cb(null, true);

            // 🌐 Allow ALL local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x, etc.)
            // This ensures login works from any local machine or WiFi network.
            const isLocalNetwork = /^(http|https):\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.0\.0\.1)/.test(origin);
            if (isLocalNetwork) return cb(null, true);

            // In dev, allow everything
            if (isDev) return cb(null, true);

            // Default: block unknown browser origins
            cb(new Error(`CORS: Origin ${origin} not allowed`), false);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder', 'x-access-token', 'Cache-Control', 'Pragma', 'Expires', 'x-client-info', 'apikey'],
        credentials: true,
    });

    // ── 2. Rate Limiting ────────────────────────────────
    await server.register(rateLimit, {
        max: 500,
        timeWindow: '1 minute',
    });

    // ── 2.5 Compression ────────────────────────────────
    await server.register(compress, {
        global: true, // Compress all endpoints automatically
        encodings: ['gzip', 'deflate'], // Brotli ('br') missing native zlib fastify typing sometimes, stick to safe defaults
    });

    // ── 3. API Docs (Swagger) ───────────────────────────
    await server.register(import('@fastify/swagger'), {
        openapi: {
            openapi: '3.0.0',
            info: {
                title: 'Workla Microservices API',
                description: 'Internal API Gateway for Workla Backend Services',
                version: '1.0.0',
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
            security: [{ bearerAuth: [] }],
        },
    });

    await server.register(import('@fastify/swagger-ui'), {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'full',
            deepLinking: false,
        },
    });

    // ── 4. Health Check — Deep System Status ────────────
    server.get('/', async () => {
        return { status: 'OK', service: 'Workla API Gateway', version: '1.0.0', docs: '/docs' };
    });

    server.get('/ping', async () => {
        return { status: 'pulsing', timestamp: new Date().toISOString() };
    });

    server.get('/health', async (_req, reply) => {
        const { redis } = await import('./lib/redis');
        const { esClient } = await import('./lib/elasticsearch');
        const { supabaseAdmin } = await import('./lib/supabase');

        const startTime = Date.now();
        const checks: Record<string, any> = {
            service: 'Workla API Gateway',
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            uptime: `${Math.round(process.uptime())}s`,
            timestamp: new Date().toISOString(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
            },
        };

        // ── Redis ──
        const redisStart = Date.now();
        try {
            const pong = await Promise.race([
                redis.ping(), 
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), config.REDIS_TIMEOUT_MS / 2))
            ]);
            checks.redis = {
                status: pong === 'PONG' ? 'connected' : 'memory_fallback',
                latency_ms: Date.now() - redisStart,
                mode: redis.connected ? 'real' : 'in-memory',
            };
        } catch {
            checks.redis = { status: 'disconnected', latency_ms: Date.now() - redisStart };
        }

        // ── Elasticsearch ──
        const esStart = Date.now();
        try {
            const esInfo = await Promise.race([
                esClient.info(), 
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), config.ELASTIC_TIMEOUT_MS / 2))
            ]) as any;
            checks.elasticsearch = {
                status: 'connected',
                version: esInfo.version?.number,
                cluster: esInfo.cluster_name,
                latency_ms: Date.now() - esStart,
            };
        } catch {
            checks.elasticsearch = { status: 'disconnected', latency_ms: Date.now() - esStart };
        }

        // ── Supabase ──
        const sbStart = Date.now();
        try {
            const { count, error } = await supabaseAdmin.from('bookings').select('*', { count: 'exact', head: true });
            checks.supabase = {
                status: error ? 'error' : 'connected',
                latency_ms: Date.now() - sbStart,
                ...(error ? { error: error.message } : { bookings_count: count }),
            };
        } catch (e: any) {
            checks.supabase = { status: 'disconnected', latency_ms: Date.now() - sbStart, error: e.message };
        }

        // ── Overall Status ──
        const allHealthy = checks.supabase?.status === 'connected';  // Supabase is the critical dependency
        checks.status = allHealthy ? 'healthy' : 'degraded';
        checks.total_latency_ms = Date.now() - startTime;

        return reply.code(allHealthy ? 200 : 207).send(checks);
    });

    // ── 4.5. Supabase Reverse Proxy ─────────────────────
    // Uses native fetch to forward /supabase/* requests to the real Supabase project.
    // This avoids @fastify/http-proxy which conflicts with the global Razorpay JSON parser (FST_ERR_CTP_ALREADY_PRESENT).
    server.log.info('📦 Registering Supabase Reverse Proxy at /supabase...');

    const supabaseProxyHandler = async (req: any, reply: any) => {
        // Strip prefixes and trim leading slashes to prevent double-slashes
        const cleanedPath = req.url.replace(/^\/api\/v1\/supabase/, '').replace(/^\/supabase/, '').replace(/^\/+/, '');
        const baseUrl = config.SUPABASE_URL.replace(/\/$/, ''); // Remove trailing slash if exists
        const upstreamUrl = `${baseUrl}/${cleanedPath}`;

        const forwardHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers as Record<string, string>)) {
            const lowerKey = key.toLowerCase();
            // 🛡️ Skip hop-by-hop, caching, and encoding headers that interfere
            // EXTREMELY IMPORTANT: Exclude 'accept-encoding' so fetch auto-decodes gzip, preventing binary gibberish!
            // EXTREMELY IMPORTANT: Strip 'cf-' and 'x-forwarded-' headers because forwarding Cloudflare edge headers to Supabase's Cloudflare triggers a 403 Forbidden HTML block!
            if (
                !['host', 'connection', 'transfer-encoding', 'te', 'trailers', 'upgrade', 'expect', 'content-length', 'accept-encoding'].includes(lowerKey) &&
                !lowerKey.startsWith('cf-') &&
                !lowerKey.startsWith('x-forwarded-')
            ) {
                // Ensure values are strings
                forwardHeaders[key] = String(value);
            }
        }

        const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        // 🛡️ Fix: Correctly handle Buffers (binary data) for storage uploads
        // If it's already a Buffer or String, pass it through. Only stringify Objects.
        const bodyToSend = hasBody 
            ? (Buffer.isBuffer(req.body) || typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
            : undefined;

        server.log.info(`[Proxy 🔄] → ${req.method} ${upstreamUrl}`);

        try {
            const upstreamRes = await fetch(upstreamUrl, {
                method: req.method,
                headers: forwardHeaders,
                body: bodyToSend,
            });

            server.log.info(`[Proxy 🟢] ← ${upstreamRes.status} from ${upstreamUrl}`);

            // Forward response status, but prevent Cloudflare from injecting HTML on 502/503/504
            let safeStatus = upstreamRes.status;
            if (safeStatus >= 502 && safeStatus <= 504) {
               safeStatus = 500; // bypass cloudflare html injection
            }
            reply.code(safeStatus);
            
            // 🛡️ Filter response headers: Exclude encoding/length that our local server will re-calculate
            upstreamRes.headers.forEach((value, key) => {
                const lowerKey = key.toLowerCase();
                if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lowerKey)) {
                    reply.header(key, value);
                }
            });

            const responseBody = await upstreamRes.text();
            if (!responseBody) {
                return reply.send();
            }
            return reply.send(responseBody);
        } catch (err: any) {
            server.log.error(`[Proxy ❌] ${upstreamUrl} failed: ${err.message}`);
            return reply.status(500).send({ 
                success: false, 
                error: 'SUPABASE_PROXY_ERROR', 
                message: err.message 
            });
        }
    };

    // Register proxy for all HTTP methods (Both root and api/v1 prefixes)
    server.all('/supabase', supabaseProxyHandler);
    server.all('/supabase/*', supabaseProxyHandler);
    server.all('/api/v1/supabase', supabaseProxyHandler);
    server.all('/api/v1/supabase/*', supabaseProxyHandler);

    // ── 5. Register Microservice Routes ─────────────────
    server.log.info('📦 Registering microservice routes...');

    await server.register(adminRoutes, { prefix: '/api/v1/admin' });
    await server.register(addressRoutes, { prefix: '/api/v1/addresses' });
    await server.register(bookingRoutes, { prefix: '/api/v1/bookings' });
    await server.register(couponRoutes, { prefix: '/api/v1/coupons' });
    await server.register(draftRoutes, { prefix: '/api/v1/drafts' });
    await server.register(availabilityRoutes, { prefix: '/api/v1/availability' });
    await server.register(earningsRoutes, { prefix: '/api/v1/earnings' });
    await server.register(jobOfferRoutes, { prefix: '/api/v1/job-offers' });
    await server.register(notificationRoutes, { prefix: '/api/v1/notifications' });
    await server.register(paymentRoutes, { prefix: '/api/v1/payments' });
    await server.register(payoutRoutes, { prefix: '/api/v1/payouts' });
    await server.register(providerRoutes, { prefix: '/api/v1/providers' });
    await server.register(reviewRoutes, { prefix: '/api/v1/reviews' });
    await server.register(scheduleRoutes, { prefix: '/api/v1/schedule' });
    await server.register(searchRoutes, { prefix: '/api/v1/search' });
    await server.register(serviceRoutes, { prefix: '/api/v1/services' });
    await server.register(userRoutes, { prefix: '/api/v1/users' });
    server.log.info('✅ All routes registered successfully');


    // ── 6. Start Listening ──────────────────────────────
    const port = parseInt(process.env.PORT || '8000', 10);
    try {
        await server.listen({ port, host: '0.0.0.0' });
        server.log.info(`🚀 HTTP API Gateway running on port ${port}`);

        // 7. Hook WebSockets into the running HTTP server
        const { initializeWebSockets } = await import('./socket');
        initializeWebSockets(server.server, server.log);

        // 8. Start Background Workers
        const { startNotificationWorker } = await import('./events/workers/notificationWorker');
        await startNotificationWorker();

        const { startSearchWorker } = await import('./events/workers/searchWorker');
        await startSearchWorker();

        // Location worker disabled — EventBus.publish('provider.location_updated') was 
        // removed to save Redis/ES resources (see provider.ts:512). The worker was only 
        // creating failed ES sync attempts and unnecessary Redis consumer groups.
        // const { startLocationWorker } = await import('./events/workers/locationWorker');
        // await startLocationWorker();

        // 9. Initialize Elasticsearch Index Mappings
        const { initializeElasticsearch } = await import('./lib/elasticsearch');
        await initializeElasticsearch();

        // 10. 🔥 Keep-Alive Self-Ping (prevents Railway free-tier cold starts)
        // Railway sleeps idle services after ~5 min. We ping ourselves every 4 min to stay warm.
        const KEEP_ALIVE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/ping`
            : null;

        if (KEEP_ALIVE_URL) {
            server.log.info(`⏰ Keep-alive enabled → ${KEEP_ALIVE_URL}`);
            setInterval(async () => {
                try {
                    await fetch(KEEP_ALIVE_URL);
                } catch {
                    // Silently ignore — not critical
                }
            }, 4 * 60 * 1000); // Every 4 minutes
        }

    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }

    // ── 11. Supabase Real-time WebSocket Proxy ───────────
    // Handle WebSocket upgrades for Supabase manually.
    const supabaseWss = new WebSocket.Server({ noServer: true });
    
    server.server.on('upgrade', (request, socket, head) => {
        const url = request.url || '';
        if (url.startsWith('/supabase/realtime/v1/websocket')) {
            server.log.info(`🔌 Proxying Supabase Real-time WebSocket: ${url}`);

            supabaseWss.handleUpgrade(request, socket, head, (localWs) => {
                // Construct the real Supabase WebSocket URL
                const wsUpstreamUrl = config.SUPABASE_URL.replace(/^http/, 'ws') + url.replace(/^\/supabase/, '');

                // Extract apikey and authorization from headers or query string
                const searchParams = new URL(url, `http://${request.headers.host}`).searchParams;
                const apikey = (request.headers['apikey'] as string) || searchParams.get('apikey') || '';
                const authorization = (request.headers['authorization'] as string) || searchParams.get('authorization') || `Bearer ${apikey}`;

                const proxyWs = new WebSocket(wsUpstreamUrl, {
                    headers: {
                        apikey,
                        authorization,
                    }
                });

                const bridge = (src: WebSocket, dest: WebSocket) => {
                    src.on('message', (data) => {
                        if (dest.readyState === WebSocket.OPEN) dest.send(data);
                    });
                    src.on('close', () => dest.terminate());
                    src.on('error', (err) => {
                        server.log.error(`Proxy WS Error: ${err.message}`);
                        src.terminate();
                        dest.terminate();
                    });
                };

                proxyWs.on('open', () => {
                    server.log.info('✅ Supabase Real-time Proxy Connected');
                    bridge(localWs, proxyWs);
                    bridge(proxyWs, localWs);
                });

                proxyWs.on('error', (err) => {
                    server.log.error(`Supabase Upstream WS Error: ${err.message}`);
                    localWs.close(1011, 'Upstream Connection Error');
                });
            });
        }
        // socket.io handles its own upgrades automatically via its internal listeners
    });
}

// ── Graceful Shutdown ───────────────────────────────────
async function shutdown(signal: string) {
    console.warn(`\n🛑 ${signal} received. Shutting down gracefully...`);
    setShuttingDown();
    try {
        await server.close();
        console.warn('✅ HTTP server closed.');

        const { redis } = await import('./lib/redis');
        await redis.quit();
        console.warn('✅ Redis disconnected.');

        const { EventBus } = await import('./events/bus');
        await EventBus.disconnectAll();
    } catch (err) {
        console.error('❌ Error during shutdown:', err);
    }
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
