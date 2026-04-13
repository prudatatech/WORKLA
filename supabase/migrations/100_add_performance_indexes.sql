-- ============================================================
-- Migration: Add performance indexes for common query patterns
-- This prevents full table scans which cause timeouts on free-tier Supabase
-- ============================================================

-- 1. customer_addresses: Index on customer_id (used in every address lookup)
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id
    ON customer_addresses (customer_id);

-- 2. customer_addresses: Composite index for the default address query
--    Note: created_at is excluded as some schema versions may not have it
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_default
    ON customer_addresses (customer_id, is_default DESC);

-- 3. bookings: Index on customer_id (booking history queries)
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id
    ON bookings (customer_id);

-- 4. bookings: Index on provider_id (provider job queries)
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id
    ON bookings (provider_id);

-- 5. bookings: Composite index for status filtering (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_bookings_customer_status
    ON bookings (customer_id, status);

-- 6. bookings: Composite index for provider status filtering  
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status
    ON bookings (provider_id, status);

-- 7. provider_locations: Index on provider_id + recorded_at (real-time tracking)
CREATE INDEX IF NOT EXISTS idx_provider_locations_provider_recorded
    ON provider_locations (provider_id, recorded_at DESC);

-- 8. job_offers: Index on booking_id (dispatch lookup)
CREATE INDEX IF NOT EXISTS idx_job_offers_booking_id
    ON job_offers (booking_id);

-- 9. job_offers: Composite index for provider job offer queries
CREATE INDEX IF NOT EXISTS idx_job_offers_provider_status
    ON job_offers (provider_id, status);
