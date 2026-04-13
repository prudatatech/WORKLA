-- ==============================================================
-- WORKLA BATCH 8.2: FINAL AUTHENTICATION & SCHEMA REPAIR
-- Purpose: Root-cause fix for "Database Error" during signup
-- ==============================================================

-- 1. SWITCH ALL TABLES FROM uuid_generate_v4() TO gen_random_uuid()
-- (This prevents any "function not found" errors due to missing extensions
-- or search_path overrides during Supabase authentication).
ALTER TABLE public.customer_addresses ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.service_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.services ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.service_subcategories ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.provider_availability ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.provider_services ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.bookings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.booking_status_history ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.payments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.refunds ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.worker_earnings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.ratings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.wallets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.wallet_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.coupons ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.coupon_usages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.support_tickets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.chat_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. DROP POTENTIAL DUPLICATE/CONFLICTING TRIGGERS ON auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

-- 3. REWRITE TRIGGER TO BE BOMB-PROOF
-- No custom exceptions, no search_path conflicts, no loops, fully safe UPSERTS.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role VARCHAR(20);
    v_full_name TEXT;
    v_referral_code VARCHAR(20);
BEGIN
    -- Standardize role
    v_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    IF v_role NOT IN ('CUSTOMER', 'PROVIDER') THEN
        v_role := 'CUSTOMER';
    END IF;

    -- Infer name from email if not provided
    v_full_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
    IF v_full_name IS NULL THEN
        v_full_name := SPLIT_PART(NEW.email, '@', 1);
    END IF;

    -- Generate referral code securely (gen_random_uuid is native to postgres 13+)
    v_referral_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));

    -- Upsert profile (ignoring optional fields that cause constraint errors)
    INSERT INTO public.profiles (
        id, 
        email, 
        role, 
        full_name, 
        referral_code, 
        is_admin
    ) VALUES (
        NEW.id, 
        NEW.email, 
        v_role, 
        v_full_name, 
        v_referral_code, 
        false
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email, 
        role = EXCLUDED.role;
        
    -- Force wallet creation
    INSERT INTO public.wallets (customer_id) 
    VALUES (NEW.id) 
    ON CONFLICT (customer_id) DO NOTHING;
    
    -- Force provider sub-profile creation
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

-- 4. ATTACH THE FRESH TRIGGER
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
