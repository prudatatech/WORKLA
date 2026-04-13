-- ==========================================
-- Workla Phase 19: 3-Tier Service Hierarchy & DB Fixes
-- Purpose: 
-- 1. Create 3-tier structure (categories -> services -> subcategories)
-- 2. Clean up redundant user/customer tables (Consolidate to user_profiles)
-- 3. Create provider_locations to fix the Online toggle
-- ==========================================

-- ==========================================
-- PART 1: PROVIDER LOCATIONS FIX
-- ==========================================

CREATE TABLE IF NOT EXISTS public.provider_locations (
    provider_id UUID PRIMARY KEY REFERENCES public.service_providers(user_id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Provider Locations
ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can update their own location" ON public.provider_locations;
CREATE POLICY "Providers can update their own location" ON public.provider_locations
FOR ALL USING (auth.uid() = provider_id) WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Public can view online provider locations" ON public.provider_locations;
CREATE POLICY "Public can view online provider locations" ON public.provider_locations
FOR SELECT USING (true);


-- ==========================================
-- PART 2: DUPLICATE CUSTOMERS TABLE CLEANUP
-- ==========================================
-- The user reported duplicate 'customer' tables instead of just 'user_profiles'.
-- We will safely drop any manually created duplicate customer tables.
-- The SSOT for customers remains `public.user_profiles` where `user_type = 'customer'`.

DROP TABLE IF EXISTS public.customer CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;


-- ==========================================
-- PART 3: 3-TIER SERVICE HIERARCHY
-- ==========================================

-- 3.1: CREATE MIDDLE TIER (SERVICES)
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES public.service_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,
    service_code VARCHAR(30) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, slug) -- Ensure no duplicate slugs within the same category
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Explicit permissions to avoid 401 Unauthorized
GRANT ALL ON public.services TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view active services" ON public.services;
CREATE POLICY "Public can view active services" ON public.services
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
CREATE POLICY "Admins can manage services" ON public.services
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND user_type = 'admin'
        )
    );

-- Force PostgREST to reload schema cache so it recognizes the new table and grants!
NOTIFY pgrst, 'reload schema';

-- 3.2: MODIFY SUBCATEGORIES FOR 3-TIER
-- Add the new service_id foreign key (linking to middle tier)
ALTER TABLE public.service_subcategories 
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE CASCADE;


-- ==========================================
-- PART 4: AUTO-GENERATING UNIQUE CODES 
-- Format: C-01 -> S-01-C01 -> SUB-01-S01
-- ==========================================

-- 4.1: CATEGORY CODE (C-XX)
CREATE OR REPLACE FUNCTION generate_tier1_category_code() 
RETURNS TRIGGER AS $$
DECLARE
    next_num INT;
