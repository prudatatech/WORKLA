-- SQL function to accept a job offer atomically
-- This ensures that the busy check, booking assignment, and offer cleanup
-- happen within a single database transaction.

CREATE OR REPLACE FUNCTION accept_job_offer_rpc(
  p_provider_id UUID,
  p_offer_id UUID,
  p_booking_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_booking_status TEXT;
BEGIN
  -- 1. Check if provider is already busy with an active job
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE provider_id = p_provider_id 
    AND status IN ('confirmed', 'en_route', 'arrived', 'in_progress')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROVIDER_BUSY', 'message', 'You already have an active job in progress.');
  END IF;

  -- 2. Lock and attempt to update the booking record
  -- We ONLY proceed if the booking is still in 'requested' status.
  UPDATE bookings
  SET 
    provider_id = p_provider_id,
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_booking_id
  AND status = 'requested'
  RETURNING status INTO v_booking_status;

  -- If no row was updated, it means someone else took it or it was cancelled.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'RACE_CONDITION', 'message', 'This booking is no longer available.');
  END IF;

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

  -- 5. Return success
  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
