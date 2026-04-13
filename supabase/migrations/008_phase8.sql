-- ============================================================
-- Workla Phase 8: Dispatch Engine, Push Notifications, Earnings
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────
-- 1. JOB OFFERS TABLE (one row per provider per booking)
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_offers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL REFERENCES public.bookings(id)  ON DELETE CASCADE,
    provider_id     UUID NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','rejected','expired')),
    distance_km     DOUBLE PRECISION,
    offered_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '15 seconds'),
    responded_at    TIMESTAMP WITH TIME ZONE,
    UNIQUE (booking_id, provider_id)
);

ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers see their own offers" ON public.job_offers
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Providers update their own offers" ON public.job_offers
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Service role can insert offers" ON public.job_offers
    FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────────────
-- 2. PUSH TOKENS TABLE
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT CHECK (platform IN ('ios','android','web')),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens" ON public.push_tokens
    FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────
-- 3. WORKER EARNINGS TABLE
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_earnings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_id      UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    gross_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
    platform_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(10,2) GENERATED ALWAYS AS (gross_amount - platform_fee) STORED,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','withheld')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.worker_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers see own earnings" ON public.worker_earnings
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Service role manages earnings" ON public.worker_earnings
    FOR ALL USING (true);

-- ─────────────────────────────────────────────────
-- 4. DISPATCH FUNCTION
--    Call this after a booking is created:
--    SELECT dispatch_job('booking-uuid-here');
--    It finds available providers within 15km and creates job_offers.
-- ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_job(p_booking_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking          RECORD;
    v_provider         RECORD;
    v_inserted         INTEGER := 0;
    v_customer_lat     DOUBLE PRECISION;
    v_customer_lng     DOUBLE PRECISION;
BEGIN
    -- Get booking info
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found', p_booking_id;
    END IF;

    -- Default location (Agra) if customer location not stored yet
    v_customer_lat := COALESCE(v_booking.customer_lat, 27.1767);
    v_customer_lng := COALESCE(v_booking.customer_lng, 78.0081);

    -- Find available providers within 15km, ordered by distance
    FOR v_provider IN
        SELECT
            sp.user_id,
            pl.latitude,
            pl.longitude,
            -- Haversine approximation in km
            (6371 * acos(
                cos(radians(v_customer_lat)) * cos(radians(pl.latitude)) *
                cos(radians(pl.longitude) - radians(v_customer_lng)) +
                sin(radians(v_customer_lat)) * sin(radians(pl.latitude))
            )) AS distance_km
        FROM public.service_providers sp
        JOIN public.provider_locations pl ON pl.provider_id = sp.user_id
        WHERE sp.is_available = TRUE
          AND sp.status = 'approved'
        HAVING (6371 * acos(
                cos(radians(v_customer_lat)) * cos(radians(pl.latitude)) *
                cos(radians(pl.longitude) - radians(v_customer_lng)) +
                sin(radians(v_customer_lat)) * sin(radians(pl.latitude))
            )) < 15
        ORDER BY distance_km ASC
        LIMIT 10
    LOOP
        INSERT INTO public.job_offers (
            booking_id, provider_id, distance_km,
            expires_at
        ) VALUES (
            p_booking_id,
            v_provider.user_id,
            v_provider.distance_km,
            NOW() + INTERVAL '15 seconds'
        )
        ON CONFLICT (booking_id, provider_id) DO NOTHING;

        v_inserted := v_inserted + 1;
    END LOOP;

    -- Update booking status to dispatching
    UPDATE public.bookings SET status = 'dispatching', updated_at = NOW()
    WHERE id = p_booking_id;

    RETURN v_inserted;
END;
$$;

-- ─────────────────────────────────────────────────
-- 5. AUTO-EXPIRE OFFERS FUNCTION
--    Run this via pg_cron every 30 seconds, or call manually.
-- ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_offers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_count INTEGER;
BEGIN
    UPDATE public.job_offers
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ─────────────────────────────────────────────────
-- 6. RATING AGGREGATE TRIGGER
--    Automatically updates service_providers.avg_rating
--    when a new rating is inserted.
-- ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_provider_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.service_providers
    SET avg_rating = (
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM public.ratings
        WHERE provider_id = NEW.provider_id
    ),
    total_reviews = (
        SELECT COUNT(*) FROM public.ratings WHERE provider_id = NEW.provider_id
    )
    WHERE user_id = NEW.provider_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_provider_rating ON public.ratings;
CREATE TRIGGER trg_update_provider_rating
    AFTER INSERT OR UPDATE ON public.ratings
    FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating();

-- ─────────────────────────────────────────────────
-- 7. AUTO-EARNINGS ON BOOKING COMPLETION
--    Creates a worker_earnings record when booking status → completed
-- ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_earning_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.provider_id IS NOT NULL THEN
        INSERT INTO public.worker_earnings (
            provider_id, booking_id,
            gross_amount, platform_fee
        ) VALUES (
            NEW.provider_id,
            NEW.id,
            COALESCE(NEW.total_amount, 0),
            ROUND((COALESCE(NEW.total_amount, 0) * 0.10)::numeric, 2) -- 10% platform fee
        )
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_earning ON public.bookings;
CREATE TRIGGER trg_create_earning
    AFTER UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.create_earning_on_completion();

-- ─────────────────────────────────────────────────
-- 8. ADD MISSING COLUMNS (safe, IF NOT EXISTS pattern)
-- ─────────────────────────────────────────────────
DO $$
BEGIN
    -- Add lat/lng to bookings if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='customer_lat') THEN
        ALTER TABLE public.bookings ADD COLUMN customer_lat DOUBLE PRECISION;
        ALTER TABLE public.bookings ADD COLUMN customer_lng DOUBLE PRECISION;
    END IF;

    -- Add avg_rating, total_reviews to service_providers if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_providers' AND column_name='avg_rating') THEN
        ALTER TABLE public.service_providers ADD COLUMN avg_rating NUMERIC(3,2) DEFAULT 0;
        ALTER TABLE public.service_providers ADD COLUMN total_reviews INTEGER DEFAULT 0;
    END IF;
