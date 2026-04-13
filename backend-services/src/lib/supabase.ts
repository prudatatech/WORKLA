import { createClient } from '@supabase/supabase-js';
import { config } from './config';

const supabaseUrl = config.SUPABASE_URL;
const supabaseServiceKey = config.SUPABASE_SERVICE_ROLE_KEY;

console.warn(`[DEBUG] Supabase connecting to: ${supabaseUrl}`);

// ──────────────────────────────────────────────
// 🛡️ Circuit Breaker — Fail Fast Under Pressure
// ──────────────────────────────────────────────
// States: CLOSED (normal) → OPEN (fail fast) → HALF_OPEN (probe)
// When Supabase is down, stop wasting 8s per request waiting for timeouts.

let circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
let consecutiveFailures = 0;
let lastFailureTime = 0;

const CIRCUIT_FAILURE_THRESHOLD = 5;   // Open circuit after 5 consecutive failures
const CIRCUIT_COOLDOWN_MS = 30_000;    // Stay open for 30s before probing

export function getCircuitState() {
    if (circuitState === 'OPEN') {
        // Check if cooldown has elapsed → transition to HALF_OPEN
        if (Date.now() - lastFailureTime > CIRCUIT_COOLDOWN_MS) {
            circuitState = 'HALF_OPEN';
            console.warn('[CircuitBreaker 🟡] Cooldown elapsed. Allowing probe request...');
        }
    }
    return circuitState;
}

function recordSuccess() {
    if (circuitState !== 'CLOSED') {
        console.warn('[CircuitBreaker 🟢] Probe succeeded. Circuit CLOSED.');
    }
    circuitState = 'CLOSED';
    consecutiveFailures = 0;
}

function recordFailure() {
    consecutiveFailures++;
    lastFailureTime = Date.now();
    if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && circuitState === 'CLOSED') {
        circuitState = 'OPEN';
        console.warn(`[CircuitBreaker 🔴] ${consecutiveFailures} consecutive failures. Circuit OPEN for ${CIRCUIT_COOLDOWN_MS / 1000}s.`);
    } else if (circuitState === 'HALF_OPEN') {
        circuitState = 'OPEN';
        console.warn('[CircuitBreaker 🔴] Probe failed. Circuit re-OPENED.');
    }
}

// Custom fetch with configurable timeout + circuit breaker
const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const isAuthRequest = urlStr.includes('/auth/v1/');

    // Auth requests BYPASS the circuit breaker — Supabase Auth is a separate
    // service from Postgres and is almost always healthy even during DB overload.
    if (!isAuthRequest) {
        const state = getCircuitState();
        if (state === 'OPEN') {
            throw new Error('DATABASE_CIRCUIT_OPEN');
        }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.DB_QUERY_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        recordSuccess();
        return response;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            recordFailure();
            console.error(`🚨 [Supabase] Query timed out after ${config.DB_QUERY_TIMEOUT_MS}ms: ${url}`);
            throw new Error('DATABASE_TIMEOUT');
        }
        
        // Simple retry for transient network errors (not timeouts)
        if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT') || err.message.includes('fetch failed')) {
            console.warn(`⚠️ [Supabase] Transient fetch error, retrying once... (${err.message})`);
            try {
                const response = await fetch(url, options);
                recordSuccess();
                return response;
            } catch (retryErr) {
                recordFailure();
                throw retryErr;
            }
        }
        
        recordFailure();
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
};

// 🛡️ Admin Client: Bypasses RLS for backend operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
    global: {
        fetch: customFetch
    }
});
