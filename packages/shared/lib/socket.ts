/**
 * Workla Shared Socket Service
 * 
 * Unified WebSocket client used by both Customer and Provider apps.
 * Handles connection lifecycle and auth token injection.
 * 
 * Usage:
 *   import { createSocketService } from '@workla/shared';
 *   const socketService = createSocketService(supabase);
 *   const socket = await socketService.getSocket();
 */

import { io, Socket } from 'socket.io-client';
import type { SupabaseClient } from '@supabase/supabase-js';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

export class SocketService {
    private socket: Socket | null = null;
    private supabase: SupabaseClient;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
    }

    async getSocket(): Promise<Socket> {
        if (this.socket?.connected) {
            return this.socket;
        }

        const { data: { session } } = await this.supabase.auth.getSession();
        const token = session?.access_token;

        this.socket = io(API_URL, {
            auth: { token },
            transports: ['websocket'],
            autoConnect: true,
        });

        this.socket.on('connect', () => {
            console.log('🔗 Connected to Socket.io Server');
        });

        this.socket.on('connect_error', (err: Error) => {
            console.error('❌ Socket connection error:', err.message);
        });

        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

/**
 * Creates a socket service bound to a specific Supabase instance.
 */
export function createSocketService(supabase: SupabaseClient) {
    return new SocketService(supabase);
}
