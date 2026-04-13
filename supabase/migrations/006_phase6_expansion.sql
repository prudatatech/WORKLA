-- ==========================================
-- Phase 6 Expansion: Live Location Tracking
-- Run this in Supabase SQL Editor
-- ==========================================

-- 19. PROVIDER LOCATIONS (High frequency tracking)
-- We store a rolling log of locations, but broadcast via Realtime
CREATE TABLE IF NOT EXISTS provider_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL, -- Optional if tracking specific job
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for temporal and fast lookups
CREATE INDEX ON provider_locations (provider_id, recorded_at DESC);

-- Note: We will largely use Supabase Realtime Channels (Broadcast) for live tracking
-- without hitting the database for every single meter moved. We will batch sync
-- periodically to `provider_locations` for historical auditing or dispute resolution.

ALTER TABLE provider_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers can insert their location" ON provider_locations FOR INSERT WITH CHECK (auth.uid() = provider_id);
CREATE POLICY "Customers can view provider location for their booking" ON provider_locations FOR SELECT USING (
    EXISTS (SELECT 1 FROM bookings WHERE bookings.id = provider_locations.booking_id AND bookings.customer_id = auth.uid()) 
    OR auth.uid() = provider_id
);

-- Turn on Realtime for provider_locations so clients can listen to inserts if needed, 
-- though Postgres Changes is heavier than Broadcast.
-- We will rely on Broadcast for sub-second tracking.

-- ==========================================
-- FINISHED PHASE 6 SCHEMA EXPANSION
-- ==========================================
