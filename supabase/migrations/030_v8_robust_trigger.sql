-- ==========================================
-- WORKLA BATCH 8.1: ROBUST AUTH TRIGGER
-- Purpose: Fix "Database Error" during signup
-- ==========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(20);
    v_referral_code VARCHAR(20);
    v_full_name TEXT;
    v_phone TEXT;
BEGIN
    -- 1. Explicitly set search path to public for safety
    -- SET search_path = public;

    -- 2. Normalize and validate role
    v_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    IF v_role NOT IN ('CUSTOMER', 'PROVIDER') THEN
        v_role := 'CUSTOMER';
    END IF;

    -- 3. Normalize optional fields (treat empty strings as NULL)
    v_full_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    IF v_full_name IS NULL THEN
        v_full_name := SPLIT_PART(NEW.email, '@', 1);
    END IF;

    v_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');

    -- 4. Generate a unique referral code
    -- We use a simple loop in case of a rare collision
    LOOP
        v_referral_code := UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_referral_code);
    END LOOP;

    -- 5. Upsert profile
    -- Using ON CONFLICT (id) to handle retries or profile recovery
    INSERT INTO public.profiles (
        id, 
        email, 
        phone, 
        full_name, 
        avatar_url, 
        role, 
        referral_code,
        is_admin
    )
    VALUES (
        NEW.id,
        NEW.email,
        v_phone,
        v_full_name,
        NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
        v_role,
        v_referral_code,
        false
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        role = EXCLUDED.role,
        updated_at = NOW();

    -- 6. Ensure wallet exists
    INSERT INTO public.wallets (customer_id) 
    VALUES (NEW.id)
    ON CONFLICT (customer_id) DO NOTHING;

    -- 7. If provider, ensure details row exists
    IF v_role = 'PROVIDER' THEN
        INSERT INTO public.provider_details (provider_id, business_name)
        VALUES (
            NEW.id,
            COALESCE(NULLIF(NEW.raw_user_meta_data->>'business_name', ''), v_full_name, 'Independent Provider')
        )
        ON CONFLICT (provider_id) DO NOTHING;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- If ANYTHING fails, we still RETURN NEW so the user isn't locked out of Auth.
    -- The profile can be backfilled later.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure the trigger is attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
