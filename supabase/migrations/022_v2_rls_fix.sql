-- HELPER FUNCTION TO PREVENT INFINITE RECURSION
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'ADMIN'
    );
$$;

-- FIX PROFILES POLICY
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles 
    FOR SELECT USING ( public.is_admin() );

-- FIX BOOKINGS POLICY
DROP POLICY IF EXISTS "Admins view all bookings" ON public.bookings;
CREATE POLICY "Admins view all bookings" ON public.bookings 
    FOR SELECT USING ( public.is_admin() );

-- FIX CATALOG POLICIES
DROP POLICY IF EXISTS "Admins can manage categories" ON public.service_categories;
CREATE POLICY "Admins can manage categories" ON public.service_categories 
    FOR ALL USING ( public.is_admin() );

DROP POLICY IF EXISTS "Admins can manage subcategories" ON public.service_subcategories;
CREATE POLICY "Admins can manage subcategories" ON public.service_subcategories 
    FOR ALL USING ( public.is_admin() );

DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
CREATE POLICY "Admins can manage services" ON public.services 
    FOR ALL USING ( public.is_admin() );
    
-- Ensure Public can Select Catalog
DROP POLICY IF EXISTS "Public read categories" ON public.service_categories;
CREATE POLICY "Public read categories" ON public.service_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read services" ON public.services;
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read subcategories" ON public.service_subcategories;
CREATE POLICY "Public read subcategories" ON public.service_subcategories FOR SELECT USING (true);

-- Bust cache
NOTIFY pgrst, 'reload schema';
