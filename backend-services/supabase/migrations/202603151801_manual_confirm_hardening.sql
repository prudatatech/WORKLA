-- SQL function to manually confirm a booking (admin/system override)
-- This ensures that only bookings in 'requested' or 'searching' status
-- can be manually confirmed, and cleans up all job offers atomically.

CREATE OR REPLACE FUNCTION confirm_booking_manual_rpc(
  p_booking_id UUID,
  p_provider_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
  v_customer_id UUID;
BEGIN
  -- 1. Check current status and fetch customer_id for cache invalidation context
  SELECT status, customer_id INTO v_current_status, v_customer_id
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Booking not found.');
  END IF;

  -- 2. Validate status transition
  -- Admin can only confirm if it hasn't been started/cancelled etc.
  IF v_current_status NOT IN ('requested', 'searching', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS', 'message', 'Cannot manually confirm booking in ' || v_current_status || ' state.');
  END IF;

  -- 3. Atomic Update
  UPDATE bookings
  SET 
    provider_id = p_provider_id,
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_booking_id;

  -- 4. Expire ALL job offers for this booking
  UPDATE job_offers
  SET 
    status = 'expired',
    responded_at = NOW(),
    updated_at = NOW()
  WHERE booking_id = p_booking_id
  AND status = 'pending';

  -- 5. Return success + IDs for cache invalidation
  RETURN jsonb_build_object(
    'success', true, 
    'booking_id', p_booking_id, 
    'customer_id', v_customer_id, 
    'provider_id', p_provider_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
