-- ==============================================================
-- WORKLA BATCH 73: MOBILE-FIRST OTP AUTH TRIGGER REFINEMENT
-- Purpose: Ensure profiles capture phone numbers and handle NULL emails
-- ==============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(20);
    v_full_name TEXT;
    v_referral_code VARCHAR(20);
    v_phone TEXT;
BEGIN
    -- 1. Standardize role from metadata
    v_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    IF v_role NOT IN ('CUSTOMER', 'PROVIDER') THEN
        v_role := 'CUSTOMER';
    END IF;

    -- 2. Capture phone from auth.users (important for OTP signups)
    v_phone := NEW.phone;
    IF v_phone IS NULL THEN
        v_phone := NEW.raw_user_meta_data->>'phone';
    END IF;

    -- 3. Infer friendly name
    v_full_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    IF v_full_name IS NULL THEN
        IF NEW.email IS NOT NULL THEN
            v_full_name := SPLIT_PART(NEW.email, '@', 1);
        ELSIF v_phone IS NOT NULL THEN
            -- Masked phone like "User ...1234"
            v_full_name := 'User ' || SUBSTRING(v_phone, GREATEST(1, LENGTH(v_phone) - 3));
        ELSE
            v_full_name := 'Workla User';
        END IF;
    END IF;

    -- 4. Generate referral code
    v_referral_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));

    -- 5. Upsert profile with phone support
    INSERT INTO public.profiles (
        id, 
        email, 
        phone,
        role, 
        full_name, 
        referral_code, 
        is_admin
    ) VALUES (
        NEW.id, 
        NEW.email, 
        v_phone,
        v_role, 
        v_full_name, 
        v_referral_code, 
        false
    ) ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.profiles.email), 
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        role = EXCLUDED.role,
        updated_at = NOW();
        
    -- 6. Force wallet creation (required for bookings/referrals)
    INSERT INTO public.wallets (customer_id) 
    VALUES (NEW.id) 
    ON CONFLICT (customer_id) DO NOTHING;
    
    -- 7. Force provider sub-profile creation
    IF v_role = 'PROVIDER' THEN
        INSERT INTO public.provider_details (provider_id, business_name)
        VALUES (
            NEW.id, 
            COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'business_name'), ''), v_full_name, 'Independent Provider')
        )
        ON CONFLICT (provider_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger if it was dropped (it shouldn't be, but safe to ensure)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
