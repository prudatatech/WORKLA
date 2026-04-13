-- ==========================================
-- Workla Phase 16: Financial & Logistics Bridge
-- Purpose: Connect Payments, Wallets, and Earnings into a single high-trust flow.
-- ==========================================

-- 1. Automatic Wallet Credit on Payment Capture
-- When a payment is marked as 'captured' (via Razorpay Bridge), 
-- we should potentially move it to provider's wallet if it's a direct payment.
CREATE OR REPLACE FUNCTION public.handle_captured_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
BEGIN
    IF NEW.status = 'captured' AND OLD.status != 'captured' THEN
        -- Find provider's wallet
        SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = NEW.provider_id;
        
        IF v_wallet_id IS NOT NULL THEN
            -- Record wallet transaction
            INSERT INTO public.wallet_transactions (wallet_id, amount, transaction_type, reference_type, reference_id, description)
            VALUES (v_wallet_id, NEW.amount, 'credit', 'payment', NEW.id, 'Job payment received');
            
            -- Update wallet balance
            UPDATE public.wallets SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = v_wallet_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_captured_payment ON public.payments;
CREATE TRIGGER trg_captured_payment
    AFTER UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_captured_payment();

-- 2. Enhanced Dispatch Engine (Consolidated)
-- Uses customer_latitude/longitude and checks subcategory matching.
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
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    
    -- Use the correct columns from the modern schema
    v_cust_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_cust_lng := COALESCE(v_booking.customer_longitude, 78.0081);

    FOR v_provider IN
        SELECT
            sp.user_id,
            pl.latitude,
            pl.longitude,
            (6371 * acos(
                cos(radians(v_cust_lat)) * cos(radians(pl.latitude)) *
                cos(radians(pl.longitude) - radians(v_cust_lng)) +
                sin(radians(v_cust_lat)) * sin(radians(pl.latitude))
            )) AS distance_km
        FROM public.service_providers sp
        JOIN public.provider_locations pl ON pl.provider_id = sp.user_id
        JOIN public.provider_services ps ON ps.provider_id = sp.user_id 
        WHERE sp.is_available = TRUE
          AND sp.verification_status = 'approved'
          AND ps.subcategory_id = v_booking.subcategory_id
          AND ps.is_active = TRUE
        HAVING (6371 * acos(
                cos(radians(v_cust_lat)) * cos(radians(pl.latitude)) *
                cos(radians(pl.longitude) - radians(v_cust_lng)) +
                sin(radians(v_cust_lat)) * sin(radians(pl.latitude))
            )) < 25 -- Expanded radius for super-app scale
        ORDER BY distance_km ASC
        LIMIT 10
    LOOP
        INSERT INTO public.job_offers (booking_id, provider_id, distance_km, expires_at)
        VALUES (p_booking_id, v_provider.user_id, v_provider.distance_km, NOW() + INTERVAL '60 seconds')
        ON CONFLICT (booking_id, provider_id) DO NOTHING;
        v_inserted := v_inserted + 1;
    END LOOP;

    UPDATE public.bookings SET status = 'requested', updated_at = NOW() WHERE id = p_booking_id;
    RETURN v_inserted;
END;
$$;

-- 3. Notification for Provider on New Payment (Optional but Premium)
-- Handled by the wallet credit logic above.
