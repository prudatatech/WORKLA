-- =========================================================================
-- FIX: RE-LINKING BOOKING HISTORY (FINAL FORM)
-- This fixes "no unique constraint matching given keys"
-- =============================================================

-- 1. Ensure bookings(id) is UNIQUE so other tables can link to it
-- (It was part of a composite PK, which blocks simple FKs)
ALTER TABLE public.bookings ADD CONSTRAINT bookings_id_unique UNIQUE (id);

-- 2. Drop the old/broken foreign key
ALTER TABLE public.booking_status_history 
DROP CONSTRAINT IF EXISTS booking_status_history_booking_id_fkey;

-- 3. Re-create the foreign key pointing to the CORRECT bookings table
ALTER TABLE public.booking_status_history 
ADD CONSTRAINT booking_status_history_booking_id_fkey 
FOREIGN KEY (booking_id) 
REFERENCES public.bookings(id) 
ON DELETE CASCADE;

-- 4. Re-Apply the accept_job_manual fix (just in case)
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
    INSERT INTO public.booking_status_history (booking_id, old_status, new_status, note, changed_by)
    VALUES (p_booking_id, v_old_status, 'confirmed', 'Provider accepted the job via marketplace', p_provider_id);

    RETURN TRUE;
END;
$$;
