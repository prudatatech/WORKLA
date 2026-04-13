-- ==============================================================
-- Migration: 075_cancellation_policy.sql
-- Description: Implements ultra-gentle, commitment-based cancellation penalties.
-- ==============================================================

-- 1. Helper Function: Calculate Cancellation Penalty
CREATE OR REPLACE FUNCTION public.calculate_cancellation_penalty(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_booking RECORD;
    v_en_route_time TIMESTAMPTZ;
    v_penalty_amount DECIMAL(12,2) := 0;
    v_reason TEXT := 'Free Cancellation';
    v_is_grace_period BOOLEAN := false;
BEGIN
    -- Fetch booking status and basic details
    SELECT status, total_amount, provider_id, customer_id 
    INTO v_booking 
    FROM public.bookings 
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('penalty', 0, 'reason', 'Booking not found');
    END IF;

    -- Phase 1: Zero Pressure (FREE)
    -- If status is requested, searching, or confirmed, it's always free.
    IF v_booking.status IN ('requested', 'searching', 'confirmed') THEN
        RETURN jsonb_build_object('penalty', 0, 'reason', 'Free: Provider hasn''t started travel.');
    END IF;

    -- Phase 2: Travel Grace Period (FREE for 5 mins)
    IF v_booking.status = 'en_route' THEN
        -- Find when it moved to en_route
        SELECT created_at INTO v_en_route_time
        FROM public.booking_status_history
        WHERE booking_id = p_booking_id AND new_status = 'en_route'
        ORDER BY created_at DESC LIMIT 1;

        IF v_en_route_time IS NOT NULL AND (NOW() - v_en_route_time) < INTERVAL '5 minutes' THEN
            RETURN jsonb_build_object(
                'penalty', 0, 
                'reason', 'Free: 5-minute travel grace period.',
                'grace_remaining_seconds', 300 - EXTRACT(EPOCH FROM (NOW() - v_en_route_time))
            );
        ELSE
            -- Phase 3: Commitment Penalty (₹100)
            RETURN jsonb_build_object('penalty', 100, 'reason', 'Commitment Fee: Provider is en route.');
        END IF;
    END IF;

    -- Phase 4: Site Arrival Penalty (₹150)
    IF v_booking.status = 'arrived' THEN
        RETURN jsonb_build_object('penalty', 150, 'reason', 'Arrival Fee: Provider is already at your location.');
    END IF;

    -- In-progress or beyond cannot be cancelled via standard flow (usually handled via disputes)
    IF v_booking.status IN ('in_progress', 'completed', 'disputed') THEN
        RETURN jsonb_build_object('penalty', 0, 'reason', 'Standard cancellation not applicable in current state.');
    END IF;

    RETURN jsonb_build_object('penalty', 0, 'reason', 'No penalty applicable.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update update_booking_status_hardened_rpc to handle cancellation ledgering
-- Note: We are REDEFINING the function from 072/backend-migrations to include penalty logic.
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
            (booking_id, reference_id, account_name, amount, side, transaction_type, description, scheduled_date)
          VALUES 
            (p_booking_id, v_payment_id, v_source_acct, v_penalty_amt, 'debit', 'CANCELLATION_PENALTY', 'Ref: ' || v_booking.booking_number, v_booking.scheduled_date);

          -- LEDGER: Credit Platform & Provider (Simplified: 50/50 split of the penalty)
          -- Credit Platform Revenue
          INSERT INTO public.financial_ledger 
            (booking_id, reference_id, account_name, amount, side, transaction_type, description, scheduled_date)
          VALUES 
            (p_booking_id, v_payment_id, 'PLATFORM_REVENUE_EQUITY', v_penalty_amt * 0.4, 'credit', 'CANCELLATION_PENALTY', 'Platform share', v_booking.scheduled_date);
          
          -- Credit Provider Payable
          IF v_booking.provider_id IS NOT NULL THEN
            INSERT INTO public.financial_ledger 
              (booking_id, reference_id, account_name, amount, side, transaction_type, description, scheduled_date)
            VALUES 
              (p_booking_id, v_payment_id, 'PROVIDER_PAYABLE_LIABILITY', v_penalty_amt * 0.6, 'credit', 'CANCELLATION_PENALTY', 'Provider compensation', v_booking.scheduled_date);
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

  -- 5. Audit Trail Update (History is handled by separate trigger, we just link user_id)
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
