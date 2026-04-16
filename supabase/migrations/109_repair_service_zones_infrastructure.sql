-- Migration: 109_repair_service_zones_infrastructure.sql
-- Fixes: relation "public.service_zones" does not exist

-- 1. Ensure PostGIS is active (required for spatial types)
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Create the Service Zones Table if it's missing
CREATE TABLE IF NOT EXISTS public.service_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    boundary geometry(Polygon, 4326) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. spatial index for boundary checks
CREATE INDEX IF NOT EXISTS idx_service_zones_boundary ON public.service_zones USING GIST (boundary);

-- 4. Enable Row Level Security
ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;

-- 5. Standard Policies
DROP POLICY IF EXISTS "Public can view active zones" ON public.service_zones;
CREATE POLICY "Public can view active zones"
    ON public.service_zones FOR SELECT
    USING (status = 'active');

DROP POLICY IF EXISTS "Admins manage all zones" ON public.service_zones;
CREATE POLICY "Admins manage all zones"
    ON public.service_zones FOR ALL
    USING (public.is_admin());

-- 6. Reload Schema cache so PostgREST sees the table
NOTIFY pgrst, 'reload schema';

-- 7. Diagnostic Check
SELECT 'Repair: service_zones table initialized ✅' AS result;
