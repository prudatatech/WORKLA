import * as dotenv from 'dotenv';
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import { supabaseAdmin } from '../lib/supabase';
import { setupChatHandlers } from './handlers/chat';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from '../lib/redis';

dotenv.config();
export let io: Server;

export const getIO = () => io;

// Max WebSocket connections per user (prevents connection sprawl on multi-device login)
const MAX_SOCKETS_PER_USER = 2;

// ── WebSocket Auth Cache (prevents hammering Supabase on reconnect storms) ──
const wsAuthCache = new Map<string, { userId: string; expiresAt: number }>();
const inFlightWsAuth = new Map<string, Promise<any>>();
const WS_AUTH_CACHE_TTL = 120_000; // 2 minutes
const WS_AUTH_CACHE_MAX = 200;

export function initializeWebSockets(server: any, fastifyLogger: FastifyInstance['log']) {
    // 1. Initialize Socket.io on the raw Node HTTP server (from Fastify)
    io = new Server(server, {
        cors: {
            origin: '*', // Customize for production
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder', 'x-access-token'],
        },
        transports: ['websocket', 'polling'],
        // Connection limits to prevent resource exhaustion
        pingTimeout: 20000,
        pingInterval: 25000,
    });

    // 2. Multi-Instance Support: Redis Adapter (Disabled by default to save commands)
    if (redis.connected && process.env.ENABLE_SOCKET_REDIS === 'true') {
        const pubClient = redis.raw.duplicate();
        const subClient = redis.raw.duplicate();
        io.adapter(createAdapter(pubClient, subClient));
        fastifyLogger.info('🔗 Socket.io: Redis Adapter enabled (Ready for multi-instance)');
    } else {
        fastifyLogger.warn('⚠️ Socket.io: Redis adapter disabled (running in single-node mode to save commands)');
    }

    // 3. Supabase Auth Handshake Middleware (Secure the connection)
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers['x-access-token'];

        if (!token) {
            fastifyLogger.warn(`WebSocket connection rejected: Missing Token (Socket ID: ${socket.id})`);
            return next(new Error('Authentication error'));
        }

        try {
            // Check cache first to avoid hammering Supabase during reconnect storms
            const cached = wsAuthCache.get(token);
            if (cached && Date.now() < cached.expiresAt) {
                (socket as any).user = { sub: cached.userId };
                return next();
            }

            // Deduplicate concurrent auth requests from the same client
            if (inFlightWsAuth.has(token)) {
                const authResult = await inFlightWsAuth.get(token)!;
                if (authResult.error || !authResult.data?.user) throw new Error('Invalid token');
                (socket as any).user = { sub: authResult.data.user.id };
                return next();
            }

            const authPromise = supabaseAdmin.auth.getUser(token);
            inFlightWsAuth.set(token, authPromise);

            try {
                const authResult = await authPromise;

                if (authResult.error || !authResult.data?.user) throw new Error('Invalid token');

                // Cache the result
                if (wsAuthCache.size >= WS_AUTH_CACHE_MAX) {
                    const firstKey = wsAuthCache.keys().next().value;
                    if (firstKey) wsAuthCache.delete(firstKey);
                }
                wsAuthCache.set(token, { userId: authResult.data.user.id, expiresAt: Date.now() + WS_AUTH_CACHE_TTL });

                (socket as any).user = { sub: authResult.data.user.id };
                next();
            } finally {
                inFlightWsAuth.delete(token);
            }
        } catch (err: any) {
            fastifyLogger.warn(`WebSocket connection rejected: ${err.message} (Socket ID: ${socket.id})`);
            next(new Error('Authentication error'));
        }
    });

    // 4. Connection Lifecycle & Handler Attachment
    io.on('connection', (socket: Socket) => {
        const userId = (socket as any).user?.sub;
        if (!userId) {
            socket.disconnect();
            return;
        }

        fastifyLogger.info(`🟢 WebSocket Client Connected: ${socket.id} (User: ${userId})`);

        // Join a private room for this user to enable targeted notifications
        socket.join(`user:${userId}`);

        // ── Prevent Connection Sprawl ──
        // If user already has too many connections, disconnect the OLDEST ones
        const userRoom = io.sockets.adapter.rooms.get(`user:${userId}`);
        if (userRoom && userRoom.size > MAX_SOCKETS_PER_USER) {
            const socketIds = Array.from(userRoom);
            // Keep the newest MAX_SOCKETS_PER_USER sockets (current one is last), disconnect the rest
            const toDisconnect = socketIds.slice(0, socketIds.length - MAX_SOCKETS_PER_USER);
            for (const oldSocketId of toDisconnect) {
                const oldSocket = io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    fastifyLogger.warn(`🔄 Evicting old WebSocket ${oldSocketId} for user ${userId} (max ${MAX_SOCKETS_PER_USER} connections)`);
                    oldSocket.emit('session:replaced', { reason: 'New connection opened from another device' });
                    oldSocket.disconnect(true);
                }
            }
        }

        // Attach all domain-specific handlers
        setupChatHandlers(io, socket, fastifyLogger);

        socket.on('disconnect', () => {
            fastifyLogger.info(`🔴 WebSocket Client Disconnected: ${socket.id} (User: ${userId})`);
        });
    });

    fastifyLogger.info('🚀 High-Frequency WebSocket Engine Initialized');
}

/**
 * Sends a real-time notification to all active socket connections for a specific user.
 */
export function emitToUser(userId: string, event: string, data: any) {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
        return true;
    }
    return false;
}
