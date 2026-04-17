import { io, Socket } from 'socket.io-client';
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

class SocketService {
    private socket: Socket | null = null;
    private connectingPromise: Promise<Socket> | null = null;

    async getSocket(): Promise<Socket> {
        // If already connected, return the socket
        if (this.socket?.connected) {
            return this.socket;
        }

        // If currently connecting, wait for that promise to resolve
        if (this.connectingPromise) {
            return this.connectingPromise;
        }

        // Start a new connection attempt
        this.connectingPromise = (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;

                if (this.socket) {
                    this.socket.disconnect();
                }

                this.socket = io(API_URL, {
                    auth: { token },
                    transports: ['polling', 'websocket'],
                    autoConnect: true,
                    secure: API_URL.startsWith('https'),
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                });

                return new Promise<Socket>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        this.connectingPromise = null;
                        reject(new Error('Socket connection timeout'));
                    }, 10000);

                    this.socket?.once('connect', () => {
                        clearTimeout(timeout);
                        this.connectingPromise = null;
                        console.log('🔗 Connected to Socket.io Server');
                        resolve(this.socket!);
                    });

                    this.socket?.once('connect_error', (err) => {
                        clearTimeout(timeout);
                        this.connectingPromise = null;
                        console.error('❌ Socket connection error:', err.message);
                        reject(err);
                    });
                });
            } catch (err: any) {
                this.connectingPromise = null;
                throw err;
            }
        })();

        return this.connectingPromise;
    }

    disconnect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        this.connectingPromise = null;
    }
}

export const socketService = new SocketService();
