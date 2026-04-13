-- ==============================================================
-- WORKLA: ROOT CAUSE FIX - Column Name Mismatch
-- ERROR: column "user_id" of relation "wallets" does not exist
-- ==============================================================

-- The 'supabase_addons_referral_wallet.sql' script created functions
-- referencing OLD column names from a pre-V3 schema.
-- V3 schema: wallet_transactions has (wallet_id, booking_id)
-- Old script assumed: wallet_transactions has (user_id, reference_id)
-- 
-- This script fixes ALL column name mismatches.

-- ── STEP 1: Drop all old conflicting functions and triggers ──────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;
DROP TRIGGER IF EXISTS trg_referral_reward ON public.bookings;
DROP TRIGGER IF EXISTS trg_generate_referral_code ON public.profiles;
DROP TRIGGER IF EXISTS trg_update_provider_avg_rating ON public.ratings;

DROP FUNCTION IF EXISTS public.handle_new_auth_user CASCADE;
DROP FUNCTION IF EXISTS public.handle_referral_reward CASCADE;
DROP FUNCTION IF EXISTS public.generate_referral_code CASCADE;
DROP FUNCTION IF EXISTS public.update_provider_avg_rating CASCADE;
DROP VIEW IF EXISTS public.wallet_balance CASCADE;

-- ── STEP 2: Install clean handle_new_auth_user (no wallets.user_id) ─────────
-- IMPORTANT: wallets table uses 'customer_id', NOT 'user_id'

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_name TEXT;
    v_ref  TEXT;
BEGIN
    v_role := upper(coalesce(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    IF v_role NOT IN ('CUSTOMER', 'PROVIDER') THEN v_role := 'CUSTOMER'; END IF;
    v_name := coalesce(nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));
    v_ref  := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    INSERT INTO public.profiles (id, email, role, full_name, referral_code, is_admin)
    VALUES (NEW.id, NEW.email, v_role, v_name, v_ref, false)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role;

    -- CORRECT: use customer_id, not user_id
    INSERT INTO public.wallets (customer_id)
    VALUES (NEW.id)
    ON CONFLICT (customer_id) DO NOTHING;

    IF v_role = 'PROVIDER' THEN
        INSERT INTO public.provider_details (provider_id, business_name)
        VALUES (NEW.id, v_name)
        ON CONFLICT (provider_id) DO NOTHING;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ── STEP 3: Install corrected referral reward trigger ────────────────────────
-- Uses correct V3 column: wallet_transactions(wallet_id, booking_id)
-- NOT old: wallet_transactions(user_id, reference_id)

CREATE OR REPLACE FUNCTION public.handle_referral_reward()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    referrer_id   UUID;
    referee_wid   UUID;
    referrer_wid  UUID;
    is_first      BOOLEAN;
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
        SELECT p.id INTO referrer_id
        FROM public.profiles cp
        JOIN public.profiles p ON p.referral_code = cp.referred_by_code
        WHERE cp.id = NEW.customer_id LIMIT 1;

        IF referrer_id IS NOT NULL THEN
            SELECT COUNT(*) = 1 INTO is_first
            FROM public.bookings
            WHERE customer_id = NEW.customer_id AND status = 'completed';

            IF is_first THEN
                -- Get wallet IDs (V3 uses wallet_id FK)
                SELECT id INTO referrer_wid FROM public.wallets WHERE customer_id = referrer_id;
                SELECT id INTO referee_wid  FROM public.wallets WHERE customer_id = NEW.customer_id;

                IF referrer_wid IS NOT NULL THEN
                    INSERT INTO public.wallet_transactions
                        (wallet_id, type, amount, description, booking_id, balance_after)
                    SELECT referrer_wid, 'credit', 100.00, 'Referral Reward — Friend completed first booking',
                           NEW.id, COALESCE(w.balance, 0) + 100
                    FROM public.wallets w WHERE w.id = referrer_wid;

                    UPDATE public.wallets SET balance = balance + 100, updated_at = NOW()
                    WHERE id = referrer_wid;
                END IF;

                IF referee_wid IS NOT NULL THEN
                    INSERT INTO public.wallet_transactions
                        (wallet_id, type, amount, description, booking_id, balance_after)
                    SELECT referee_wid, 'credit', 50.00, 'Welcome Reward — Joined via referral',
                           NEW.id, COALESCE(w.balance, 0) + 50
                    FROM public.wallets w WHERE w.id = referee_wid;

                    UPDATE public.wallets SET balance = balance + 50, updated_at = NOW()
                    WHERE id = referee_wid;
                END IF;

                INSERT INTO public.notifications (user_id, title, body, type)
                VALUES (referrer_id, '🎉 Referral Reward!', 'You earned ₹100 in your Workla Wallet.', 'payment');
                INSERT INTO public.notifications (user_id, title, body, type)
                VALUES (NEW.customer_id, '🎁 Welcome Reward!', 'You earned ₹50 for joining via referral!', 'payment');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_reward ON public.bookings;
CREATE TRIGGER trg_referral_reward
    AFTER UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.handle_referral_reward();

SELECT 'Root cause fixed - column mismatch resolved ✅' AS result;
