-- 104_catalog_master_fix.sql
-- Goal: Standardize ordering, visibility flags, image columns, and timestamps for the Flattened Catalog.

-- 1. Standardize services
DO $$ 
BEGIN
    -- Ordering
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='display_order') THEN
        ALTER TABLE public.services ADD COLUMN display_order INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='priority_number') THEN
        ALTER TABLE public.services ADD COLUMN priority_number INT DEFAULT 0;
    END IF;
    -- Assets & Metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='image_url') THEN
        ALTER TABLE public.services ADD COLUMN image_url TEXT;
    END IF;
    -- Visibility Flags
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_popular') THEN
        ALTER TABLE public.services ADD COLUMN is_popular BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_smart_pick') THEN
        ALTER TABLE public.services ADD COLUMN is_smart_pick BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_recommended') THEN
        ALTER TABLE public.services ADD COLUMN is_recommended BOOLEAN DEFAULT false;
    END IF;
    -- Timestamps
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='updated_at') THEN
        ALTER TABLE public.services ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 2. Standardize service_subcategories
DO $$ 
BEGIN
    -- Ordering
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='display_order') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN display_order INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='priority_number') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN priority_number INT DEFAULT 0;
    END IF;
    -- Assets
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='image_url') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN image_url TEXT;
    END IF;
    -- Visibility Flags
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='is_popular') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN is_popular BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='is_smart_pick') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN is_smart_pick BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='is_recommended') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN is_recommended BOOLEAN DEFAULT false;
    END IF;
    -- Timestamps
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_subcategories' AND column_name='updated_at') THEN
        ALTER TABLE public.service_subcategories ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 3. Sync Data
UPDATE public.services SET display_order = priority_number WHERE (display_order IS NULL OR display_order = 0) AND priority_number IS NOT NULL AND priority_number != 0;
UPDATE public.services SET priority_number = display_order WHERE (priority_number IS NULL OR priority_number = 0) AND display_order IS NOT NULL AND display_order != 0;

UPDATE public.service_subcategories SET display_order = priority_number WHERE (display_order IS NULL OR display_order = 0) AND priority_number IS NOT NULL AND priority_number != 0;
UPDATE public.service_subcategories SET priority_number = display_order WHERE (priority_number IS NULL OR priority_number = 0) AND display_order IS NOT NULL AND display_order != 0;

-- 4. Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
