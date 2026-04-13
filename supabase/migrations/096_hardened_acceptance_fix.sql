-- ==============================================================
-- FIX: Hardened Status RPC & Acceptance Logic (V2)
-- Consolidation from backend-services and root migrations.
-- Ensures 'searching' status is handled correctly.
-- Fixed column name mismatches (actual_start_time -> started_at, etc.)
-- ==============================================================

-- 1. Hardened Booking Status Update RPC
CREATE OR REPLACE FUNCTION public.update_booking_status_hardened_rpc(
  p_booking_id UUID,
  p_new_status VARCHAR,
  p_user_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL,
  p_proof_url TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Fetch and Lock Booking
  SELECT id, status, provider_id, customer_id INTO v_booking
  FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Booking not found.');
  END IF;

  -- 2. State Machine Validation
  IF (v_booking.status = 'requested' AND p_new_status NOT IN ('searching', 'confirmed', 'cancelled')) OR
     (v_booking.status = 'searching' AND p_new_status NOT IN ('confirmed', 'cancelled')) OR
     (v_booking.status = 'confirmed' AND p_new_status NOT IN ('en_route', 'cancelled')) OR
     (v_booking.status = 'en_route' AND p_new_status NOT IN ('arrived', 'cancelled', 'in_progress')) OR
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

  -- 3. Security Validation: Provider Assignment Lock
  IF p_new_status IN ('en_route', 'arrived', 'in_progress', 'completed') THEN
    IF v_booking.provider_id IS NULL OR v_booking.provider_id != p_user_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_PROVIDER', 'message', 'Only the assigned provider can advance this booking.');
    END IF;
  END IF;

  -- Idempotency safety
  IF v_booking.status = p_new_status THEN
      RETURN jsonb_build_object(
          'success', true, 
          'booking', jsonb_build_object('id', p_booking_id, 'status', v_booking.status, 'provider_id', v_booking.provider_id, 'customer_id', v_booking.customer_id)
      );
  END IF;

  -- 3. Atomic Database Update
  UPDATE bookings
  SET
    status = p_new_status,
    updated_at = v_now,
    cancellation_reason = COALESCE(p_cancellation_reason, cancellation_reason),
    started_at = CASE WHEN p_new_status = 'in_progress' AND started_at IS NULL THEN v_now ELSE started_at END,
    work_proof_start_url = CASE WHEN p_new_status = 'in_progress' AND p_proof_url IS NOT NULL THEN p_proof_url ELSE work_proof_start_url END,
    completed_at = CASE WHEN p_new_status = 'completed' AND completed_at IS NULL THEN v_now ELSE completed_at END,
    work_proof_complete_url = CASE WHEN p_new_status = 'completed' AND p_proof_url IS NOT NULL THEN p_proof_url ELSE work_proof_complete_url END,
    cancelled_by = CASE WHEN p_new_status = 'cancelled' THEN p_user_id::varchar ELSE cancelled_by END
  WHERE id = p_booking_id;

  -- 4. Audit Trail Enrichment
  -- (Assuming booking_status_history table exists and is populated by triggers)
  UPDATE booking_status_history
  SET changed_by = p_user_id, note = p_cancellation_reason
  WHERE booking_id = p_booking_id 
    AND old_status = v_booking.status 
    AND new_status = p_new_status 
    AND changed_by IS NULL;
    
  IF p_new_status = 'cancelled' THEN
    UPDATE job_offers
    SET status = 'expired', responded_at = v_now
    WHERE booking_id = p_booking_id AND status = 'pending';
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'booking', jsonb_build_object(
      'id', p_booking_id,
      'status', p_new_status,
      'provider_id', v_booking.provider_id,
      'customer_id', v_booking.customer_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. HARDENED Job Acceptance RPC (Atomic)
CREATE OR REPLACE FUNCTION public.accept_job_offer_rpc(
  p_provider_id UUID,
  p_offer_id UUID,
  p_booking_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_booking_status TEXT;
  v_customer_id UUID;
BEGIN
  -- 0. Acquire Row-Level Lock on Provider's Profile
  PERFORM 1 FROM profiles WHERE id = p_provider_id FOR UPDATE;

  -- 1. Check if provider is already busy with an active job
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE provider_id = p_provider_id 
    AND status IN ('confirmed', 'en_route', 'arrived', 'in_progress')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROVIDER_BUSY', 'message', 'You already have an active job in progress.');
  END IF;

  -- 2. Lock and attempt update
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id FOR UPDATE;

  UPDATE bookings
  SET 
    provider_id = p_provider_id,
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_booking_id
  AND status IN ('requested', 'searching') -- CRITICAL FIX: handled searching status
  RETURNING status INTO v_booking_status;

  -- If no row was updated, it means someone else took it or it was cancelled.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'RACE_CONDITION', 'message', 'This booking is no longer available.');
  END IF;

  -- 2b. Audit Trail Enrichment
  UPDATE booking_status_history
  SET changed_by = p_provider_id, note = 'Job Accepted'
  WHERE booking_id = p_booking_id 
    AND old_status IN ('requested', 'searching') 
    AND new_status = 'confirmed' 
    AND changed_by IS NULL;

  -- 3. Mark the specific job offer as 'accepted'
  UPDATE job_offers
  SET 
    status = 'accepted',
    responded_at = NOW(),
    updated_at = NOW()
  WHERE id = p_offer_id;

  -- 4. Expire all other pending offers for this booking
  UPDATE job_offers
  SET 
    status = 'expired',
    responded_at = NOW(),
    updated_at = NOW()
  WHERE booking_id = p_booking_id
  AND id != p_offer_id
  AND status = 'pending';

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'customer_id', v_customer_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
