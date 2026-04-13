-- ==========================================
-- Workla Phase 18: Hierarchical Service Catalog
-- Purpose: Enforce Category -> Subcategory structure with unique codes
-- ==========================================

-- 1. ENHANCE TABLES WITH UNIQUE CODES
ALTER TABLE public.service_categories 
ADD COLUMN IF NOT EXISTS category_code VARCHAR(10) UNIQUE;

ALTER TABLE public.service_subcategories 
ADD COLUMN IF NOT EXISTS subcategory_code VARCHAR(20) UNIQUE;

-- 2. CREATE FUNCTION TO AUTO-GENERATE CODES
CREATE OR REPLACE FUNCTION generate_category_code() 
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.category_code IS NULL THEN
        NEW.category_code := 'CAT-' || LPAD(nextval(pg_get_serial_sequence('service_categories', 'display_order'))::text, 3, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. APPLY CATEGORY CODES TO EXISTING DATA
-- We'll use a simple counter for existing rows
DO $$
DECLARE
    cat RECORD;
    counter INT := 1;
BEGIN
    FOR cat IN SELECT id FROM public.service_categories WHERE category_code IS NULL ORDER BY created_at ASC LOOP
        UPDATE public.service_categories 
        SET category_code = 'CAT-' || LPAD(counter::text, 3, '0')
        WHERE id = cat.id;
        counter := counter + 1;
    END LOOP;
END $$;

-- 4. APPLY SUBCATEGORY CODES TO EXISTING DATA
DO $$
DECLARE
    sub RECORD;
    cat_code VARCHAR(10);
    counter INT;
BEGIN
    FOR sub IN SELECT id, category_id FROM public.service_subcategories WHERE subcategory_code IS NULL ORDER BY category_id, created_at ASC LOOP
        SELECT category_code INTO cat_code FROM public.service_categories WHERE id = sub.category_id;
        
        -- Get count of existing subcategories for this category to determine suffix
        SELECT COUNT(*) + 1 INTO counter 
        FROM public.service_subcategories 
        WHERE category_id = sub.category_id AND subcategory_code IS NOT NULL;

        UPDATE public.service_subcategories 
        SET subcategory_code = cat_code || '-S' || LPAD(counter::text, 2, '0')
        WHERE id = sub.id;
    END LOOP;
END $$;

-- 5. REINFORCE RLS
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active categories" ON service_categories;
CREATE POLICY "Public can view active categories" ON service_categories
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage categories" ON service_categories;
CREATE POLICY "Admins can manage categories" ON service_categories
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE user_id = auth.uid() AND user_type = 'admin'
    )
);

ALTER TABLE service_subcategories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active subcategories" ON service_subcategories;
CREATE POLICY "Public can view active subcategories" ON service_subcategories
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage subcategories" ON service_subcategories;
CREATE POLICY "Admins can manage subcategories" ON service_subcategories
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE user_id = auth.uid() AND user_type = 'admin'
    )
);

-- 6. POSTGREST HINTS FOR NESTED JOINS
COMMENT ON TABLE public.service_categories IS 'Root service categories with unique CAT-XXX codes';
COMMENT ON TABLE public.service_subcategories IS 'Detailed services within categories with unique CAT-XXX-SXX codes';
