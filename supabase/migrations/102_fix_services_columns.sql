-- ================================================================
-- WORKLA Migration 102: Master Schema Fix (v4 - Full Catalog Repair)
-- Fixes baseline issues, missing columns, and catalog inconsistencies.
-- Safe to run multiple times — all operations use IF NOT EXISTS.
-- ================================================================

-- ── 1. Helper Functions ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
        false
    );
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Services Table — Repair & Missing Columns ────────────────
-- DROP legacy category_id if it exists to flatten the catalog
ALTER TABLE public.services DROP COLUMN IF EXISTS category_id;

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS priority_number INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_smart_pick BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_services_priority
    ON public.services (priority_number DESC, name ASC);

-- ── 3. Profiles — Admin Management ─────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

-- ── 4. Safety Alerts — Create if Missing ───────────────────────
CREATE TABLE IF NOT EXISTS public.safety_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id      UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    alert_type      VARCHAR(50) NOT NULL DEFAULT 'sos'
                    CHECK (alert_type IN ('sos', 'harassment', 'safety_concern', 'other')),
    description     TEXT,
    status          VARCHAR(30) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'active', 'acknowledged', 'resolved', 'dismissed', 'closed')),
    location_lat    DOUBLE PRECISION,
    location_lng    DOUBLE PRECISION,
    resolved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patch constraint if exists but old
ALTER TABLE public.safety_alerts DROP CONSTRAINT IF EXISTS safety_alerts_status_check;
ALTER TABLE public.safety_alerts ADD CONSTRAINT safety_alerts_status_check
    CHECK (status IN ('open', 'active', 'acknowledged', 'resolved', 'dismissed', 'closed'));
ALTER TABLE public.safety_alerts ALTER COLUMN status SET DEFAULT 'open';

-- ── 5. Worker Earnings — Create if Missing ─────────────────────
CREATE TABLE IF NOT EXISTS public.worker_earnings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID UNIQUE NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
    provider_id     UUID NOT NULL REFERENCES public.provider_details(provider_id) ON DELETE RESTRICT,
    gross_amount    DECIMAL(10,2) NOT NULL,
    platform_fee    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_deduction   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    net_amount      DECIMAL(10,2) NOT NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'paid', 'on_hold')),
    payout_method   VARCHAR(30),
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.worker_earnings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT NULL;

-- ── 6. Home Banners — To match Backend ──────────────────────────
-- The backend uses 'home_banners' and specific column names
CREATE TABLE IF NOT EXISTS public.home_banners (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255),
    description     TEXT,
    image_url       TEXT NOT NULL,
    action_type     VARCHAR(50) DEFAULT 'none'
                    CHECK (action_type IN ('none', 'service', 'category', 'url')),
    action_value    TEXT,
    priority_number INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Service Subcategories — Missing Columns ──────────────────
ALTER TABLE public.service_subcategories
    ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_daily BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_weekly BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_monthly BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_smart_pick BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS long_description TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS benefits JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS exclusions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS gallery_urls JSONB DEFAULT '[]'::jsonb;

-- ── 8. Customer Addresses — Fixes ──────────────────────────────
ALTER TABLE public.customer_addresses
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS full_address TEXT,
    ADD COLUMN IF NOT EXISTS landmark TEXT;

DO $$ BEGIN
    BEGIN ALTER TABLE public.customer_addresses ALTER COLUMN address_line DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- ── 9. Permissions & Cache ─────────────────────────────────────
ALTER TABLE public.safety_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.home_banners TO authenticated, service_role;
GRANT ALL ON public.safety_alerts TO authenticated, service_role;
GRANT ALL ON public.worker_earnings TO authenticated, service_role;

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';

SELECT 'Database Fully Healed ✅' as result;
