-- ================================================================
-- WORKLA Migration 103: Catalog Alignment Fix
-- Resolves "display_order" column missing error and synchronizes 
-- ordering columns across the service catalog.
-- ================================================================

-- ── 1. Service Subcategories — Missing Columns ──────────────────
ALTER TABLE public.service_subcategories
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS priority_number INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- ── 2. Services — Alignment ─────────────────────────────────────
-- Ensure Services also has both columns to support different API routes
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- ── 3. Data Synchronization — Self-Healing ───────────────────────
-- If priority_number was set but display_order wasn't, sync them.
UPDATE public.service_subcategories 
SET display_order = priority_number 
WHERE display_order = 0 AND priority_number <> 0;

UPDATE public.service_subcategories 
SET priority_number = display_order 
WHERE priority_number = 0 AND display_order <> 0;

UPDATE public.services 
SET display_order = priority_number 
WHERE display_order = 0 AND priority_number <> 0;

-- ── 4. Cache & Permissions ─────────────────────────────────────
-- Reload PostgREST cache to reflect schema changes immediately
NOTIFY pgrst, 'reload schema';

SELECT 'Catalog Schema Aligned ✅' as result;
