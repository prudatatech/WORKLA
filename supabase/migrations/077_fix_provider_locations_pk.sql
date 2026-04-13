-- ==============================================================
-- FIX PROVIDER LOCATIONS UPSERT
-- Resolves "no unique constraint matching the ON CONFLICT" error
-- ==============================================================

-- 1. Remove duplicate locations for the same provider, keeping only the most recently recorded one
DELETE FROM public.provider_locations
WHERE ctid NOT IN (
    SELECT (array_agg(ctid ORDER BY recorded_at DESC))[1]
    FROM public.provider_locations
    GROUP BY provider_id
);

-- 2. Enforce provider_id as UNIQUE so that ON CONFLICT (provider_id) works in the backend
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'provider_locations_provider_id_key' 
           OR conname = 'provider_locations_pkey'
    ) THEN
        ALTER TABLE public.provider_locations ADD CONSTRAINT provider_locations_provider_id_key UNIQUE (provider_id);
    END IF;
END $$;

SELECT 'Provider locations constraint fixed successfully ✅' AS result;
