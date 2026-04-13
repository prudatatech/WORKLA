-- ==============================================================
-- PHASE 22: ADMIN BOOLEAN TOGGLE MIGRATION
-- Migration from role-based text to boolean toggle.
-- ==============================================================

-- 1. Add is_admin column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. Backfill is_admin based on existing role
UPDATE public.profiles SET is_admin = true WHERE role = 'ADMIN';

-- 3. Update the handle_new_auth_user trigger to use the new is_admin logic
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    passed_role VARCHAR(20);
    is_admin_flag BOOLEAN := false;
BEGIN
    -- Extract role from raw_user_meta_data if passed during signup. Default to CUSTOMER.
    passed_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    
    -- Enforce strict enum values
    IF passed_role NOT IN ('ADMIN', 'CUSTOMER', 'PROVIDER') THEN
        passed_role := 'CUSTOMER';
    END IF;

    -- Special auto-admin rule for your emails
    IF NEW.email LIKE '%admin%' THEN
        is_admin_flag := true;
        passed_role := 'ADMIN'; -- Keep role as ADMIN for legacy reasons if needed, but is_admin is the source of truth now
    END IF;

    -- If the passed role was ADMIN, set the flag
    IF passed_role = 'ADMIN' THEN
        is_admin_flag := true;
        passed_role := 'CUSTOMER'; -- Reset role to CUSTOMER to keep things clean, or keep it. Let's keep it for compatibility.
    END IF;

    INSERT INTO public.profiles (id, email, phone, full_name, avatar_url, role, is_admin)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        passed_role,
        is_admin_flag
    );
    
    -- If provider, also instantiate their details
    IF passed_role = 'PROVIDER' THEN
        INSERT INTO public.provider_details (provider_id, business_name)
        VALUES (
            NEW.id, 
            COALESCE(NEW.raw_user_meta_data->>'business_name', NEW.raw_user_meta_data->>'full_name', 'Independent Provider')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update is_admin() helper function to use the boolean column
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    );
$$;

-- 5. Update profiles CHECK constraint to prevent 'ADMIN' from being used in role if desired
-- (Optional: Keeping 'ADMIN' role for now to avoid breaking existing code, but is_admin is the check)

-- Done! Now you can toggle 'is_admin' true/false in the Supabase UI.
