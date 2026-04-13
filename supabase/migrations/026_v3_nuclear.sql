-- ==============================================================
-- WORKLA V3 "NUCLEAR" DATABASE - COMPLETE GROUND-UP SCHEMA
-- Incorporates: All 19 tables, Soft Deletes, Indexes, Availability,
--               Geometry, Price Breakdown, Notification Delivery Status
-- WARNING: Run this ONCE on a clean slate. Drops everything first.
-- ==============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geometry (service area polygons)

-- ==============================================================
-- SECTION 0: DROP ALL EXISTING TABLES (SAFE NUCLEAR RESET)
-- ==============================================================
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.coupon_usages CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.wallet_transactions CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.ratings CASCADE;
DROP TABLE IF EXISTS public.worker_earnings CASCADE;
DROP TABLE IF EXISTS public.refunds CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.booking_status_history CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.provider_availability CASCADE;
DROP TABLE IF EXISTS public.provider_services CASCADE;
DROP TABLE IF EXISTS public.provider_locations CASCADE;
DROP TABLE IF EXISTS public.provider_details CASCADE;
DROP TABLE IF EXISTS public.customer_addresses CASCADE;
DROP TABLE IF EXISTS public.service_subcategories CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;
DROP TABLE IF EXISTS public.service_categories CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop legacy tables too
DROP TABLE IF EXISTS public.booking_photos CASCADE;
DROP TABLE IF EXISTS public.booking_items CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.service_providers CASCADE;
DROP TABLE IF EXISTS public.user_devices CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;


-- ==============================================================
-- SECTION 1: IDENTITY & PROFILES
-- ==============================================================

CREATE TABLE public.profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Admin: flip this toggle in Supabase dashboard. No text typing.
    is_admin        BOOLEAN NOT NULL DEFAULT false,
    -- App routing: 'CUSTOMER' or 'PROVIDER'
    role            VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
                    CHECK (role IN ('CUSTOMER', 'PROVIDER')),
    full_name       VARCHAR(255),
    phone           VARCHAR(20) UNIQUE,
    email           VARCHAR(255) UNIQUE,
    avatar_url      TEXT,
    city            VARCHAR(100),
    pincode         VARCHAR(20),
    gender          VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', NULL)),
    date_of_birth   DATE,
    -- Referral system
    referral_code   VARCHAR(20) UNIQUE,
    referred_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Soft delete: when NOT NULL, this user is deactivated
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE public.customer_addresses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label           VARCHAR(50) NOT NULL DEFAULT 'Home', -- 'Home', 'Work', 'Other'
    address_line    TEXT NOT NULL,
    city            VARCHAR(100),
    pincode         VARCHAR(20),
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==============================================================
-- SECTION 2: SERVICE CATALOG
-- ==============================================================

