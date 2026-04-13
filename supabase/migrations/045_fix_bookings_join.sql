-- ==========================================
-- FIX: Align Bookings Foreign Keys to auth.users
-- Purpose: Ensure consistent join behavior across all apps
-- ==========================================

-- 1. Direct join for Customer Profile
ALTER TABLE public.bookings 
DROP CONSTRAINT IF EXISTS fk_bookings_customer_profile;

ALTER TABLE public.bookings
ADD CONSTRAINT fk_bookings_customer_profile 
FOREIGN KEY (customer_id) REFERENCES public.user_profiles(user_id) ON DELETE SET NULL;

-- 2. Direct join for Service Provider
ALTER TABLE public.bookings 
DROP CONSTRAINT IF EXISTS fk_bookings_provider_record;

ALTER TABLE public.bookings
ADD CONSTRAINT fk_bookings_provider_record 
FOREIGN KEY (provider_id) REFERENCES public.service_providers(user_id) ON DELETE SET NULL;

-- Notify PostgREST
COMMENT ON CONSTRAINT fk_bookings_customer_profile ON public.bookings IS 'Direct join to customer profiles';
COMMENT ON CONSTRAINT fk_bookings_provider_record ON public.bookings IS 'Direct join to provider business records';
