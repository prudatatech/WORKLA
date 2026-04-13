-- ============================================================
-- Batch 11: Service Refactor
-- Adds availability flags + priority_number to the services table
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Availability flags (a service can be multi-select, e.g. "One-time" AND "Weekly")
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS is_one_time  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_daily     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_weekly    BOOLEAN NOT NULL DEFAULT false;

-- 2. Priority number — higher number = shown first in Explore grid
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS priority_number INTEGER NOT NULL DEFAULT 0;

-- 3. Index for fast sorting
CREATE INDEX IF NOT EXISTS idx_services_priority
    ON public.services (priority_number DESC, name ASC);

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT id, name, is_one_time, is_daily, is_weekly, priority_number
FROM public.services
LIMIT 10;
