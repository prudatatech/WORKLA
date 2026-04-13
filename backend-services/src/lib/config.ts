import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface Config {
    PORT: number;
    NODE_ENV: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    JWT_SECRET: string;
    REDIS_URL: string;
    ELASTIC_URL: string;
    SENTRY_DSN?: string;
    CORS_ORIGINS: string[];
    BODY_LIMIT: number;
    DB_QUERY_TIMEOUT_MS: number;
    ELASTIC_TIMEOUT_MS: number;
    REDIS_TIMEOUT_MS: number;
    SERVER_TIMEOUT_MS: number;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    RAZORPAY_WEBHOOK_SECRET?: string;
}

const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET'
];

const aliases: Record<string, string[]> = {
    'JWT_SECRET': ['SUPABASE_JWT_SECRET', 'JWT_TOKEN']
};

export function validateConfig(): Config {
    const isTest = process.env.NODE_ENV === 'test';
    const missing = requiredEnvVars.filter(v => {
        if (process.env[v]) return false;
        // Check aliases
        const alt = aliases[v];
        if (alt && alt.some(a => process.env[a])) return false;
        return true;
    });
    
    if (missing.length > 0 && !isTest) {
        console.error('\x1b[31m%s\x1b[0m', '🚨 [Config] CRITICAL: Missing required environment variables:');
        missing.forEach(m => {
            console.error('\x1b[33m%s\x1b[0m', `   - ${m} (Please set this in your deployment platform)`);
            if (aliases[m]) {
                console.error(`     Accepted aliases: ${aliases[m].join(', ')}`);
            }
        });
        console.error('\x1b[36m%s\x1b[0m', '💡 Tip: In Railway, ensure these variables are set in the Service Settings, not just Project Settings.');
        process.exit(1);
    }

    if (missing.length > 0 && isTest) {
        console.warn('⚠️ [Config] Missing required environment variables in test mode. Using fallbacks.');
    }

    return {
        PORT: parseInt(process.env.PORT || '8000', 10),
        NODE_ENV: process.env.NODE_ENV || 'development',
        SUPABASE_URL: (process.env.SUPABASE_URL || (isTest ? 'http://localhost:54321' : '')).trim().replace(/\/$/, ''),
        SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || (isTest ? 'test-key' : '')).trim(),
        JWT_SECRET: (process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || process.env.JWT_TOKEN || (isTest ? 'test-secret' : '')).trim(),
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
        ELASTIC_URL: process.env.ELASTIC_URL || 'http://localhost:9200',
        SENTRY_DSN: process.env.SENTRY_DSN,
        CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
        BODY_LIMIT: parseInt(process.env.BODY_LIMIT || '10485760', 10), // 10MB limit
        DB_QUERY_TIMEOUT_MS: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '15000', 10),
        ELASTIC_TIMEOUT_MS: parseInt(process.env.ELASTIC_TIMEOUT_MS || '5000', 10),
        REDIS_TIMEOUT_MS: parseInt(process.env.REDIS_TIMEOUT_MS || '5000', 10),
        SERVER_TIMEOUT_MS: parseInt(process.env.SERVER_TIMEOUT_MS || '30000', 10),
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET
    };
}

export const config = validateConfig();
