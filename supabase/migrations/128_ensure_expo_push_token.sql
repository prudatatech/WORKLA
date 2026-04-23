-- Migration: 128_ensure_expo_push_token.sql
-- Purpose: Ensures the expo_push_token column exists on profiles and reloads the schema cache.

-- 1. Add the column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'expo_push_token') THEN
        ALTER TABLE public.profiles ADD COLUMN expo_push_token TEXT;
    END IF;
END $$;

-- 2. Ensure indices for performance
CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token ON public.profiles(expo_push_token);

-- 3. FORCE RELOAD PostgREST Schema Cache
-- This is critical so the frontend can immediately see the new column.
NOTIFY pgrst, 'reload schema';

-- 4. Verification output
SELECT 'Migration 128 applied: expo_push_token ensured and schema reloaded ✅' as result;
