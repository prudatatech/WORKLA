-- 104_catalog_master_fix.sql
-- Goal: Standardize ordering and image columns across all catalog levels and ensure schema cache is refreshed.

-- 1. Standardize service_categories
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_categories' AND column_name='priority_number') THEN
        ALTER TABLE public.service_categories ADD COLUMN priority_number INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_categories' AND column_name='image_url') THEN
        ALTER TABLE public.service_categories ADD COLUMN image_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_categories' AND column_name='is_active') THEN
        ALTER TABLE public.service_categories ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 2. Standardize services
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='display_order') THEN
        ALTER TABLE public.services ADD COLUMN display_order INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='priority_number') THEN
        ALTER TABLE public.services ADD COLUMN priority_number INT DEFAULT 0;
    END IF;
END $$;

-- 3. Standardize service_subcategories
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='display_order') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN display_order INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='priority_number') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN priority_number INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='image_url') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- 4. Sync Data: ensure display_order and priority_number are the same if one is missing
UPDATE public.service_categories SET display_order = priority_number WHERE (display_order IS NULL OR display_order = 0) AND priority_number IS NOT NULL AND priority_number != 0;
UPDATE public.service_categories SET priority_number = display_order WHERE (priority_number IS NULL OR priority_number = 0) AND display_order IS NOT NULL AND display_order != 0;

UPDATE public.services SET display_order = priority_number WHERE (display_order IS NULL OR display_order = 0) AND priority_number IS NOT NULL AND priority_number != 0;
UPDATE public.services SET priority_number = display_order WHERE (priority_number IS NULL OR priority_number = 0) AND display_order IS NOT NULL AND display_order != 0;

UPDATE public.service_subcategories SET display_order = priority_number WHERE (display_order IS NULL OR display_order = 0) AND priority_number IS NOT NULL AND priority_number != 0;
UPDATE public.service_subcategories SET priority_number = display_order WHERE (priority_number IS NULL OR priority_number = 0) AND display_order IS NOT NULL AND display_order != 0;

-- 5. Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
