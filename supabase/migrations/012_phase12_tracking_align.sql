-- ============================================================
-- Workla Phase 7b: Live High-Precision Tracking
-- Alignment of provider_locations with frontend expectations
-- ============================================================

-- 1. Ensure columns match the App expectations
ALTER TABLE public.provider_locations 
RENAME COLUMN updated_at TO recorded_at;

-- 2. Add an index for faster lookup if we ever move to history (for now it's 1:1)
CREATE INDEX IF NOT EXISTS idx_provider_locations_id ON public.provider_locations(provider_id);

-- 3. Ensure Realtime is enabled for this table
-- (Already done in phase 7, but let's be sure)
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_locations;
-- IF the above fails because it already exists, that's fine.
