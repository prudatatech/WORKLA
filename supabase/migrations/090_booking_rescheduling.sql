-- ==============================================================
-- Migration: 090_booking_rescheduling.sql
-- Description: Atomic rescheduling of bookings with state enforcement.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.reschedule_booking_rpc(
  p_booking_id UUID,
  p_new_date DATE,
  p_new_slot VARCHAR,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_old_date DATE;
  v_old_slot VARCHAR;
  v_old_provider_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_actor_name VARCHAR(255);
BEGIN
  -- 1. Fetch, Lock and Validate Ownership
  SELECT id, status, customer_id, provider_id, scheduled_date, scheduled_time_slot, booking_number
  INTO v_booking
  FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Booking not found.');
  END IF;

  IF v_booking.customer_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'You do not have permission to reschedule this booking.');
  END IF;

  -- 2. Validate Status (Only requested, searching, or confirmed can be rescheduled)
  IF v_booking.status NOT IN ('requested', 'searching', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'code', 'ILLEGAL_STATUS', 
      'message', 'Only future bookings can be rescheduled. Current status: ' || v_booking.status
    );
  END IF;

  v_old_date := v_booking.scheduled_date;
  v_old_slot := v_booking.scheduled_time_slot;
  v_old_provider_id := v_booking.provider_id;

  -- 3. Resolve actor name for audit
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = p_user_id;

  -- 4. Perform Atomic Update
  -- If confirmed, we MUST unassign the provider as we don't know if they are available at the new time.
  UPDATE public.bookings
  SET 
    scheduled_date = p_new_date,
    scheduled_time_slot = p_new_slot,
    provider_id = CASE WHEN status = 'confirmed' THEN NULL ELSE provider_id END,
    status = CASE WHEN status = 'confirmed' THEN 'searching' ELSE status END,
    updated_at = v_now
  WHERE id = p_booking_id;

  -- 5. Log in booking_events (Elite Audit)
  INSERT INTO public.booking_events (
    booking_id, scheduled_date, actor_id, actor_name, event_type, old_value, new_value, metadata
  )
  VALUES (
    p_booking_id, 
    p_new_date, 
    p_user_id, 
    v_actor_name, 
    'rescheduled', 
    v_old_date::text || ' ' || v_old_slot, 
    p_new_date::text || ' ' || p_new_slot,
    jsonb_build_object(
      'old_provider_id', v_old_provider_id,
      'was_confirmed', v_booking.status = 'confirmed',
      'reason', p_reason
    )
  );

  -- 6. Clean up stale offers
  UPDATE public.job_offers 
  SET status = 'expired', 
      responded_at = v_now,
      rejection_reason = 'Booking Rescheduled'
  WHERE booking_id = p_booking_id AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true, 
    'booking_id', p_booking_id,
    'new_date', p_new_date,
    'new_slot', p_new_slot,
    'was_confirmed', v_booking.status = 'confirmed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

SELECT 'Rescheduling RPC Deployed ✅' AS result;