CREATE TABLE public.service_categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    icon_name       VARCHAR(100), -- lucide icon name, e.g. 'Wrench'
    color_hex       VARCHAR(10),  -- e.g. '#1A3FFF'
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.services (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id     UUID NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.service_subcategories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    base_price      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    duration_mins   INTEGER,         -- estimated job time
    unit            VARCHAR(50),     -- 'per visit', 'per sq ft', etc.
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==============================================================
-- SECTION 3: PROVIDER PROFILE & AVAILABILITY
-- ==============================================================

CREATE TABLE public.provider_details (
    provider_id             UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    business_name           VARCHAR(255),
    bio                     TEXT,
    -- Verification
    verification_status     VARCHAR(30) NOT NULL DEFAULT 'pending'
                            CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected', 'suspended')),
    onboarding_completed    BOOLEAN NOT NULL DEFAULT false,
    aadhar_number           VARCHAR(20),
    pan_number              VARCHAR(20),
    -- Availability
    is_online               BOOLEAN NOT NULL DEFAULT false,
    service_radius_km       DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    -- Service area as a geographic polygon (null = use radius only)
    service_area            geometry(POLYGON, 4326),
    -- Denormalized stats (recalculated on triggers)
    avg_rating              DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    total_jobs              INTEGER NOT NULL DEFAULT 0,
    total_earnings          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    -- Bank / UPI payout details
    bank_account_number     VARCHAR(50),
    bank_ifsc               VARCHAR(20),
    bank_account_name       VARCHAR(255),
    upi_id                  VARCHAR(100),
    -- Soft delete
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Live GPS table (updated every ~5 seconds when online)
CREATE TABLE public.provider_locations (
    provider_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    heading         DOUBLE PRECISION,
    speed           DOUBLE PRECISION,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider weekly availability schedule
CREATE TABLE public.provider_availability (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id     UUID NOT NULL REFERENCES public.provider_details(provider_id) ON DELETE CASCADE,
    -- 0=Sunday, 1=Monday, ..., 6=Saturday
    day_of_week     SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    is_recurring    BOOLEAN NOT NULL DEFAULT true,
    -- For one-off date overrides (e.g. "Available Dec 25 only")
    specific_date   DATE,
    UNIQUE(provider_id, day_of_week, start_time)
);

-- Which specific jobs (leaf catalog nodes) each provider offers
CREATE TABLE public.provider_services (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id     UUID NOT NULL REFERENCES public.provider_details(provider_id) ON DELETE CASCADE,
    subcategory_id  UUID NOT NULL REFERENCES public.service_subcategories(id) ON DELETE CASCADE,
    custom_price    DECIMAL(10,2), -- NULL = use catalog base_price
    is_active       BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(provider_id, subcategory_id)
);


-- ==============================================================
-- SECTION 4: BOOKINGS (CORE TRANSACTION TABLE)
-- ==============================================================

CREATE TABLE public.bookings (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number          VARCHAR(50) UNIQUE NOT NULL, -- 'WRK-A1B2C3'

    -- Parties
    customer_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    provider_id             UUID REFERENCES public.provider_details(provider_id) ON DELETE SET NULL,

    -- Catalog snapshot at time of booking
    category_id             UUID REFERENCES public.service_categories(id) ON DELETE RESTRICT,
    service_id              UUID REFERENCES public.services(id) ON DELETE RESTRICT,
    subcategory_id          UUID REFERENCES public.service_subcategories(id) ON DELETE RESTRICT,
    service_name_snapshot   VARCHAR(255) NOT NULL, -- preserved even if catalog changes later

    -- Status Machine
    status                  VARCHAR(30) NOT NULL DEFAULT 'requested'
                            CHECK (status IN (
                                'requested', 'searching', 'confirmed', 'en_route',
                                'arrived', 'in_progress', 'completed', 'cancelled', 'disputed'
                            )),
    cancellation_reason     TEXT,
    cancelled_by            VARCHAR(20) CHECK (cancelled_by IN ('customer', 'provider', 'system', NULL)),

    -- Schedule
    scheduled_date          DATE NOT NULL,
    scheduled_time_slot     VARCHAR(100),

    -- Location (snapshot, not live GPS)
    address_id              UUID REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
    customer_address        TEXT NOT NULL,
    customer_latitude       DOUBLE PRECISION,
    customer_longitude      DOUBLE PRECISION,

    special_instructions    TEXT,

    -- Full price breakdown stored as JSON for auditability
    -- Example: {"base": 350, "addon": 50, "platform_fee": 30, "tax": 38.4, "coupon_discount": -50, "wallet_used": 100, "total": 418.4}
    price_breakdown         JSONB,

    -- Immutable financial totals (denormalized from price_breakdown for fast queries)
    catalog_price           DECIMAL(10,2) NOT NULL,
    coupon_code             VARCHAR(50),
    coupon_discount         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    platform_fee            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_amount              DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount            DECIMAL(10,2) NOT NULL,

    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at            TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ⚡ Performance Indexes — queried constantly by all dashboards
CREATE INDEX idx_bookings_status_created      ON public.bookings(status, created_at DESC);
CREATE INDEX idx_bookings_provider_status     ON public.bookings(provider_id, status);
CREATE INDEX idx_bookings_customer_status     ON public.bookings(customer_id, status);
CREATE INDEX idx_bookings_scheduled_date      ON public.bookings(scheduled_date DESC);
CREATE INDEX idx_bookings_booking_number      ON public.bookings(booking_number);

-- Full audit trail of every status change
CREATE TABLE public.booking_status_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    old_status  VARCHAR(30),
    new_status  VARCHAR(30) NOT NULL,
    changed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_booking ON public.booking_status_history(booking_id, created_at DESC);


-- ==============================================================
-- SECTION 5: FINANCIALS
-- ==============================================================

-- One payment row per booking
CREATE TABLE public.payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id          UUID UNIQUE NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
    customer_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount              DECIMAL(10,2) NOT NULL,
    currency            VARCHAR(5) NOT NULL DEFAULT 'INR',
    status              VARCHAR(30) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'captured', 'failed', 'refunded', 'partially_refunded')),
    method              VARCHAR(50),  -- 'upi', 'wallet', 'cash', 'card'
    gateway             VARCHAR(50),  -- 'razorpay', 'cashfree', null
    gateway_order_id    VARCHAR(100),
    gateway_payment_id  VARCHAR(100),
    wallet_amount_used  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    captured_at         TIMESTAMPTZ
);

-- Refunds are immutable (never delete)
CREATE TABLE public.refunds (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id  UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
    amount      DECIMAL(10,2) NOT NULL,
    reason      TEXT,
    status      VARCHAR(30) NOT NULL DEFAULT 'initiated'
                CHECK (status IN ('initiated', 'processing', 'completed', 'failed')),
    issued_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    destination VARCHAR(30) CHECK (destination IN ('wallet', 'original', 'bank')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Created automatically when a booking completes
CREATE TABLE public.worker_earnings (
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

CREATE INDEX idx_worker_earnings_provider ON public.worker_earnings(provider_id, created_at DESC);


-- ==============================================================
-- SECTION 6: RATINGS
-- ==============================================================

CREATE TABLE public.ratings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID UNIQUE NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id     UUID NOT NULL REFERENCES public.provider_details(provider_id) ON DELETE CASCADE,
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==============================================================
-- SECTION 7: WALLET
-- ==============================================================

CREATE TABLE public.wallets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    currency        VARCHAR(5) NOT NULL DEFAULT 'INR',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable - append only
CREATE TABLE public.wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id       UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
    type            VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
    amount          DECIMAL(12,2) NOT NULL,
    description     VARCHAR(255) NOT NULL,
    booking_id      UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    refund_id       UUID REFERENCES public.refunds(id) ON DELETE SET NULL,
    gateway_ref     VARCHAR(100),
    balance_after   DECIMAL(12,2) NOT NULL, -- snapshot for audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_txn_wallet ON public.wallet_transactions(wallet_id, created_at DESC);


-- ==============================================================
-- SECTION 8: SUBSCRIPTIONS (WORKLA GOLD)
-- ==============================================================

CREATE TABLE public.subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id         VARCHAR(20) NOT NULL CHECK (plan_id IN ('monthly', 'quarterly', 'yearly')),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'expired', 'cancelled')),
    price_paid      DECIMAL(10,2) NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    gateway         VARCHAR(50),
    gateway_sub_id  VARCHAR(100),
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==============================================================
-- SECTION 9: COUPONS
-- ==============================================================

CREATE TABLE public.coupons (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    discount_type   VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'flat')),
    discount_value  DECIMAL(10,2) NOT NULL,
    max_discount    DECIMAL(10,2),   -- cap for percent type
    min_order       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    usage_limit     INTEGER,         -- NULL = unlimited
    usage_per_user  INTEGER NOT NULL DEFAULT 1,
    valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_till      TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.coupon_usages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id   UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(coupon_id, customer_id, booking_id)
);


