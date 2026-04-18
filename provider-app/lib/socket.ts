import { io, Socket } from 'socket.io-client';
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

class SocketService {
    private socket: Socket | null = null;

    async getSocket(): Promise<Socket> {
        if (this.socket?.connected) {
            return this.socket;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        this.socket = io(API_URL, {
            auth: { token },
            transports: ['polling', 'websocket'],
            autoConnect: true,
            secure: API_URL.startsWith('https')
        });

        this.socket.on('connect', () => {
            console.log('🔗 Connected to Socket.io Server');
        });

        this.socket.on('connect_error', (err) => {
            console.error('❌ Socket connection error:', err.message);
        });

        this.socket.on('session:replaced', (data) => {
            console.warn('⚠️ Session replaced:', data.reason);
            this.disconnect();
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

export const socketService = new SocketService();
