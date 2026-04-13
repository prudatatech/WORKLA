import * as dotenv from 'dotenv';
import { FastifyReply, FastifyRequest } from 'fastify';
import { supabaseAdmin, getCircuitState } from '../lib/supabase';
dotenv.config();

// ──────────────────────────────────────────────
// 🗄️ In-Memory Auth Cache
// ──────────────────────────────────────────────
// Caches verified user data (including role) for 60s to avoid
// hitting Supabase auth + profiles on every single request.
// Max 500 entries to prevent unbounded memory growth.

interface CachedAuth {
    user: any;
    role: string;
    expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();
const inFlightAuth = new Map<string, Promise<{ user: any, role: string }>>();
const AUTH_CACHE_TTL_MS = 60_000;  // 60 seconds
const AUTH_CACHE_MAX_SIZE = 500;

function getCachedAuth(token: string): CachedAuth | null {
    const entry = authCache.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        authCache.delete(token);
        return null;
    }
    return entry;
}

function setCachedAuth(token: string, user: any, role: string) {
    // Evict oldest entries if at capacity
    if (authCache.size >= AUTH_CACHE_MAX_SIZE) {
        const firstKey = authCache.keys().next().value;
        if (firstKey) authCache.delete(firstKey);
    }
    authCache.set(token, {
        user,
        role,
        expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });
}

/**
 * 🛡️ requireAuth — Production-grade JWT middleware
 * 
 * Uses Supabase's built-in token verification (handles ES256/RS256/HS256).
 * Always maps user.id → user.sub for consistency across all routes.
 * 
 * ⚡ Optimizations:
 *   - In-memory cache (60s TTL) to skip repeated Supabase calls
 *   - Circuit breaker check: returns 503 instantly when Supabase is down
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return reply.code(401).send({ error: 'Unauthorized: Missing or malformed token' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return reply.code(401).send({ error: 'Unauthorized: Empty token' });
        }

        // ── Fast path: Check cache first ──
        const cached = getCachedAuth(token);
        if (cached) {
            request.user = {
                ...cached.user,
                sub: cached.user.id,
                role: cached.role,
            };
            return; // Cache hit — skip Supabase entirely
        }

        // ── Deduplicate concurrent auth requests ──
        if (inFlightAuth.has(token)) {
            try {
                const result = await inFlightAuth.get(token)!;
                request.user = {
                    ...result.user,
                    sub: result.user.id,
                    role: result.role,
                };
                return;
            } catch (error: any) {
                // Let the catch block handle the error
                throw error;
            }
        }

        const authPromise = (async () => {
            // ── Circuit breaker check ──
            const circuitState = getCircuitState();
            if (circuitState === 'OPEN') {
                throw new Error('DATABASE_CIRCUIT_OPEN');
            }

            // Verify with Supabase (handles token format automatically)
            request.log.info({ token: token.substring(0, 10) + '...' }, '🔐 Verifying JWT Token...');
            const authResult = await supabaseAdmin.auth.getUser(token);

            if (authResult.error || !authResult.data?.user) {
                const msg = authResult.error?.message || 'Unknown auth error';
                request.log.error({ authError: msg }, '❌ JWT Verification Failed');
                const isExpired = msg.toLowerCase().includes('expired');
                throw new Error(isExpired ? 'AUTH_EXPIRED' : 'AUTH_INVALID');
            }
            request.log.info({ userId: authResult.data.user.id }, '✅ JWT Verified. Checking Admin profile...');

            // Fetch role from profiles table for authorization
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', authResult.data.user.id)
                .single();

            const role = profile?.role || 'CUSTOMER';

            // Cache the result so we don't hit Supabase again for 60s
            setCachedAuth(token, authResult.data.user, role);
            return { user: authResult.data.user, role };
        })();

        inFlightAuth.set(token, authPromise);

        try {
            const result = await authPromise;
            request.user = {
                ...result.user,
                sub: result.user.id,
                role: result.role,
            };
        } finally {
            inFlightAuth.delete(token);
        }
    } catch (error: any) {
        const isTimeout = error.message === 'Auth timeout' || error.message === 'DATABASE_TIMEOUT';
        const isCircuitOpen = error.message === 'DATABASE_CIRCUIT_OPEN';
        const isExpired = error.message === 'AUTH_EXPIRED';
        const isInvalid = error.message === 'AUTH_INVALID';
        
        if (isCircuitOpen) {
            return reply.code(503).send({
                error: 'Service temporarily unavailable',
                hint: 'Database is recovering. Please retry in a few seconds.',
            });
        }

        if (isExpired || isInvalid) {
            return reply.code(401).send({
                error: isExpired ? 'Unauthorized: Token expired' : 'Unauthorized: Invalid token',
                hint: isExpired ? 'Please refresh your session and try again' : undefined,
            });
        }

        request.log.error({ err: error.message }, 'Auth middleware error');
        return reply.code(isTimeout ? 503 : 401).send({
            error: isTimeout ? 'Auth service timeout' : 'Unauthorized: Invalid token',
        });
    }
}
