import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from './supabase';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const API_URL = rawApiUrl.trim().replace(/\/$/, '');

/**
 * 🛡️ Background-Aware Socket Service
 * 
 * Automatically disconnects socket when app goes to background 
 * and reconnects when app returns to foreground.
 * This prevents Android from OOM-killing the app due to active 
 * network connections in background.
 */
class SocketService {
    private socket: Socket | null = null;
    private _appState: AppStateStatus = AppState.currentState;
    private _listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

    constructor() {
        // Listen for app state changes to manage socket lifecycle
        AppState.addEventListener('change', this._handleAppStateChange);
    }

    private _handleAppStateChange = (nextState: AppStateStatus) => {
        const prevState = this._appState;
        this._appState = nextState;

        if (prevState.match(/active/) && nextState.match(/inactive|background/)) {
            // App going to background → disconnect to save resources
            console.log('[Socket] App backgrounded — pausing socket');
            this._pauseSocket();
        } else if (prevState.match(/inactive|background/) && nextState === 'active') {
            // App returning to foreground → reconnect
            console.log('[Socket] App foregrounded — resuming socket');
            this._resumeSocket();
        }
    };

    private _pauseSocket() {
        if (this.socket?.connected) {
            this.socket.disconnect();
        }
    }

    private async _resumeSocket() {
        if (!this.socket) return; // No socket was ever created, nothing to resume
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return; // Not logged in

            // Update auth token in case it refreshed
            this.socket.auth = { token: session.access_token };
            this.socket.connect();
        } catch (err) {
            console.warn('[Socket] Resume failed:', err);
        }
    }

    async getSocket(): Promise<Socket> {
        if (this.socket?.connected) {
            return this.socket;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        // If socket exists but disconnected, just reconnect
        if (this.socket) {
            this.socket.auth = { token };
            this.socket.connect();
            return this.socket;
        }

        this.socket = io(API_URL, {
            auth: { token },
            transports: ['polling', 'websocket'],
            autoConnect: true,
            secure: API_URL.startsWith('https'),
            // Prevent aggressive reconnection in background
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
        });

        this.socket.on('connect', () => {
            console.log('🔗 Connected to Socket.io Server');
        });

        this.socket.on('connect_error', (err) => {
            // Don't flood logs while backgrounded
            if (this._appState === 'active') {
                console.error('❌ Socket connection error:', err.message);
            }
        });

        this.socket.on('session:replaced', (data) => {
            console.warn('⚠️ Session replaced:', data.reason);
            this.disconnect();
        });

        // Re-attach any previously registered event listeners
        for (const { event, handler } of this._listeners) {
            this.socket.on(event, handler);
        }

        return this.socket;
    }

    /**
     * Register a persistent event listener that survives reconnects.
     * Use this instead of socket.on() directly.
     */
    addListener(event: string, handler: (...args: any[]) => void) {
        this._listeners.push({ event, handler });
        if (this.socket) {
            this.socket.on(event, handler);
        }
    }

    /**
     * Remove a previously registered persistent listener.
     */
    removeListener(event: string, handler: (...args: any[]) => void) {
        this._listeners = this._listeners.filter(
            l => !(l.event === event && l.handler === handler)
        );
        if (this.socket) {
            this.socket.off(event, handler);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this._listeners = [];
    }
}

export const socketService = new SocketService();
