-- ==============================================================
-- Phase 6: Database Consolidation & Cleanup Migration
-- PURPOSE: Remove dead tables, fix broken RPCs, standardize schemas.
-- SAFETY: All operations are idempotent (IF EXISTS / IF NOT EXISTS).
--         No live data is deleted. Only structural tech-debt is removed.
-- ==============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. DROP DEAD / ORPHAN TABLES
--    These tables are no longer referenced by any application code.
-- ─────────────────────────────────────────────────────────────────

-- Legacy `service_providers` table (pre-v3, replaced by provider_details)
DROP TABLE IF EXISTS public.service_providers CASCADE;

-- Legacy `user_profiles` table (pre-v3, replaced by profiles)
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Legacy `user_devices` table (pre-v3, never used in current code)
DROP TABLE IF EXISTS public.user_devices CASCADE;

-- Legacy `customers` table (pre-v3, replaced by profiles + role)
DROP TABLE IF EXISTS public.customers CASCADE;

-- Legacy `users` table (pre-v3, replaced by auth.users + profiles)
DROP TABLE IF EXISTS public.users CASCADE;

-- Legacy `booking_items` table (pre-v3, not used)
DROP TABLE IF EXISTS public.booking_items CASCADE;

-- `booking_photos` table (created in 067 but never queried by app code)
-- NOTE: Keeping this table as it has a valid structure for future use.
-- If you want to remove it, uncomment the line below:
-- DROP TABLE IF EXISTS public.booking_photos CASCADE;


-- ─────────────────────────────────────────────────────────────────
-- 2. DROP BROKEN / DEAD RPC FUNCTIONS
--    These functions reference tables that no longer exist.
-- ─────────────────────────────────────────────────────────────────

-- `dispatch_job()` references the dead `service_providers` table
DROP FUNCTION IF EXISTS public.dispatch_job(UUID);

-- Diagnostic functions that were accidentally placed in migration chain
DROP FUNCTION IF EXISTS public.inspect_schema();
DROP FUNCTION IF EXISTS public.diagnose_marketplace();
DROP FUNCTION IF EXISTS public.find_beast_mode();


-- ─────────────────────────────────────────────────────────────────
-- 3. CREATE `safety_alerts` TABLE
--    Referenced by admin dashboard and customer tracking screen 
--    but was never formally created as a table.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.safety_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id      UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    alert_type      VARCHAR(50) NOT NULL DEFAULT 'sos'
                    CHECK (alert_type IN ('sos', 'harassment', 'safety_concern', 'other')),
    description     TEXT,
    status          VARCHAR(30) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
    location_lat    DOUBLE PRECISION,
    location_lng    DOUBLE PRECISION,
    resolved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_alerts_status ON public.safety_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_alerts_user ON public.safety_alerts(user_id);

-- RLS for safety_alerts
ALTER TABLE public.safety_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_alerts' AND policyname = 'Users can create SOS alerts') THEN
        CREATE POLICY "Users can create SOS alerts"
            ON public.safety_alerts FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_alerts' AND policyname = 'Users can view own alerts') THEN
        CREATE POLICY "Users can view own alerts"
            ON public.safety_alerts FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_alerts' AND policyname = 'Admins manage all alerts') THEN
        CREATE POLICY "Admins manage all alerts"
            ON public.safety_alerts FOR ALL
            USING (public.is_admin());
    END IF;
END $$;

GRANT ALL ON public.safety_alerts TO authenticated, service_role;

-- Enable realtime on safety_alerts so dashboard gets live SOS
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_alerts;


-- ─────────────────────────────────────────────────────────────────
-- 4. STANDARDIZE `provider_details` — remove dead array columns
--    `supported_services` and `supported_subservices` UUID arrays
--    were added in 040 but the app uses `provider_services` join table.
-- ─────────────────────────────────────────────────────────────────

-- First drop the trigger and function that depend on these columns
DROP TRIGGER IF EXISTS trg_sync_provider_services ON public.provider_details;
DROP FUNCTION IF EXISTS public.sync_provider_services() CASCADE;

ALTER TABLE public.provider_details
    DROP COLUMN IF EXISTS supported_services,
    DROP COLUMN IF EXISTS supported_subservices;


-- ─────────────────────────────────────────────────────────────────
-- 5. ADD MISSING `expo_push_token` COLUMN TO PROFILES
--    Migration 071 added this but let's ensure it's there safely.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS expo_push_token TEXT;


-- ─────────────────────────────────────────────────────────────────
-- 6. ENSURE `banners` TABLE EXISTS
--    Referenced by admin catalog page but may not have been created.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.banners (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255) NOT NULL,
    subtitle        TEXT,
    image_url       TEXT NOT NULL,
    link_type       VARCHAR(50) DEFAULT 'none'
                    CHECK (link_type IN ('none', 'service', 'subcategory', 'url')),
    link_value      TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'banners' AND policyname = 'Public reads active banners') THEN
        CREATE POLICY "Public reads active banners" ON public.banners FOR SELECT USING (is_active = true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'banners' AND policyname = 'Admins manage banners') THEN
        CREATE POLICY "Admins manage banners" ON public.banners FOR ALL USING (public.is_admin());
    END IF;
END $$;

GRANT ALL ON public.banners TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────
-- 7. AUTO-SET `updated_at` TRIGGER FOR NEW TABLES
-- ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_safety_alerts_updated_at ON public.safety_alerts;
CREATE TRIGGER trg_safety_alerts_updated_at 
    BEFORE UPDATE ON public.safety_alerts 
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────────
-- 8. FINAL: Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

SELECT 'Phase 6: Database Consolidation applied successfully ✅' AS result;