-- ==============================================================
-- SECTION 10: NOTIFICATIONS
-- ==============================================================

CREATE TABLE public.notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL,
    type            VARCHAR(50), -- 'booking_update', 'payment', 'promo', 'system'
    data            JSONB,       -- deep-link payload
    is_read         BOOLEAN NOT NULL DEFAULT false,
    -- Delivery status per channel: {"push": "delivered", "email": "skipped", "sms": "failed"}
    delivery_status JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);


-- ==============================================================
-- SECTION 11: SUPPORT & CHAT
-- ==============================================================

CREATE TABLE public.support_tickets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id  UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    subject     VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status      VARCHAR(30) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority    VARCHAR(20) NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolution  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE public.chat_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body        TEXT,
    media_url   TEXT,
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_booking ON public.chat_messages(booking_id, created_at ASC);


-- ==============================================================
-- SECTION 12: TRIGGERS & FUNCTIONS
-- ==============================================================

-- Auto-generate booking number in format WRK-XXXXXX
CREATE OR REPLACE FUNCTION public.generate_booking_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.booking_number := 'WRK-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 6));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_booking_number ON public.bookings;
CREATE TRIGGER trg_generate_booking_number
    BEFORE INSERT ON public.bookings
    FOR EACH ROW
    WHEN (NEW.booking_number IS NULL OR NEW.booking_number = '')
    EXECUTE FUNCTION public.generate_booking_number();


