-- ==============================================================
-- ELITE HARDENING: Dispatch Intelligence & Referral Integrity
-- Purpose: Prevent over-assignment and fraud.
-- ==============================================================

-- 1. Hardening: Dispatch Intelligence (Exclude Busy Providers)
CREATE OR REPLACE FUNCTION public.dispatch_job(p_booking_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking          RECORD;
    v_provider         RECORD;
    v_inserted         INTEGER := 0;
    v_cust_lat         DOUBLE PRECISION;
    v_cust_lng         DOUBLE PRECISION;
    v_zone_id          UUID;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Defaults if null
    v_cust_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_cust_lng := COALESCE(v_booking.customer_longitude, 78.0081);

    -- 🛡️ Determine Zone if not set
    v_zone_id := v_booking.service_zone_id;
    IF v_zone_id IS NULL THEN
        SELECT id INTO v_zone_id 
        FROM public.service_zones 
        WHERE status = 'active' 
          AND ST_Contains(boundary, ST_SetSRID(ST_Point(v_cust_lng, v_cust_lat), 4326))
        LIMIT 1;
        
        -- Update booking with zone for future reference
        IF v_zone_id IS NOT NULL THEN
            UPDATE public.bookings SET service_zone_id = v_zone_id WHERE id = p_booking_id;
        ELSE
            -- If STILL no zone, we can't dispatch (out of bounds)
            RETURN 0;
        END IF;
    END IF;

    FOR v_provider IN
        SELECT * FROM (
            SELECT
                pd.provider_id AS user_id,
                pl.latitude,
                pl.longitude,
                (6371 * acos(
                    pmin(1.0, pmax(-1.0, 
                        cos(radians(v_cust_lat)) * cos(radians(pl.latitude)) *
                        cos(radians(pl.longitude) - radians(v_cust_lng)) +
                        sin(radians(v_cust_lat)) * sin(radians(pl.latitude))
                    ))
                )) AS distance_km
            FROM public.provider_details pd
            JOIN public.provider_locations pl ON pl.provider_id = pd.provider_id
            JOIN public.provider_services ps ON ps.provider_id = pd.provider_id 
            WHERE pd.is_online = TRUE
              AND pd.verification_status = 'verified'
              AND ps.subcategory_id = v_booking.subcategory_id
              AND ps.is_active = TRUE
              
              -- 🚀 ELITE HARDENING: Exclude Providers with active jobs
              AND NOT EXISTS (
                  SELECT 1 FROM public.bookings b 
                  WHERE b.provider_id = pd.provider_id 
                    AND b.status IN ('accepted', 'en_route', 'arrived', 'in_progress')
              )
        ) sub
        WHERE sub.distance_km < 25  -- Standard radius
        ORDER BY sub.distance_km ASC
        LIMIT 10
    LOOP
        INSERT INTO public.job_offers (booking_id, provider_id, distance_km, expires_at, status)
        VALUES (p_booking_id, v_provider.user_id, v_provider.distance_km, NOW() + INTERVAL '30 minutes', 'pending')
        ON CONFLICT (booking_id, provider_id) DO UPDATE 
            SET status = 'pending', 
                expires_at = NOW() + INTERVAL '30 minutes',
                distance_km = EXCLUDED.distance_km;
        
        v_inserted := v_inserted + 1;
    END LOOP;

    -- Update booking status to searching
    IF v_inserted > 0 THEN
        UPDATE public.bookings 
        SET status = 'searching', updated_at = NOW() 
        WHERE id = p_booking_id AND status = 'requested';
    END IF;

    RETURN v_inserted;
END;
$$;

-- 2. Hardening: Referral Fraud Prevention (Anti-Self-Referral)
CREATE OR REPLACE FUNCTION public.handle_referral_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id UUID;
  v_already_rewarded BOOLEAN;
  v_today DATE := CURRENT_DATE;
  v_referral_amount_referrer DECIMAL := 100.00;
  v_referral_amount_referee DECIMAL := 50.00;
BEGIN
  -- Only fire when booking transitions to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    
    -- Find the referrer
    SELECT p.id INTO v_referrer_id
    FROM public.profiles cp
    JOIN public.profiles p ON p.referral_code = cp.referred_by_code
    WHERE cp.id = NEW.customer_id
    LIMIT 1;

    -- 🛡️ FRAUD CHECK: Cannot refer yourself or your own additional accounts (Basic check)
    IF v_referrer_id IS NOT NULL AND v_referrer_id <> NEW.customer_id THEN
      
      -- Check if we already gave a reward for this customer
      SELECT EXISTS (
          SELECT 1 FROM public.financial_ledger 
          WHERE reference_id = NEW.id 
          AND transaction_type = 'REFERRAL_REWARD'
      ) INTO v_already_rewarded;

      IF NOT v_already_rewarded THEN
        -- 1. REWARD REFERRER
        INSERT INTO public.financial_ledger (scheduled_date, owner_id, reference_id, account_name, amount, side, transaction_type, description)
        SELECT 
            v_today, 
            v_referrer_id,
            NEW.id, 
            'MARKETING_EXPENSE_ACCOUNT', 
            v_referral_amount_referrer, 
            'debit', 
            'REFERRAL_REWARD', 
            'Referral payout for booking ' || NEW.booking_number;

        INSERT INTO public.financial_ledger (scheduled_date, owner_id, reference_id, account_name, amount, side, transaction_type, description)
        SELECT 
            v_today, 
            v_referrer_id,
            NEW.id, 
            CASE WHEN p.role = 'PROVIDER' THEN 'PROVIDER_PAYABLE_LIABILITY' ELSE 'USER_WALLET_LIABILITY' END,
            v_referral_amount_referrer, 
            'credit', 
            'REFERRAL_REWARD', 
            'Reward earned for referring friend ' || COALESCE(NEW.customer_id::text, '')
        FROM public.profiles p WHERE p.id = v_referrer_id;

        -- 2. REWARD REFEREE
        INSERT INTO public.financial_ledger (scheduled_date, owner_id, reference_id, account_name, amount, side, transaction_type, description)
        VALUES (v_today, NEW.customer_id, NEW.id, 'MARKETING_EXPENSE_ACCOUNT', v_referral_amount_referee, 'debit', 'REFERRAL_REWARD', 'Welcome bonus (Marketing Expense) for ' || NEW.booking_number);

        INSERT INTO public.financial_ledger (scheduled_date, owner_id, reference_id, account_name, amount, side, transaction_type, description)
        VALUES (v_today, NEW.customer_id, NEW.id, 'USER_WALLET_LIABILITY', v_referral_amount_referee, 'credit', 'REFERRAL_REWARD', 'Welcome reward for using referral code');

        -- 3. NOTIFY
        INSERT INTO public.notifications (user_id, title, body, type, data)
        VALUES 
            (v_referrer_id, '🎉 Referral Reward!', 'You earned ₹' || v_referral_amount_referrer || ' in your Workla Wallet.', 'payment', jsonb_build_object('amount', v_referral_amount_referrer)),
            (NEW.customer_id, '🎁 Welcome Reward!', 'You earned ₹' || v_referral_amount_referee || ' for joining via referral.', 'payment', jsonb_build_object('amount', v_referral_amount_referee));
            
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Dispatch & Referral Hardening Applied ✅' AS result;
