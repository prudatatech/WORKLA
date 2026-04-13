-- ==========================================
-- Workla Phase 17: Ecosystem Separation
-- Purpose: Strictly separate Customers and Providers at the DB level
-- ==========================================

-- 1. Add user_type to user_profiles
ALTER TABLE IF EXISTS public.user_profiles 
ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) CHECK (user_type IN ('customer', 'provider', 'admin')) DEFAULT 'customer';

-- 2. Update handle_new_user function (Trigger on auth.users)
-- This is critical to capture user_type during signup
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

-- 3. Backfill existing data based on established relationships
-- First, mark everyone as provider if they have a record in service_providers
UPDATE public.user_profiles
SET user_type = 'provider'
WHERE user_id IN (SELECT user_id FROM public.service_providers);

-- Second, mark as admin if they have the role in the 'users' table (secondary check)
UPDATE public.user_profiles up
SET user_type = u.user_type
FROM public.users u
WHERE up.user_id = u.id AND u.user_type = 'admin';

-- 4. Create Trigger Function to keep user_type in sync from public.users updates
CREATE OR REPLACE FUNCTION public.sync_user_profile_type()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.user_profiles
    SET user_type = NEW.user_type
    WHERE user_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create Trigger on public.users
DROP TRIGGER IF EXISTS trg_sync_user_profile_type ON public.users;
CREATE TRIGGER trg_sync_user_profile_type
AFTER UPDATE OF user_type ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_profile_type();

-- 6. Update RLS for Admin management
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.user_profiles;
CREATE POLICY "Admins can see all profiles" ON public.user_profiles
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_type = 'admin')
);
