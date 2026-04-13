-- ==========================================
-- FIX: Restore Relationship for service_providers and user_profiles join
-- Purpose: Fix 400 error in Admin Portal due to relationship ambiguity
-- ==========================================

-- Ensure service_providers can join to user_profiles directly
ALTER TABLE public.service_providers 
DROP CONSTRAINT IF EXISTS fk_service_providers_profile;

ALTER TABLE public.service_providers
ADD CONSTRAINT fk_service_providers_profile 
FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

-- Also ensure user_profiles has a proper unique constraint for the join
-- (It's already a PK, so it's unique, but explicit helps PostgREST sometimes)

-- Notify PostgREST of the change (usually happens automatically, but good to keep in mind)
COMMENT ON CONSTRAINT fk_service_providers_profile ON public.service_providers IS 'Join to user profiles for admin and app listings';