-- Auto-create profile + wallet when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(20);
    v_referral_code VARCHAR(20);
BEGIN
    v_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    IF v_role NOT IN ('CUSTOMER', 'PROVIDER') THEN
        v_role := 'CUSTOMER';
    END IF;

    -- Generate a unique referral code
    v_referral_code := UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8));

    INSERT INTO public.profiles (id, email, phone, full_name, avatar_url, role, referral_code)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        v_role,
        v_referral_code
    );

    -- Create wallet for the new user
    INSERT INTO public.wallets (customer_id) VALUES (NEW.id);

    -- If provider, initialize their details row
    IF v_role = 'PROVIDER' THEN
        INSERT INTO public.provider_details (provider_id, business_name)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'business_name', NEW.raw_user_meta_data->>'full_name', 'Independent Provider')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- Auto-update 'updated_at' timestamp on any table that has it
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_provider_details_updated_at BEFORE UPDATE ON public.provider_details FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- On booking completion: create worker_earnings + update provider stats
CREATE OR REPLACE FUNCTION public.handle_booking_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee DECIMAL(10,2);
    v_net DECIMAL(10,2);
BEGIN
    -- Only fire when status transitions TO 'completed'
    IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
        v_platform_fee := NEW.platform_fee;
        v_net := NEW.total_amount - v_platform_fee;

        INSERT INTO public.worker_earnings
            (booking_id, provider_id, gross_amount, platform_fee, net_amount)
        VALUES
            (NEW.id, NEW.provider_id, NEW.total_amount, v_platform_fee, v_net)
        ON CONFLICT (booking_id) DO NOTHING;

        -- Update provider denormalized stats
        UPDATE public.provider_details
        SET
            total_jobs = total_jobs + 1,
            total_earnings = total_earnings + v_net,
            updated_at = NOW()
        WHERE provider_id = NEW.provider_id;

        -- Set timestamps
        NEW.completed_at := NOW();
    END IF;

    -- Track confirmed_at and started_at too
    IF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
        NEW.confirmed_at := NOW();
    END IF;
    IF OLD.status != 'in_progress' AND NEW.status = 'in_progress' THEN
        NEW.started_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_completed ON public.bookings;
CREATE TRIGGER trg_booking_completed
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.handle_booking_completed();


