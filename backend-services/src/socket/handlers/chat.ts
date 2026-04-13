import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import { supabaseAdmin } from '../../lib/supabase';

/**
 * High-Frequency Chat Handler
 * 
 * Bypasses direct postgres inserts on the critical path.
 * 1. Client sends message -> Server receives
 * 2. Server instantly broadcasts to room via RAM (Redis pub/sub)
 * 3. Server async-persist to Postgres in background
 */
export function setupChatHandlers(io: Server, socket: Socket, logger: FastifyInstance['log']) {

    // Join a specific booking's chat room
    socket.on('chat:join', (data: { bookingId: string }) => {
        if (!data.bookingId) return;

        const roomName = `booking:${data.bookingId}`;
        socket.join(roomName);
        logger.info(`Socket ${socket.id} joined room: ${roomName}`);
    });

    // Leave a specific booking's chat room
    socket.on('chat:leave', (data: { bookingId: string }) => {
        if (!data.bookingId) return;

        const roomName = `booking:${data.bookingId}`;
        socket.leave(roomName);
        logger.info(`Socket ${socket.id} left room: ${roomName}`);
    });

    // Send a message
    socket.on('chat:sendMessage', async (payload: { bookingId: string, content: string }) => {
        const user = (socket as any).user;
        if (!user || (!payload.bookingId && !payload.content)) return;

        const roomName = `booking:${payload.bookingId}`;
        const senderId = user.sub;

        // Construct the message object
        const chatMessage = {
            id: crypto.randomUUID?.() || Date.now().toString(),
            booking_id: payload.bookingId,
            sender_id: senderId,
            content: payload.content,
            created_at: new Date().toISOString(),
        };

        // 1. INSTANT BROADCAST (RAM Speed)
        io.to(roomName).emit('chat:newMessage', chatMessage);

        // 2. ASYNC PERSISTENCE (Background)
        supabaseAdmin
            .from('chat_messages')
            .insert([
                {
                    id: chatMessage.id,
                    booking_id: chatMessage.booking_id,
                    sender_id: chatMessage.sender_id,
                    content: chatMessage.content,
                }
            ])
            .then(({ error }) => {
                if (error) {
                    logger.error(`Failed to async persist chat message: ${error.message}`);
                }
            });
    });
}
