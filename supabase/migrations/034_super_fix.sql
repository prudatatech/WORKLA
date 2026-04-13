-- ===================================================
-- WORKLA SUPER FIX (NUCLEAR ROLE SEPARATION)
-- Resolves: 
-- 1. Providers mixed with Customers
-- 2. "Empty" lists due to RLS
-- 3. Missing Email/Phone in Profile
-- ===================================================

-- 1. TABLE ENHANCEMENTS
ALTER TABLE IF EXISTS public.user_profiles 
ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) CHECK (user_type IN ('customer', 'provider', 'admin')) DEFAULT 'customer',
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(255);

-- 2. NUCLEAR BACKFILL (Force Separation)
-- 2a. Promote anybody with 'admin' in their email to admin (Emergency)
UPDATE public.user_profiles SET user_type = 'admin' 
WHERE email LIKE '%admin%' OR user_id IN (SELECT id FROM auth.users WHERE email LIKE '%admin%');

-- 2b. Force anybody in service_providers to be 'provider' and ONLY 'provider'
UPDATE public.user_profiles SET user_type = 'provider'
WHERE user_id IN (SELECT user_id FROM public.service_providers);

-- 2c. Force everyone else (who isn't admin or provider) to be 'customer'
UPDATE public.user_profiles SET user_type = 'customer'
WHERE user_type NOT IN ('admin') 
AND user_id NOT IN (SELECT user_id FROM public.service_providers);

-- 3. FAIL-SAFE RLS (Using SECURITY DEFINER to bypass recursion)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE user_id = auth.uid() AND user_type = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply policies
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.user_profiles;
CREATE POLICY "Admins can see all profiles" ON public.user_profiles
FOR SELECT USING ( public.check_is_admin() OR auth.uid() = user_id );

DROP POLICY IF EXISTS "Admins can see all service_providers" ON public.service_providers;
CREATE POLICY "Admins can see all service_providers" ON public.service_providers
FOR SELECT USING ( public.check_is_admin() OR auth.uid() = user_id );

DROP POLICY IF EXISTS "Admin full access to service_providers" ON public.service_providers;
CREATE POLICY "Admin full access to service_providers" ON public.service_providers
FOR ALL USING ( public.check_is_admin() );

-- 4. RELATIONSHIP REPAIR
ALTER TABLE public.service_providers DROP CONSTRAINT IF EXISTS fk_service_providers_profile;
ALTER TABLE public.service_providers ADD CONSTRAINT fk_service_providers_profile 
FOREIGN KEY (user_id) REFERENCES public.user_profiles(user_id) ON DELETE CASCADE;

-- 5. TRIGGER (Consistency)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, full_name, avatar_url, user_type, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer'),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    user_type = EXCLUDED.user_type,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. EMERGENCY SELF-PROMOTION (Run this specifically for yourself)
-- Replace the email with your logged-in admin email
-- UPDATE public.user_profiles SET user_type = 'admin' WHERE email = 'YOUR_ADMIN_EMAIL';

-- 7. POSTGREST HINTS
COMMENT ON CONSTRAINT fk_service_providers_profile ON public.service_providers IS 'Join to user profiles';
