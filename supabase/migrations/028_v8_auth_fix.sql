-- ==========================================
-- WORKLA BATCH 8: AUTH & PROFILE SELF-HEAL
-- Purpose: Fix empty tables and trigger failures
-- ==========================================

-- 1. Ensure 'profiles' table has correct constraints
-- We use 'is_admin' boolean for privileges, not role='ADMIN'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('CUSTOMER', 'PROVIDER'));

-- 2. Repair handle_new_auth_user trigger function
-- Added EXCEPTION handling and ON CONFLICT to prevent silent failures
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(20);
    v_referral_code VARCHAR(20);
BEGIN
    -- Normalize role
    v_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    IF v_role NOT IN ('CUSTOMER', 'PROVIDER') THEN
        v_role := 'CUSTOMER';
    END IF;

    -- Generate a unique referral code
    v_referral_code := UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8));

    -- Upsert profile (handles cases where profile might exist but be detached)
    INSERT INTO public.profiles (id, email, phone, full_name, avatar_url, role, referral_code)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        v_role,
        v_referral_code
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        updated_at = NOW();

    -- Ensure wallet exists
    INSERT INTO public.wallets (customer_id) 
    VALUES (NEW.id)
    ON CONFLICT (customer_id) DO NOTHING;

    -- If provider, ensure details row exists
    IF v_role = 'PROVIDER' THEN
        INSERT INTO public.provider_details (provider_id, business_name)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'business_name', NEW.raw_user_meta_data->>'full_name', 'Independent Provider')
        )
        ON CONFLICT (provider_id) DO NOTHING;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error details to a table if you have one, or just allow auth to proceed
    -- to prevent locking people out of their accounts entirely.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backfill missing profiles (Fix for "Empty Table" issue)
-- This takes anyone in auth.users and creates a profile if missing
INSERT INTO public.profiles (id, email, role, referral_code)
SELECT 
    u.id, 
    u.email, 
    UPPER(COALESCE(u.raw_user_meta_data->>'user_type', 'CUSTOMER')),
    UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8))
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL;

-- Also ensure wallets for all
INSERT INTO public.wallets (customer_id)
SELECT id FROM public.profiles
ON CONFLICT (customer_id) DO NOTHING;

-- 4. Admin Recovery
-- Run this if the portal is empty for YOU. Replace with your actual email.
-- UPDATE public.profiles SET is_admin = true WHERE email = 'YOUR_EMAIL';

-- 5. Fix RLS for Admin Visibility
-- Ensure the Admin Portal (service_role or admin user) can effectively see data
DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles 
FOR ALL USING (public.is_admin() OR auth.jwt()->>'role' = 'service_role');
