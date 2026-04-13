-- ══════════════════════════════════════════════════════════════════════════════
-- WORKLA: Addons & Patches Script
-- Run this in Supabase SQL Editor after supabase_v3_nuclear.sql
-- Adds: referral_code, referral_wallet_credit trigger, coupon_usages guard
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add referral_code column to profiles ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

-- ── 2. Auto-generate referral_code on INSERT if not provided ───────────────
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    -- Generate an 8-char uppercase alphanumeric code
    NEW.referral_code := UPPER(
      LEFT(REPLACE(encode(gen_random_bytes(6), 'base64'), '/', 'X'), 8)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON public.profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_referral_code();

-- ── 3. Backfill referral codes for existing users who don't have one ───────
UPDATE public.profiles
SET referral_code = UPPER(LEFT(REPLACE(encode(gen_random_bytes(6), 'base64'), '/', 'X'), 8))
WHERE referral_code IS NULL;

-- ── 4. Create coupon_usages table if not exists ────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id  UUID REFERENCES public.bookings(id),
  used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (coupon_id, customer_id)  -- one use per customer per coupon
);

-- RLS for coupon_usages
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'coupon_usages' AND policyname = 'Customers view own usages'
  ) THEN
    CREATE POLICY "Customers view own usages" ON public.coupon_usages
      FOR SELECT USING (auth.uid() = customer_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'coupon_usages' AND policyname = 'Customers insert own usage'
  ) THEN
    CREATE POLICY "Customers insert own usage" ON public.coupon_usages
      FOR INSERT WITH CHECK (auth.uid() = customer_id);
  END IF;
END $$;

-- ── 5. Add coupon_id & coupon_discount columns to bookings (if missing) ────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id),
  ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(10,2) DEFAULT 0;

-- ── 6. Wallet auto-credit trigger: when a referred user completes first booking
-- credits referrer ₹100 and referee ₹50 (as wallet_transactions) ──────────
CREATE OR REPLACE FUNCTION public.handle_referral_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  referrer_id UUID;
  already_rewarded BOOLEAN;
BEGIN
  -- Only fire when booking transitions to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Check if this customer was referred
    SELECT p.id INTO referrer_id
    FROM public.profiles cp
    JOIN public.profiles p ON p.referral_code = cp.referred_by_code
    WHERE cp.id = NEW.customer_id
    LIMIT 1;

    IF referrer_id IS NOT NULL THEN
      -- Check if this is the customer's FIRST completed booking
      SELECT COUNT(*) = 1 INTO already_rewarded
      FROM public.bookings
      WHERE customer_id = NEW.customer_id AND status = 'completed';

      IF already_rewarded THEN
        -- Credit referrer ₹100
        INSERT INTO public.wallet_transactions (
          user_id, type, amount, status, description, reference_id
        ) VALUES (
          referrer_id, 'credit', 100.00, 'completed',
          'Referral Reward — Friend completed first booking', NEW.id
        ) ON CONFLICT DO NOTHING;

        -- Credit referee ₹50
        INSERT INTO public.wallet_transactions (
          user_id, type, amount, status, description, reference_id
        ) VALUES (
          NEW.customer_id, 'credit', 50.00, 'completed',
          'Welcome Reward — Joined via referral', NEW.id
        ) ON CONFLICT DO NOTHING;

        -- Create notifications for both
        INSERT INTO public.notifications (user_id, title, body, type)
        VALUES (referrer_id, '🎉 Referral Reward!', 'You earned ₹100 in your Workla Wallet.', 'payment');

        INSERT INTO public.notifications (user_id, title, body, type)
        VALUES (NEW.customer_id, '🎁 Welcome Reward!', 'You earned ₹50 for joining via referral. Check your wallet!', 'payment');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_reward ON public.bookings;
CREATE TRIGGER trg_referral_reward
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_referral_reward();

-- ── 7. Wallet balance view ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.wallet_balance AS
SELECT
  user_id,
  SUM(CASE WHEN type = 'credit'  AND status = 'completed' THEN amount ELSE 0 END)
  - SUM(CASE WHEN type = 'debit' AND status = 'completed' THEN amount ELSE 0 END)
  AS balance
FROM public.wallet_transactions
GROUP BY user_id;

-- ── 8. Grant access ────────────────────────────────────────────────────────
GRANT SELECT ON public.wallet_balance TO authenticated;
GRANT ALL ON public.coupon_usages TO authenticated;

-- ── 9. Avg rating auto-update trigger on ratings table ────────────────────
CREATE OR REPLACE FUNCTION public.update_provider_avg_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_avg NUMERIC;
  job_count INT;
BEGIN
  SELECT
    AVG(rating_score)::NUMERIC(3,2),
    COUNT(*)
  INTO new_avg, job_count
  FROM public.ratings
  WHERE reviewee_id = NEW.reviewee_id;

  UPDATE public.provider_details
  SET
    avg_rating = new_avg,
    total_ratings = job_count
  WHERE provider_id = NEW.reviewee_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_provider_avg_rating ON public.ratings;
CREATE TRIGGER trg_update_provider_avg_rating
  AFTER INSERT OR UPDATE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_provider_avg_rating();

SELECT 'Workla Addons patch applied successfully ✅' AS result;
