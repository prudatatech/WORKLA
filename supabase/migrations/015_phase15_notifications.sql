-- ==========================================
-- Workla Phase 15: Notifications & Atomic Dispatch
-- Purpose: Backend-driven notifications and race-condition-free dispatch logic
-- ==========================================

-- 1. Notifications History Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    type        TEXT NOT NULL, -- 'job_offer', 'status_update', 'chat', 'payment'
    data        JSONB DEFAULT '{}'::jsonb,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications (mark read)" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- 2. Atomic Job Acceptance Function (RPC)
-- This replaces frontend-side logic to avoid race conditions.
CREATE OR REPLACE FUNCTION public.accept_job_atomic(p_offer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking_id UUID;
    v_provider_id UUID;
    v_status TEXT;
BEGIN
    -- 1. Lock the offer and booking row for update
    SELECT booking_id, provider_id, status 
    INTO v_booking_id, v_provider_id, v_status
    FROM public.job_offers
    WHERE id = p_offer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer not found';
    END IF;

    IF v_status != 'pending' THEN
        RAISE EXCEPTION 'This offer is no longer available';
    END IF;

    -- 2. Check if the booking is still available for confirmed/requested status
    -- Lock the booking to prevent others from taking it
    IF NOT EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE id = v_booking_id 
          AND (status = 'requested' OR status = 'dispatching')
        FOR UPDATE
    ) THEN
        RAISE EXCEPTION 'This job has already been accepted or is unavailable';
    END IF;

    -- 3. Atomic Updates
    -- a) Update the specific offer to accepted
    UPDATE public.job_offers 
    SET status = 'accepted', responded_at = NOW() 
    WHERE id = p_offer_id;

    -- b) Mark other offers for this booking as expired
    UPDATE public.job_offers 
    SET status = 'expired' 
    WHERE booking_id = v_booking_id AND id != p_offer_id;

    -- c) Assign the provider to the booking
    UPDATE public.bookings 
    SET status = 'confirmed', 
        provider_id = v_provider_id,
        updated_at = NOW()
    WHERE id = v_booking_id;

    -- 4. Log a notification for the customer (optional, can be trigger-based)
    INSERT INTO public.notifications (user_id, title, body, type, data)
    SELECT customer_id, 'Worker Assigned', 'A professional is on their way to you.', 'status_update', jsonb_build_object('booking_id', v_booking_id)
    FROM public.bookings WHERE id = v_booking_id;

    RETURN TRUE;
END;
$$;

-- 3. Trigger to Auto-Notify on New Job Offer
CREATE OR REPLACE FUNCTION public.notify_on_job_offer()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
        NEW.provider_id, 
        'New Job Request! 🔔', 
        'You have a new service request nearby.', 
        'job_offer', 
        jsonb_build_object('offer_id', NEW.id, 'booking_id', NEW.booking_id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_job_offer ON public.job_offers;
CREATE TRIGGER trg_notify_job_offer
    AFTER INSERT ON public.job_offers
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_job_offer();