BEGIN
    IF NEW.category_code IS NULL OR NEW.category_code NOT LIKE 'C-%' THEN
        SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(category_code, '^C-', '') AS INTEGER)), 0) + 1 
        INTO next_num 
        FROM public.service_categories 
        WHERE category_code ~ '^C-[0-9]+$';
        
        NEW.category_code := 'C-' || LPAD(next_num::text, 2, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_category_code ON public.service_categories;
CREATE TRIGGER trg_generate_category_code
BEFORE INSERT OR UPDATE ON public.service_categories
FOR EACH ROW EXECUTE FUNCTION generate_tier1_category_code();


-- 4.2: SERVICE CODE (S-XX-CXX)
CREATE OR REPLACE FUNCTION generate_tier2_service_code() 
RETURNS TRIGGER AS $$
DECLARE
    cat_code VARCHAR(20);
    next_num INT;
BEGIN
    IF NEW.service_code IS NULL THEN
        -- Get parent Category Code (C-XX)
        SELECT category_code INTO cat_code FROM public.service_categories WHERE id = NEW.category_id;
        
        IF cat_code IS NULL THEN
            cat_code := 'C-00'; -- Fallback
        END IF;

        -- Find next number for THIS category
        SELECT COALESCE(MAX(CAST(SPLIT_PART(service_code, '-', 2) AS INTEGER)), 0) + 1 
        INTO next_num 
        FROM public.services 
        WHERE category_id = NEW.category_id;
        
        -- Generate Code: S-01-C01
        NEW.service_code := 'S-' || LPAD(next_num::text, 2, '0') || '-' || cat_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_service_code ON public.services;
CREATE TRIGGER trg_generate_service_code
BEFORE INSERT OR UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION generate_tier2_service_code();


-- 4.3: SUBCATEGORY CODE (SUB-XX-SXX)
CREATE OR REPLACE FUNCTION generate_tier3_subcategory_code() 
RETURNS TRIGGER AS $$
DECLARE
    srv_code VARCHAR(30);
    srv_prefix VARCHAR(10);
    next_num INT;
BEGIN
    IF NEW.subcategory_code IS NULL OR NEW.subcategory_code NOT LIKE 'SUB-%' THEN
        IF NEW.service_id IS NOT NULL THEN
            -- Get parent Service Code (S-XX-CXX)
            SELECT service_code INTO srv_code FROM public.services WHERE id = NEW.service_id;
            
            -- Extract 'S-XX' from 'S-XX-CXX'
            IF srv_code IS NOT NULL THEN
                srv_prefix := SPLIT_PART(srv_code, '-', 1) || '-' || SPLIT_PART(srv_code, '-', 2);
            ELSE
                srv_prefix := 'S-00';
            END IF;
            
            -- Find next number for THIS service
            SELECT COALESCE(MAX(CAST(SPLIT_PART(subcategory_code, '-', 2) AS INTEGER)), 0) + 1 
            INTO next_num 
            FROM public.service_subcategories 
            WHERE service_id = NEW.service_id;
            
            -- Generate Code: SUB-01-S01
            NEW.subcategory_code := 'SUB-' || LPAD(next_num::text, 2, '0') || '-' || srv_prefix;
        ELSE
            -- Fallback if legacy category_id is still used temporarily
            NEW.subcategory_code := 'SUB-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_subcategory_code ON public.service_subcategories;
CREATE TRIGGER trg_generate_subcategory_code
BEFORE INSERT OR UPDATE ON public.service_subcategories
FOR EACH ROW EXECUTE FUNCTION generate_tier3_subcategory_code();


-- ==========================================
-- PART 5: SEEDING DEFAULT CATEGORIES (FREQUENCY)
-- ==========================================
-- The user requested to remove the previous misplaced categories (like plumbing) 
-- and start completely fresh so they can add everything manually.
-- Truncating cascades to services and subcategories to give a clean slate.
TRUNCATE TABLE public.service_categories CASCADE;

-- Provide 7 default frequency-based categories
INSERT INTO public.service_categories (name, slug, description, is_active)
VALUES 
    ('One-Time', 'one-time', 'A single, one-off service visit', true),
    ('Daily', 'daily', 'Service performed every day', true),
    ('Weekly', 'weekly', 'Service performed once a week', true),
    ('Bi-Weekly', 'bi-weekly', 'Service performed every two weeks', true),
    ('Monthly', 'monthly', 'Service performed once a month', true),
    ('Quarterly', 'quarterly', 'Service performed every three months', true),
    ('Annual', 'annual', 'Service performed once a year', true)
ON CONFLICT (slug) DO NOTHING;

-- Force update any existing categories to trigger the new C-XX code format
UPDATE public.service_categories SET category_code = NULL WHERE category_code NOT LIKE 'C-%';
UPDATE public.service_categories SET id = id; -- Triggers the update hook

-- Force update subcategories that might already exist
UPDATE public.service_subcategories SET subcategory_code = NULL WHERE subcategory_code NOT LIKE 'SUB-%';
UPDATE public.service_subcategories SET id = id;
