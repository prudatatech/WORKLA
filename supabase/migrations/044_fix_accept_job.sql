-- =========================================================================
-- FIX: Corrected Booking Acceptance Logic
-- Fixes the "column status does not exist" error in booking_status_history
-- =========================================================================

CREATE OR REPLACE FUNCTION public.accept_job_manual(p_booking_id UUID, p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_status VARCHAR;
BEGIN
    -- 1. Lock the booking and get current status
    SELECT status INTO v_old_status 
    FROM public.bookings 
    WHERE id = p_booking_id FOR UPDATE;

    -- 2. Ensure job is still available
    IF v_old_status != 'requested' AND v_old_status != 'searching' THEN
        RETURN FALSE;
    END IF;

    -- 3. Mark the job_offer as accepted for this provider
    UPDATE public.job_offers 
    SET status = 'accepted'
    WHERE booking_id = p_booking_id AND provider_id = p_provider_id;

    -- 4. Mark all other offers for this booking as expired
    UPDATE public.job_offers 
    SET status = 'expired'
    WHERE booking_id = p_booking_id AND provider_id != p_provider_id;

    -- 5. Assign the booking to the provider
    UPDATE public.bookings 
    SET 
        provider_id = p_provider_id, 
        status = 'confirmed', 
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- 6. Insert status history with CORRECT COLUMN NAMES
    -- (booking_status_history uses: old_status, new_status, note)
    INSERT INTO public.booking_status_history (booking_id, old_status, new_status, note, changed_by)
    VALUES (p_booking_id, v_old_status, 'confirmed', 'Provider accepted the job via marketplace', p_provider_id);

    RETURN TRUE;
END;
$$;
