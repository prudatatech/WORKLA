-- =========================================================================
-- FINAL DB FIX: Resolving Partitioning & Foreign Key Issues
-- =========================================================================

-- 1. Add 'scheduled_date' to 'booking_status_history'
-- This is NECESSARY because 'bookings' is partitioned by date.
-- A foreign key to a partitioned table must include the partition key.
ALTER TABLE public.booking_status_history 
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- 2. Backfill existing history rows (if any) with the date from the bookings table
UPDATE public.booking_status_history h
SET scheduled_date = b.scheduled_date
FROM public.bookings b
WHERE h.booking_id = b.id
AND h.scheduled_date IS NULL;

-- 3. Drop the old/broken foreign key
ALTER TABLE public.booking_status_history 
DROP CONSTRAINT IF EXISTS booking_status_history_booking_id_fkey;

-- 4. Re-create the foreign key pointing to BOTH id and scheduled_date
-- Since (id, scheduled_date) is the unique primary key of the partitioned table.
ALTER TABLE public.booking_status_history 
ADD CONSTRAINT booking_status_history_booking_date_fkey 
FOREIGN KEY (booking_id, scheduled_date) 
REFERENCES public.bookings(id, scheduled_date) 
ON DELETE CASCADE;

-- 5. Update the accept_job_manual function to handle the date
CREATE OR REPLACE FUNCTION public.accept_job_manual(p_booking_id UUID, p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_status VARCHAR;
    v_sched_date DATE;
BEGIN
    -- 1. Lock the booking and get current status + date
    SELECT status, scheduled_date INTO v_old_status, v_sched_date 
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

    -- 6. Insert status history with BOTH status and date
    INSERT INTO public.booking_status_history (booking_id, scheduled_date, old_status, new_status, note, changed_by)
    VALUES (p_booking_id, v_sched_date, v_old_status, 'confirmed', 'Provider accepted the job via marketplace', p_provider_id);

    RETURN TRUE;
END;
$$;
