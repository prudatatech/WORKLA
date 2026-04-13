-- ============================================================
-- Workla Phase 9: Dynamic Service Catalog Setup
-- ============================================================

-- Ensure the tables exist (from schema)
-- We use a clean state for dynamic adding

-- 1. RLS Policies for Public Access (Read)
ALTER TABLE IF EXISTS public.service_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Access Categories" ON public.service_categories;
CREATE POLICY "Public Read Access Categories" ON public.service_categories FOR SELECT USING (true);

ALTER TABLE IF EXISTS public.service_subcategories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Access Subcategories" ON public.service_subcategories;
CREATE POLICY "Public Read Access Subcategories" ON public.service_subcategories FOR SELECT USING (true);

-- 2. Admin Permissions for Management
-- Using bypass for now or simple check
DROP POLICY IF EXISTS "Admins manage categories" ON public.service_categories;
CREATE POLICY "Admins manage categories" ON public.service_categories FOR ALL USING (true);

DROP POLICY IF EXISTS "Admins manage subcategories" ON public.service_subcategories;
CREATE POLICY "Admins manage subcategories" ON public.service_subcategories FOR ALL USING (true);

-- 3. Optional: Initial Cleanup
-- TRUNCATE public.service_categories CASCADE;
