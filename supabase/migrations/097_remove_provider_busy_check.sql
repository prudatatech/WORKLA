-- ==============================================================
-- FIX: Remove PROVIDER_BUSY check from Job Acceptance RPC
-- Allows providers to accept new jobs even if they have 
-- an active booking (like Zomato/Uber multi-order model).
-- ==============================================================

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

  -- PROVIDER_BUSY check REMOVED — providers can now accept 
  -- multiple jobs (previous active jobs stay as-is).

  -- 1. Lock and attempt update
  SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id FOR UPDATE;

  UPDATE bookings
  SET 
    provider_id = p_provider_id,
    status = 'confirmed',
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_booking_id
  AND status IN ('requested', 'searching')
  RETURNING status INTO v_booking_status;

  -- If no row was updated, it means someone else took it or it was cancelled.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'RACE_CONDITION', 'message', 'This booking is no longer available.');
  END IF;

  -- 1b. Audit Trail Enrichment
  UPDATE booking_status_history
  SET changed_by = p_provider_id, note = 'Job Accepted'
  WHERE booking_id = p_booking_id 
    AND old_status IN ('requested', 'searching') 
    AND new_status = 'confirmed' 
    AND changed_by IS NULL;

  -- 2. Mark the specific job offer as 'accepted'
  UPDATE job_offers
  SET 
    status = 'accepted',
    responded_at = NOW()
  WHERE id = p_offer_id;

  -- 3. Expire all other pending offers for this booking
  UPDATE job_offers
  SET 
    status = 'expired',
    responded_at = NOW()
  WHERE booking_id = p_booking_id
  AND id != p_offer_id
  AND status = 'pending';

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'customer_id', v_customer_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Provider Busy Check Removed from accept_job_offer_rpc ✅' AS result;
