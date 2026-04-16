-- Migration: 107_fix_job_offers_schema.sql
-- Fixes: missing column errors in Marketplace (distance_km, expires_at, etc.)

DO $$ 
BEGIN
    -- 1. Add distance_km
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_offers' AND column_name = 'distance_km') THEN
        ALTER TABLE public.job_offers ADD COLUMN distance_km DOUBLE PRECISION;
    END IF;

    -- 2. Add expires_at (crucial for filtering active jobs)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_offers' AND column_name = 'expires_at') THEN
        ALTER TABLE public.job_offers ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes');
    END IF;

    -- 3. Add offered_at 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_offers' AND column_name = 'offered_at') THEN
        ALTER TABLE public.job_offers ADD COLUMN offered_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- 4. Add responded_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_offers' AND column_name = 'responded_at') THEN
        ALTER TABLE public.job_offers ADD COLUMN responded_at TIMESTAMPTZ;
    END IF;
END $$;

-- Reload schema cache so PostgREST sees the new columns
NOTIFY pgrst, 'reload schema';
