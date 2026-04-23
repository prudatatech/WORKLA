-- Migration: 127_fix_job_offer_notification_trigger.sql
-- Purpose: Fix the notify_on_job_offer trigger so the notification data
--          includes camelCase keys (bookingId, offerId) matching what the
--          provider-app frontend expects. Previously used snake_case keys
--          which the frontend could not map correctly to show the popup.

CREATE OR REPLACE FUNCTION public.notify_on_job_offer()
RETURNS TRIGGER AS $$
DECLARE
    v_service_name TEXT;
    v_address      TEXT;
    v_amount       NUMERIC;
BEGIN
    -- Fetch booking details to enrich the notification
    SELECT 
        COALESCE(b.service_name_snapshot, 'Service Request'),
        COALESCE(b.customer_address, 'Nearby Location'),
        COALESCE(b.total_amount, 0)
    INTO v_service_name, v_address, v_amount
    FROM public.bookings b
    WHERE b.id = NEW.booking_id;

    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
        NEW.provider_id,
        'New Job Request! 🔔',
        COALESCE(v_service_name, 'New Job') || ' — ₹' || COALESCE(v_amount::TEXT, '0'),
        'new_job',  -- ← FIXED: was 'job_offer', now 'new_job' so frontend handler catches it
        jsonb_build_object(
            -- camelCase keys for frontend compatibility
            'type',        'new_job',
            'offerId',     NEW.id,
            'bookingId',   NEW.booking_id,
            'offer_id',    NEW.id,           -- keep snake_case too for safety
            'booking_id',  NEW.booking_id,
            'service',     COALESCE(v_service_name, 'Service Request'),
            'serviceName', COALESCE(v_service_name, 'Service Request'),
            'address',     COALESCE(v_address, 'Nearby Location'),
            'customer_address', COALESCE(v_address, 'Nearby Location'),
            'amount',      COALESCE(v_amount, 0)
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-attach the trigger (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS trg_notify_job_offer ON public.job_offers;
CREATE TRIGGER trg_notify_job_offer
    AFTER INSERT ON public.job_offers
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_job_offer();

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