-- On booking status change: append to history
CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.booking_status_history (booking_id, old_status, new_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_status_history ON public.bookings;
CREATE TRIGGER trg_booking_status_history
    AFTER UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.log_booking_status_change();


-- On rating insert: recalculate provider avg_rating
CREATE OR REPLACE FUNCTION public.recalculate_provider_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.provider_details
    SET avg_rating = (
        SELECT COALESCE(AVG(rating::DOUBLE PRECISION), 0.0)
        FROM public.ratings
        WHERE provider_id = NEW.provider_id
    ),
    updated_at = NOW()
    WHERE provider_id = NEW.provider_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rating_update ON public.ratings;
CREATE TRIGGER trg_rating_update
    AFTER INSERT OR UPDATE ON public.ratings
    FOR EACH ROW EXECUTE FUNCTION public.recalculate_provider_rating();


-- ==============================================================
-- SECTION 13: BULLETPROOF RLS (ROW LEVEL SECURITY)
-- ==============================================================

-- Helper: is the current user an admin?
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

-- ── PROFILES ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
CREATE POLICY "Users read own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id AND deleted_at IS NULL);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id AND deleted_at IS NULL);
CREATE POLICY "Admins manage profiles"   ON public.profiles FOR ALL USING (public.is_admin());

-- ── CUSTOMER ADDRESSES ──
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.customer_addresses TO authenticated, service_role;
CREATE POLICY "Users manage own addresses" ON public.customer_addresses FOR ALL USING (auth.uid() = customer_id);

-- ── SERVICE CATALOG (public read, admin write) ──
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.service_categories TO anon, authenticated, service_role;
CREATE POLICY "Public reads categories"  ON public.service_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.service_categories FOR ALL USING (public.is_admin());

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.services TO anon, authenticated, service_role;
CREATE POLICY "Public reads services"    ON public.services FOR SELECT USING (true);
CREATE POLICY "Admins manage services"   ON public.services FOR ALL USING (public.is_admin());

ALTER TABLE public.service_subcategories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.service_subcategories TO anon, authenticated, service_role;
CREATE POLICY "Public reads subcategories"  ON public.service_subcategories FOR SELECT USING (true);
CREATE POLICY "Admins manage subcategories" ON public.service_subcategories FOR ALL USING (public.is_admin());

-- ── PROVIDER DETAILS ──
ALTER TABLE public.provider_details ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provider_details TO anon, authenticated, service_role;
CREATE POLICY "Public views provider details"   ON public.provider_details FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Providers update own details"    ON public.provider_details FOR UPDATE USING (auth.uid() = provider_id);
CREATE POLICY "Admins manage provider details"  ON public.provider_details FOR ALL USING (public.is_admin());

-- ── PROVIDER LOCATIONS ──
ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provider_locations TO anon, authenticated, service_role;
CREATE POLICY "Public reads live locations"   ON public.provider_locations FOR SELECT USING (true);
CREATE POLICY "Providers manage own location" ON public.provider_locations FOR ALL
    USING (auth.uid() = provider_id) WITH CHECK (auth.uid() = provider_id);

-- ── PROVIDER AVAILABILITY ──
ALTER TABLE public.provider_availability ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provider_availability TO anon, authenticated, service_role;
CREATE POLICY "Public reads availability"    ON public.provider_availability FOR SELECT USING (true);
CREATE POLICY "Providers manage availability" ON public.provider_availability FOR ALL USING (auth.uid() = provider_id);

-- ── PROVIDER SERVICES (skills) ──
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provider_services TO anon, authenticated, service_role;
CREATE POLICY "Public reads provider services"   ON public.provider_services FOR SELECT USING (true);
CREATE POLICY "Providers manage own services"    ON public.provider_services FOR ALL USING (auth.uid() = provider_id);

-- ── BOOKINGS ──
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bookings TO authenticated, service_role;
CREATE POLICY "Customers read own bookings"   ON public.bookings FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Customers create own bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Providers read own jobs"       ON public.bookings FOR SELECT USING (auth.uid() = provider_id);
CREATE POLICY "Providers update own jobs"     ON public.bookings FOR UPDATE USING (auth.uid() = provider_id);
CREATE POLICY "Admins manage all bookings"    ON public.bookings FOR ALL USING (public.is_admin());

-- ── BOOKING STATUS HISTORY ──
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.booking_status_history TO authenticated, service_role;
CREATE POLICY "Booking parties read history" ON public.booking_status_history FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())
    )
);
CREATE POLICY "Admins read all history" ON public.booking_status_history FOR SELECT USING (public.is_admin());

