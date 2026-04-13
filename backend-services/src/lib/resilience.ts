/**
 * 🛡️ Platform Resilience Utility
 * 
 * Provides standardized backoff calculations and a global shutdown 
 * signal to ensure background hydration loops stop when requested.
 */

let isShuttingDown = false;

/**
 * Marks the process as shutting down.
 */
export const setShuttingDown = () => {
    isShuttingDown = true;
};

/**
 * Returns true if the server is currently closing.
 */
export const getShuttingDown = () => isShuttingDown;

/**
 * Standardized Exponential Backoff
 * @param retryCount Number of attempts so far
 * @param baseMs Initial delay (default 1s)
 * @param maxMs Maximum delay cap (default 30s)
 */
export const getBackoffMs = (retryCount: number, baseMs = 1000, maxMs = 30000): number => {
    return Math.min(Math.pow(2, retryCount) * baseMs, maxMs);
};