END $$;

-- ─────────────────────────────────────────────────
-- 9. ENABLE REALTIME
-- ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_earnings;

-- ----------------------------------------------------------------
-- SEARCH FUNCTIONALITY (PHASE 8 EXTENSION)
-- ----------------------------------------------------------------

-- Add search index for business name
CREATE INDEX IF NOT EXISTS idx_providers_business_name_search ON public.service_providers USING GIN (to_tsvector('english', business_name));

-- Search Providers RPC
CREATE OR REPLACE FUNCTION public.search_providers_by_catalog_and_location(
  search_query TEXT,
  customer_lat DOUBLE PRECISION,
  customer_lng DOUBLE PRECISION,
  max_distance_km DOUBLE PRECISION DEFAULT 50.0
)
RETURNS TABLE (
  user_id UUID,
  business_name TEXT,
  avatar_url TEXT,
  avg_rating DECIMAL,
  total_reviews INT,
  total_jobs_completed INT,
  verification_status TEXT,
  city TEXT,
  distance_km DOUBLE PRECISION,
  matched_service TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.user_id,
    sp.business_name,
    up.avatar_url,
    sp.avg_rating,
    sp.total_reviews,
    (SELECT COUNT(*)::INT FROM public.bookings WHERE provider_id = sp.id AND status = 'completed') as total_jobs_completed,
    sp.status as verification_status,
    'Varanasi' as city, -- Placeholder
    (
      6371 * acos(
        cos(radians(customer_lat)) * cos(radians(sp.last_lat)) *
        cos(radians(sp.last_lng) - radians(customer_lng)) +
        sin(radians(customer_lat)) * sin(radians(sp.last_lat))
      )
    ) AS distance_km,
    (
      SELECT cat::TEXT 
      FROM unnest(sp.service_categories) cat 
      WHERE cat ILIKE '%' || search_query || '%' 
      LIMIT 1
    ) as matched_service
  FROM 
    public.service_providers sp
  JOIN 
    public.user_profiles up ON sp.user_id = up.user_id
  WHERE 
    sp.status = 'approved'
    AND (
      sp.business_name ILIKE '%' || search_query || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(sp.service_categories) cat 
        WHERE cat ILIKE '%' || search_query || '%'
      )
    )
    AND (
      sp.last_lat IS NOT NULL AND sp.last_lng IS NOT NULL
      AND (
        6371 * acos(
          cos(radians(customer_lat)) * cos(radians(sp.last_lat)) *
          cos(radians(sp.last_lng) - radians(customer_lng)) +
          sin(radians(customer_lat)) * sin(radians(sp.last_lat))
        )
      ) <= max_distance_km
    )
  ORDER BY 
    distance_km ASC;
END;
$$;

-- ─────────────────────────────────────────────────
-- DONE: Phase 8 Migration Complete
-- ─────────────────────────────────────────────────
