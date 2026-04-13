-- Migration: Add is_recommended to services
-- Description: Allows admins to explicitly flag services to appear in the "Recommended for You" section of the customer app home screen.

-- 1. Add the column
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT false;

-- 2. Add an index to speed up the home screen query (which heavily filters on this)
CREATE INDEX IF NOT EXISTS idx_services_is_recommended ON public.services(is_recommended);

-- 3. (Optional) Make some existing high-priority services recommended by default so the section isn't empty initially
UPDATE public.services
SET is_recommended = true
WHERE priority_number > 0 AND is_recommended = false;

-- Add a comment for documentation
COMMENT ON COLUMN public.services.is_recommended IS 'Flag to show this service in the Recommended section of the customer home app';
