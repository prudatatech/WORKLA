-- ==========================================
-- PHASE 17 (RE-FIXED): Ecosystem Separation & Join Restoration
-- Run this in your Supabase SQL Editor to fix 400 errors and User Roles
-- ==========================================

-- 1. ADD USER_TYPE TO PROFILES
ALTER TABLE IF EXISTS public.user_profiles 
ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) CHECK (user_type IN ('customer', 'provider', 'admin')) DEFAULT 'customer';

-- 2. RESTORE RELATIONSHIP JOINS (Fixes 400 Errors)
-- Direct Provider -> Profile join
ALTER TABLE public.service_providers DROP CONSTRAINT IF EXISTS fk_service_providers_profile;
ALTER TABLE public.service_providers ADD CONSTRAINT fk_service_providers_profile 
FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

-- Direct Bookings -> Customer Profile join
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS fk_bookings_customer_profile;
ALTER TABLE public.bookings ADD CONSTRAINT fk_bookings_customer_profile 
FOREIGN KEY (customer_id) REFERENCES public.user_profiles(user_id) ON DELETE SET NULL;

-- Direct Bookings -> Provider Record join
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS fk_bookings_provider_record;
ALTER TABLE public.bookings ADD CONSTRAINT fk_bookings_provider_record 
FOREIGN KEY (provider_id) REFERENCES public.service_providers(user_id) ON DELETE SET NULL;

-- 3. UPDATE TRIGGER FOR USER_TYPE PROPAGATION
-- captures role from auth metadata during signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, full_name, avatar_url, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    user_type = EXCLUDED.user_type,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. BACKFILL ROLES FOR EXISTING DATA
-- Identify providers
UPDATE public.user_profiles SET user_type = 'provider'
WHERE user_id IN (SELECT user_id FROM public.service_providers);

-- Identify admins (if any in legacy users table)
UPDATE public.user_profiles up SET user_type = u.user_type FROM public.users u
WHERE up.user_id = u.id AND u.user_type = 'admin';

-- 5. SYNC TRIGGER FOR MANUAL UPDATES
CREATE OR REPLACE FUNCTION public.sync_user_profile_type()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.user_profiles SET user_type = NEW.user_type WHERE user_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_user_profile_type ON public.users;
CREATE TRIGGER trg_sync_user_profile_type
AFTER UPDATE OF user_type ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_user_profile_type();

-- 6. ADMIN RLS UPDATES
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.user_profiles;
CREATE POLICY "Admins can see all profiles" ON public.user_profiles
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_type = 'admin')
);

DROP POLICY IF EXISTS "Admins can see all service_providers" ON public.service_providers;
CREATE POLICY "Admins can see all service_providers" ON public.service_providers
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_type = 'admin')
);

DROP POLICY IF EXISTS "Admins can see all bookings" ON public.bookings;
CREATE POLICY "Admins can see all bookings" ON public.bookings
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_type = 'admin')
);

DROP POLICY IF EXISTS "Admins can see all earnings" ON public.worker_earnings;
CREATE POLICY "Admins can see all earnings" ON public.worker_earnings
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_type = 'admin')
);

-- Notify PostgREST of the new join paths
COMMENT ON CONSTRAINT fk_service_providers_profile ON public.service_providers IS 'Join to user profiles';
COMMENT ON CONSTRAINT fk_bookings_customer_profile ON public.bookings IS 'Direct join to customer profiles';
COMMENT ON CONSTRAINT fk_bookings_provider_record ON public.bookings IS 'Direct join to provider business records';
