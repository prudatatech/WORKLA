-- ============================================================
-- Batch 10: Image URL Columns + Supabase Storage Bucket
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add image_url to service_categories
ALTER TABLE public.service_categories
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 2. Add image_url to services
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 3. Add image_url to service_subcategories
ALTER TABLE public.service_subcategories
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 4. Add image_url to coupons (for offer banners)
ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 5. Add display_order to services (for admin drag-sort)
ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- ============================================================
-- STORAGE BUCKET SETUP
-- NOTE: Run each insert separately if one already exists.
-- ============================================================

-- Create the public service-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'service-images',
    'service-images',
    true,
    5242880,  -- 5MB limit per file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880;

-- Allow anyone to READ (public bucket = readable, but only admins write)
DROP POLICY IF EXISTS "Public read service-images" ON storage.objects;
CREATE POLICY "Public read service-images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'service-images');

-- Allow authenticated users (admins) to INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admin upload service-images" ON storage.objects;
CREATE POLICY "Admin upload service-images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'service-images');

DROP POLICY IF EXISTS "Admin update service-images" ON storage.objects;
CREATE POLICY "Admin update service-images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'service-images');

DROP POLICY IF EXISTS "Admin delete service-images" ON storage.objects;
CREATE POLICY "Admin delete service-images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'service-images');

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('service_categories', 'services', 'service_subcategories', 'coupons')
  AND column_name = 'image_url';
