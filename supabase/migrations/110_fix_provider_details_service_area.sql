-- Migration: 110_fix_provider_details_service_area.sql
-- Fixes: column pd.service_area does not exist

-- 1. Ensure PostGIS is active
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Add service_area column to provider_details if missing
-- This column is a geometry type representing a custom service polygon.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'provider_details' 
        AND column_name = 'service_area'
    ) THEN
        ALTER TABLE public.provider_details ADD COLUMN service_area geometry(Polygon, 4326);
    END IF;
END $$;

-- 3. Add spatial index for performance during point-in-polygon checks
CREATE INDEX IF NOT EXISTS idx_provider_details_service_area ON public.provider_details USING GIST (service_area);

-- 4. Reload Schema cache for PostgREST
NOTIFY pgrst, 'reload schema';

-- 5. Diagnostic Check
SELECT 'Repair: provider_details.service_area column added ✅' AS result;
