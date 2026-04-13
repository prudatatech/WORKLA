-- =================================================================================
-- WORKLA PLATFORM: PHASE 4 OPTIMIZATION INDEXES (CORRECTED)
-- Purpose: Optimize common foreign key joins and filters to prevent sequential scans
-- =================================================================================

-- 1. Bookings indexes
-- Query pattern: Get all bookings for a user, or all jobs for a provider
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON public.bookings(provider_id);

-- Query pattern: Filter bookings by status (e.g., active bookings for dashboard)
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);

-- 2. Earnings & Ratings indexes
-- Query pattern: Get stats or reviews for a provider
CREATE INDEX IF NOT EXISTS idx_worker_earnings_provider_id ON public.worker_earnings(provider_id);
CREATE INDEX IF NOT EXISTS idx_ratings_provider_id ON public.ratings(provider_id);

-- Query pattern: Get reviews for a customer
CREATE INDEX IF NOT EXISTS idx_ratings_customer_id ON public.ratings(customer_id);

-- 3. Geospatial extension checks (Optional, but if we need it later)
-- CREATE INDEX IF NOT EXISTS idx_provider_locations ON public.provider_details USING GIST (location);
