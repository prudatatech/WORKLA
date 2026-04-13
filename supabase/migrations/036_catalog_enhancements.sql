-- ==========================================
-- CATALOG & DISPATCH ENHANCEMENTS (SELF-CONTAINED)
-- ==========================================

-- 1. Create job_offers table if missing
CREATE TABLE IF NOT EXISTS public.job_offers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL REFERENCES public.bookings(id)  ON DELETE CASCADE,
    provider_id     UUID NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','rejected','expired')),
    distance_km     DOUBLE PRECISION,
    offered_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '60 seconds'),
    responded_at    TIMESTAMP WITH TIME ZONE,
    UNIQUE (booking_id, provider_id)
);

-- 2. Create provider_locations table if missing
CREATE TABLE IF NOT EXISTS public.provider_locations (
    provider_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create provider_services table if missing
CREATE TABLE IF NOT EXISTS public.provider_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    subcategory_id UUID REFERENCES public.service_subcategories(id) ON DELETE CASCADE,
    is_primary_service BOOLEAN DEFAULT FALSE,
    experience_years INTEGER DEFAULT 0,
    hourly_rate DECIMAL(10,2),
    base_price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, subcategory_id)
);

-- 4. Add image placeholder to subcategories if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='image_placeholder_url') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN image_placeholder_url TEXT;
    END IF;
END $$;

-- 5. Update Dispatch Engine (60 seconds window)
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

    -- Use correct column names from bookings table
    v_customer_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_customer_lng := COALESCE(v_booking.customer_longitude, 78.0081);

    -- Find available providers within 15km, ordered by distance
    -- Checks both availability AND that they offer this specific service subcategory
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
        JOIN public.provider_services ps ON ps.provider_id = sp.user_id 
        WHERE sp.is_available = TRUE
          AND sp.verification_status = 'approved'
          AND ps.subcategory_id = v_booking.subcategory_id
          AND ps.is_active = TRUE
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
            NOW() + INTERVAL '60 seconds'
        )
        ON CONFLICT (booking_id, provider_id) DO NOTHING;

        v_inserted := v_inserted + 1;
    END LOOP;

    -- Update booking status to requested (triggering provider notifications)
    UPDATE public.bookings SET status = 'requested', updated_at = NOW()
    WHERE id = p_booking_id;

    RETURN v_inserted;
END;
$$;

-- 6. Permissions & RLS
GRANT SELECT ON public.service_subcategories TO authenticated;
GRANT ALL ON public.provider_services TO authenticated;
GRANT ALL ON public.job_offers TO authenticated;
GRANT ALL ON public.provider_locations TO authenticated;

-- Ensure RLS is enabled and policies exist
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers view own offers" ON public.job_offers;
CREATE POLICY "Providers view own offers" ON public.job_offers FOR SELECT USING (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Providers update own offers" ON public.job_offers;
CREATE POLICY "Providers update own offers" ON public.job_offers FOR UPDATE USING (auth.uid() = provider_id);

ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers manage own location" ON public.provider_locations;
CREATE POLICY "Providers manage own location" ON public.provider_locations FOR ALL USING (auth.uid() = provider_id);

ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers manage own services" ON public.provider_services;
CREATE POLICY "Providers manage own services" ON public.provider_services FOR ALL USING (auth.uid() = provider_id);
