-- ==========================================
-- Phase 5 Expansion: Matching Engine & Dispatch Logic
-- Run this in Supabase SQL Editor
-- ==========================================

-- 17. PROVIDER AVAILABILITY TIMEOUT / SHIFT
CREATE TABLE IF NOT EXISTS provider_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, shift_date, start_time)
);

-- 18. JOB OFFERS & SMART MATCHING
-- When a customer creates a generic booking without a specific provider, or a provider declines,
-- the system broadcasts 'job_offers' to matching available providers.
CREATE TABLE IF NOT EXISTS job_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    offered_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    distance_km DOUBLE PRECISION,
    UNIQUE(booking_id, provider_id)
);

-- PlPGSQL Function to find best matching providers for a new generic job
CREATE OR REPLACE FUNCTION broadcast_job_to_providers(
    p_booking_id UUID,
    p_category_id UUID,
    p_customer_lat DOUBLE PRECISION,
    p_customer_lng DOUBLE PRECISION,
    p_max_distance_km DOUBLE PRECISION DEFAULT 20.0,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    offered_provider_id UUID,
    calculated_distance DOUBLE PRECISION
) LANGUAGE plpgsql AS $$
DECLARE
    v_offer_expires_at TIMESTAMPTZ;
BEGIN
    v_offer_expires_at := (NOW() + interval '5 minutes');

    RETURN QUERY
    WITH potential_providers AS (
        SELECT 
            sp.user_id,
            (ST_DistanceSphere(ST_MakePoint(p_customer_lng, p_customer_lat), up.location) / 1000.0) AS dist_km
        FROM service_providers sp
        JOIN user_profiles up ON up.user_id = sp.user_id
        JOIN provider_services ps ON ps.provider_id = sp.user_id
        JOIN service_subcategories ss ON ss.id = ps.subcategory_id
        WHERE 
            ss.category_id = p_category_id
            AND sp.is_available = TRUE
            AND sp.accepts_new_jobs = TRUE
            AND sp.current_active_jobs < sp.max_concurrent_jobs
            AND up.location IS NOT NULL
            AND (ST_DistanceSphere(ST_MakePoint(p_customer_lng, p_customer_lat), up.location) / 1000.0) <= p_max_distance_km
            -- Check they don't already have an offer for this job
            AND NOT EXISTS (
                SELECT 1 FROM job_offers jo WHERE jo.booking_id = p_booking_id AND jo.provider_id = sp.user_id
            )
        ORDER BY 
            sp.avg_rating DESC, -- Prioritize high rated
            dist_km ASC         -- Then nearest
        LIMIT p_limit
    )
    INSERT INTO job_offers (booking_id, provider_id, status, expires_at, distance_km)
    SELECT p_booking_id, pp.user_id, 'pending', v_offer_expires_at, pp.dist_km
    FROM potential_providers pp
    RETURNING provider_id, distance_km;
END;
$$;


-- Add strict RLS
ALTER TABLE provider_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers manage own shifts" ON provider_shifts FOR ALL USING (auth.uid() = provider_id);

ALTER TABLE job_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers view own job offers" ON job_offers FOR SELECT USING (auth.uid() = provider_id);
CREATE POLICY "Providers can update own job offers" ON job_offers FOR UPDATE USING (auth.uid() = provider_id);
-- Admins and system logic handles inserts

-- ==========================================
-- FINISHED PHASE 5 SCHEMA EXPANSION
-- ==========================================
