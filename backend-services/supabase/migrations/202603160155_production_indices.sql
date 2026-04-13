-- Production Performance Indices
-- Optimized for high-frequency dashboard queries, provider busy-checks, and analytics.

-- 1. Bookings Table Optimization
-- Accelerates "ACTIVE_BOOKING_STATUSES" checks and provider dashboard/history
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status ON bookings (provider_id, status);

-- Accelerates customer-facing active booking lookups
CREATE INDEX IF NOT EXISTS idx_bookings_customer_status ON bookings (customer_id, status);

-- Accelerates overall status-based analytics/matching
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);

-- 2. Job Offers Table Optimization
-- Accelerates pending offer lookups during provider app ingestion
CREATE INDEX IF NOT EXISTS idx_job_offers_provider_status ON job_offers (provider_id, status);

-- Accelerates stale offer cleanup queries
CREATE INDEX IF NOT EXISTS idx_job_offers_status_offered ON job_offers (status, offered_at);
