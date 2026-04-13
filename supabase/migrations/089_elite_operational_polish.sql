-- ==============================================================
-- ELITE HARDENING: Operational Polish & Resilience
-- Purpose: Fix ledger edge cases and implement marketplace auto-expiry.
-- ==============================================================

-- 1. FIX: Ledger Imbalance in Cancellation Penalty
-- If a provider is not assigned (rare for en_route/arrived), platform absorbs the full penalty.
CREATE OR REPLACE FUNCTION update_booking_status_hardened_rpc(
  p_booking_id UUID,
  p_new_status VARCHAR,
  p_user_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_penalty_data JSONB;
  v_penalty_amt DECIMAL(12,2) := 0;
  v_source_acct VARCHAR(50);
  v_payment_id UUID;
  v_payment_method VARCHAR(50);
BEGIN
  -- 1. Fetch and Lock Booking
  SELECT id, status, provider_id, customer_id, total_amount, booking_number, scheduled_date 
  INTO v_booking
  FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Booking not found.');
  END IF;

  -- 2. State Machine Validation
  IF (v_booking.status = 'requested' AND p_new_status NOT IN ('searching', 'confirmed', 'cancelled')) OR
     (v_booking.status = 'searching' AND p_new_status NOT IN ('confirmed', 'cancelled')) OR
     (v_booking.status = 'confirmed' AND p_new_status NOT IN ('en_route', 'cancelled')) OR
     (v_booking.status = 'en_route' AND p_new_status NOT IN ('arrived', 'cancelled')) OR
     (v_booking.status = 'arrived' AND p_new_status NOT IN ('in_progress', 'cancelled')) OR
     (v_booking.status = 'in_progress' AND p_new_status NOT IN ('completed', 'disputed')) OR
     (v_booking.status = 'disputed' AND p_new_status NOT IN ('completed', 'cancelled')) OR
     (v_booking.status IN ('completed', 'cancelled')) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'code', 'ILLEGAL_TRANSITION', 
        'message', 'Cannot move booking from ' || v_booking.status || ' to ' || p_new_status || '.'
      );
  END IF;

  -- Ensure we aren't transitioning to the identical state
  IF v_booking.status = p_new_status THEN
      RETURN jsonb_build_object('success', true, 'booking', jsonb_build_object('id', p_booking_id, 'status', v_booking.status));
  END IF;

  -- 3. HANDLE CANCELLATION PENALTY LEDGERING
  IF p_new_status = 'cancelled' THEN
      v_penalty_data := public.calculate_cancellation_penalty(p_booking_id);
      v_penalty_amt := (v_penalty_data->>'penalty')::DECIMAL;

      IF v_penalty_amt > 0 THEN
          -- Identify payment source for the penalty
          SELECT id, method INTO v_payment_id, v_payment_method 
          FROM public.payments 
          WHERE booking_id = p_booking_id 
          ORDER BY created_at DESC LIMIT 1;

          CASE 
              WHEN v_payment_method = 'wallet' THEN v_source_acct := 'USER_WALLET_LIABILITY';
              WHEN v_payment_method = 'online' OR v_payment_method = 'razorpay' THEN v_source_acct := 'BANK_RAZORPAY_ASSET';
              ELSE v_source_acct := 'USER_WALLET_LIABILITY'; -- Fallback to wallet debit if cash
          END CASE;

          -- LEDGER: Debit User (Penalty)
          INSERT INTO public.financial_ledger 
            (booking_id, reference_id, account_name, amount, side, transaction_type, description, scheduled_date, owner_id)
          VALUES 
            (p_booking_id, v_payment_id, v_source_acct, v_penalty_amt, 'debit', 'CANCELLATION_PENALTY', 'Ref: ' || v_booking.booking_number, v_booking.scheduled_date, v_booking.customer_id);

          -- LEDGER: Credit Platform & Provider
          IF v_booking.provider_id IS NOT NULL THEN
            -- Standard Split: 40% Platform, 60% Provider
            INSERT INTO public.financial_ledger 
              (booking_id, reference_id, account_name, amount, side, transaction_type, description, scheduled_date, owner_id)
            VALUES 
              (p_booking_id, v_payment_id, 'PLATFORM_REVENUE_EQUITY', v_penalty_amt * 0.4, 'credit', 'CANCELLATION_PENALTY', 'Platform share', v_booking.scheduled_date, NULL),
              (p_booking_id, v_payment_id, 'PROVIDER_PAYABLE_LIABILITY', v_penalty_amt * 0.6, 'credit', 'CANCELLATION_PENALTY', 'Provider compensation', v_booking.scheduled_date, v_booking.provider_id);
          ELSE
            -- 🛡️ ELITE FIX: Platform takes 100% if no provider was assigned to prevent ledger leak
            INSERT INTO public.financial_ledger 
              (booking_id, reference_id, account_name, amount, side, transaction_type, description, scheduled_date, owner_id)
            VALUES 
              (p_booking_id, v_payment_id, 'PLATFORM_REVENUE_EQUITY', v_penalty_amt, 'credit', 'CANCELLATION_PENALTY', 'Platform share (Full - No provider assigned)', v_booking.scheduled_date, NULL);
          END IF;
      END IF;
  END IF;

  -- 4. Atomic Database Update
  UPDATE bookings
  SET
    status = p_new_status,
    updated_at = v_now,
    cancellation_reason = COALESCE(p_cancellation_reason, cancellation_reason),
    started_at = CASE WHEN p_new_status = 'in_progress' THEN v_now ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'completed' THEN v_now ELSE completed_at END,
    cancelled_by = CASE WHEN p_new_status = 'cancelled' THEN p_user_id::varchar ELSE cancelled_by END
  WHERE id = p_booking_id;

  -- 5. Audit Trail Update (History is handled by separate trigger)
  UPDATE booking_status_history
  SET changed_by = p_user_id, note = COALESCE(p_cancellation_reason, note)
  WHERE booking_id = p_booking_id 
    AND old_status = v_booking.status 
    AND new_status = p_new_status 
    AND changed_by IS NULL;

  RETURN jsonb_build_object(
    'success', true, 
    'booking', jsonb_build_object('id', p_booking_id, 'status', p_new_status, 'penalty_applied', v_penalty_amt)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Marketplace Resilience: Auto-Expire Stale Searches
-- If a booking stays in 'searching' for more than 4 hours, auto-cancel it.
CREATE OR REPLACE FUNCTION public.marketplace_auto_cleanup()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.bookings
    SET status = 'cancelled', 
        cancellation_reason = 'Marketplace Timeout: No providers accepted the job within 4 hours.',
        cancelled_by = 'system',
        updated_at = NOW()
    WHERE status = 'searching'
      AND created_at < NOW() - INTERVAL '4 hours';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- 3. Audit Enhancements: Denormalized Actor Info in booking_events
-- Adding actor_name to booking_events so admins can see WHO did WHAT without complex joins.
ALTER TABLE public.booking_events ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255);

CREATE OR REPLACE FUNCTION public.log_booking_event()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_name VARCHAR(255);
BEGIN
    -- Resolve actor name for audit readability
    SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

    IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.booking_events (booking_id, scheduled_date, actor_id, actor_name, event_type, old_value, new_value)
        VALUES (NEW.id, NEW.scheduled_date, auth.uid(), v_actor_name, 'status_change', OLD.status, NEW.status);
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.booking_events (booking_id, scheduled_date, actor_id, actor_name, event_type, new_value)
        VALUES (NEW.id, NEW.scheduled_date, auth.uid(), v_actor_name, 'booking_created', NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Utility: Marketplace Health Snapshot (Extended)
CREATE OR REPLACE VIEW public.marketplace_efficiency_index AS
SELECT 
    AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at)) / 60)::DECIMAL(10,2) AS avg_match_time_mins,
    COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0) AS fulfillment_rate_pct,
    COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'system') AS systemic_timeouts
FROM public.bookings
WHERE created_at > NOW() - INTERVAL '30 days';

NOTIFY pgrst, 'reload schema';

SELECT 'Elite Operational Polish Applied ✅' AS result;
