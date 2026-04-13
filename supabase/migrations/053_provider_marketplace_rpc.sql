-- Workla Job Discovery Engine
-- This RPC creates a clean view of jobs that a provider is eligible to accept
-- It reads from the job_offers table which is populated by the dispatch_job worker

DROP FUNCTION IF EXISTS public.get_available_jobs(UUID);

CREATE OR REPLACE FUNCTION public.get_available_jobs(p_provider_id UUID)
RETURNS TABLE (
    id UUID,
    service_name TEXT,
    customer_address TEXT,
    total_amount DECIMAL,
    scheduled_date DATE,
    scheduled_time_slot VARCHAR,
    distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.service_name_snapshot AS service_name,
        b.customer_address,
        b.total_amount,
        b.scheduled_date,
        b.scheduled_time_slot,
        jo.distance_km
    FROM public.job_offers jo
    JOIN public.bookings b ON b.id = jo.booking_id
    WHERE jo.provider_id = p_provider_id
      AND jo.status = 'pending'
      AND jo.expires_at > NOW()
      AND b.status IN ('requested', 'searching')
    ORDER BY b.created_at DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Provider Job Acceptance Logic
-- Allows a provider to claim a job that was dispatched to them
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_job_manual(p_booking_id UUID, p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking_status VARCHAR;
BEGIN
    -- 1. Lock the booking to prevent race conditions (double accept)
    SELECT status INTO v_booking_status 
    FROM public.bookings 
    WHERE id = p_booking_id FOR UPDATE;

    -- 2. Ensure job is still available
    IF v_booking_status NOT IN ('requested', 'searching') THEN
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

    -- 6. Insert status history
    INSERT INTO public.booking_status_history (booking_id, status, notes)
    VALUES (p_booking_id, 'confirmed', 'Provider accepted the job via marketplace');

    RETURN TRUE;
END;
$$;