-- ── PAYMENTS ──
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.payments TO authenticated, service_role;
CREATE POLICY "Customers read own payments"  ON public.payments FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Admins manage payments"       ON public.payments FOR ALL USING (public.is_admin());

-- ── REFUNDS ──
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.refunds TO authenticated, service_role;
CREATE POLICY "Customers read own refunds" ON public.refunds FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.payments p WHERE p.id = payment_id AND p.customer_id = auth.uid())
);
CREATE POLICY "Admins manage refunds" ON public.refunds FOR ALL USING (public.is_admin());

-- ── WORKER EARNINGS ──
ALTER TABLE public.worker_earnings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.worker_earnings TO authenticated, service_role;
CREATE POLICY "Providers read own earnings" ON public.worker_earnings FOR SELECT USING (auth.uid() = provider_id);
CREATE POLICY "Admins manage earnings"      ON public.worker_earnings FOR ALL USING (public.is_admin());

-- ── RATINGS ──
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ratings TO authenticated, service_role;
CREATE POLICY "Public reads ratings"        ON public.ratings FOR SELECT USING (true);
CREATE POLICY "Customers create ratings"    ON public.ratings FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Admins manage ratings"       ON public.ratings FOR ALL USING (public.is_admin());

-- ── WALLETS ──
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallets TO authenticated, service_role;
CREATE POLICY "Users read own wallet" ON public.wallets FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Admins manage wallets" ON public.wallets FOR ALL USING (public.is_admin());

-- ── WALLET TRANSACTIONS ──
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallet_transactions TO authenticated, service_role;
CREATE POLICY "Users read own transactions" ON public.wallet_transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = wallet_id AND w.customer_id = auth.uid())
);
CREATE POLICY "Admins manage transactions" ON public.wallet_transactions FOR ALL USING (public.is_admin());

-- ── SUBSCRIPTIONS ──
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.subscriptions TO authenticated, service_role;
CREATE POLICY "Users read own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin());

-- ── COUPONS ──
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.coupons TO anon, authenticated, service_role;
CREATE POLICY "Public reads active coupons" ON public.coupons FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage coupons"       ON public.coupons FOR ALL USING (public.is_admin());

ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.coupon_usages TO authenticated, service_role;
CREATE POLICY "Users read own coupon usage" ON public.coupon_usages FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Admins manage coupon usages" ON public.coupon_usages FOR ALL USING (public.is_admin());

-- ── NOTIFICATIONS ──
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notifications TO authenticated, service_role;
CREATE POLICY "Users read own notifications"   ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users mark own notifications"   ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage notifications"    ON public.notifications FOR ALL USING (public.is_admin());

-- ── SUPPORT TICKETS ──
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.support_tickets TO authenticated, service_role;
CREATE POLICY "Users manage own tickets" ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create tickets"     ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage tickets"    ON public.support_tickets FOR ALL USING (public.is_admin());

-- ── CHAT MESSAGES ──
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.chat_messages TO authenticated, service_role;
CREATE POLICY "Booking parties read chat" ON public.chat_messages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())
    )
);
CREATE POLICY "Booking parties create chat" ON public.chat_messages FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())
    )
    AND auth.uid() = sender_id
);
CREATE POLICY "Admins manage chat" ON public.chat_messages FOR ALL USING (public.is_admin());


-- ==============================================================
-- SECTION 14: REALTIME SUBSCRIPTIONS
-- Enable realtime on tables that need live updates
-- ==============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_status_history;


-- ==============================================================
-- FINAL: Bust PostgREST schema cache
-- ==============================================================
NOTIFY pgrst, 'reload schema';
