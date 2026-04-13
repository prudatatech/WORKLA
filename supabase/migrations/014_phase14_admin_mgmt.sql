-- ==========================================
-- Workla Phase 14: Admin Catalog Management
-- Purpose: Enable full CRUD for Admins via the Admin Website
-- ==========================================

-- 1. Ensure RLS is enabled on catalog tables
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_subcategories ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies if any (to avoid duplicates)
DROP POLICY IF EXISTS "Admins can manage categories" ON public.service_categories;
DROP POLICY IF EXISTS "Admins can manage subcategories" ON public.service_subcategories;
DROP POLICY IF EXISTS "Anyone can view categories" ON public.service_categories;
DROP POLICY IF EXISTS "Anyone can view subcategories" ON public.service_subcategories;

-- 3. Create Admin Management Policies
-- Assuming users table has a 'role' column or we check against a specific admin flag
CREATE POLICY "Admins can manage categories" ON public.service_categories
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND user_type = 'admin'
        )
    );

CREATE POLICY "Admins can manage subcategories" ON public.service_subcategories
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND user_type = 'admin'
        )
    );

-- 4. Create Public View Policies (for Customer/Provider apps)
CREATE POLICY "Anyone can view active categories" ON public.service_categories
    FOR SELECT 
    USING (TRUE);

CREATE POLICY "Anyone can view active subcategories" ON public.service_subcategories
    FOR SELECT 
    USING (is_active = TRUE);

-- 5. Grant permissions to authenticated users for RPC/Functions
GRANT ALL ON public.service_categories TO authenticated;
GRANT ALL ON public.service_subcategories TO authenticated;
