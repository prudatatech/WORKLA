-- ==========================================
-- BATCH 12: CATALOG ARCHITECTURE FLATTENING
-- ==========================================

-- 1. Detach Category from Bookings to prevent FK violations
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_category_id_fkey;

ALTER TABLE public.bookings
DROP COLUMN IF EXISTS category_id;

-- 2. Drop the original Categories table entirely
DROP TABLE IF EXISTS public.service_categories CASCADE;

-- 3. Update the Services table (Now the top level)
ALTER TABLE public.services
DROP COLUMN IF EXISTS category_id,
DROP COLUMN IF EXISTS is_one_time,
DROP COLUMN IF EXISTS is_daily,
DROP COLUMN IF EXISTS is_weekly;

-- Add fallback constraint if not exists (Though priority/active remain)
-- Ensure services standalone

-- 4. Update the Service Subcategories table
ALTER TABLE public.service_subcategories
ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_daily BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_weekly BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_monthly BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_subcats_recommended ON public.service_subcategories(is_recommended);

-- 5. Update Provider Details to support the new constraints
ALTER TABLE public.provider_details
DROP COLUMN IF EXISTS service_categories,
ADD COLUMN IF NOT EXISTS supported_services UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS supported_subservices UUID[] DEFAULT '{}';

-- 6. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
