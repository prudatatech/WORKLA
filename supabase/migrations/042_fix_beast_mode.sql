-- =========================================================================
-- UNIFIED FIX: Partitioned Acceptance Logic (Manual + Beast Mode)
-- This fixes the failure to claim jobs from the Home Screen
-- =========================================================================

-- 1. Fix accept_job_beast_mode (Used by Home Screen "Accept Now")
CREATE OR REPLACE FUNCTION public.accept_job_beast_mode(p_offer_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking_id   UUID;
    v_provider_id  UUID;
    v_sched_date   DATE;
    v_success      BOOLEAN := FALSE;
BEGIN
    -- Get offer and the booking's partition key (scheduled_date)
    SELECT jo.booking_id, jo.provider_id, b.scheduled_date 
    INTO v_booking_id, v_provider_id, v_sched_date
    FROM public.job_offers jo
    JOIN public.bookings b ON b.id = jo.booking_id
    WHERE jo.id = p_offer_id AND jo.status = 'pending'
    FOR UPDATE SKIP LOCKED;

    IF v_booking_id IS NULL THEN
        RETURN FALSE; 
    END IF;

    -- Atomically claim the booking using BOTH id and scheduled_date (Partition Key)
    WITH claimed_booking AS (
        UPDATE public.bookings
        SET 
            provider_id = v_provider_id,
            status = 'confirmed',
            updated_at = NOW()
        WHERE id = v_booking_id 
          AND scheduled_date = v_sched_date -- CRITICAL for partitioned tables
          AND (status = 'searching' OR status = 'requested') -- Support both statuses
        RETURNING id
    )
    UPDATE public.job_offers
    SET 
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_offer_id 
    AND EXISTS (SELECT 1 FROM claimed_booking)
    RETURNING TRUE INTO v_success;

    -- Refresh other offers
    IF v_success THEN
        UPDATE public.job_offers
        SET status = 'expired'
        WHERE booking_id = v_booking_id AND id <> p_offer_id AND status = 'pending';
        
        -- Optional: Log history
        INSERT INTO public.booking_status_history (booking_id, scheduled_date, new_status, note, changed_by)
        VALUES (v_booking_id, v_sched_date, 'confirmed', 'Accepted via Beast Mode', v_provider_id);
    END IF;

    RETURN COALESCE(v_success, FALSE);
END;
$function$;


-- 2. Final verification of that plumbing booking
SELECT 
    id, 
    status, 
    provider_id, 
    scheduled_date
FROM public.bookings
WHERE id = 'c45664a9-1787-4a59-80e8-cd82eb649646';
