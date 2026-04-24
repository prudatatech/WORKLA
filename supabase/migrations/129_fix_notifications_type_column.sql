-- Migration: 129_fix_notifications_type_column.sql
-- PURPOSE: The notifications table is missing the `type` column.
-- This causes dispatch_job RPC and notify_on_job_offer trigger to fail with:
--   "column "type" of relation "notifications" does not exist" (42703)
-- Which means 0 job_offers are ever created → all bookings cancel with "No worker found"
-- AND no popup alerts ever appear in the provider app.
--
-- This is the ROOT CAUSE fix.

-- ──────────────────────────────────────────────
-- 1. Add missing `type` column to notifications
-- ──────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'type'
    ) THEN
        ALTER TABLE public.notifications
            ADD COLUMN type TEXT NOT NULL DEFAULT 'general';
        RAISE NOTICE 'Added type column to notifications table';
    ELSE
        RAISE NOTICE 'type column already exists on notifications table';
    END IF;
END $$;

-- ──────────────────────────────────────────────
-- 2. Add index for fast filtering by type
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_type ON public.notifications(user_id, type);

-- ──────────────────────────────────────────────
-- 3. Re-create the notify_on_job_offer trigger function
--    (was already correct in 127, but ensure it's current)
-- ──────────────────────────────────────────────
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

    INSERT INTO public.notifications (user_id, title, body, type, data, is_read)
    VALUES (
        NEW.provider_id,
        '🔔 New Job Request!',
        COALESCE(v_service_name, 'New Job') || ' — ₹' || COALESCE(v_amount::TEXT, '0'),
        'new_job',
        jsonb_build_object(
            'type',             'new_job',
            'offerId',          NEW.id,
            'bookingId',        NEW.booking_id,
            'offer_id',         NEW.id,
            'booking_id',       NEW.booking_id,
            'service',          COALESCE(v_service_name, 'Service Request'),
            'serviceName',      COALESCE(v_service_name, 'Service Request'),
            'address',          COALESCE(v_address, 'Nearby Location'),
            'customer_address', COALESCE(v_address, 'Nearby Location'),
            'amount',           COALESCE(v_amount, 0)
        ),
        false
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-attach trigger (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS trg_notify_job_offer ON public.job_offers;
CREATE TRIGGER trg_notify_job_offer
    AFTER INSERT ON public.job_offers
    FOR EACH ROW EXECUTE FUNCTION public.notify_on_job_offer();

-- ──────────────────────────────────────────────
-- 4. Re-create dispatch_job with internal notification insert
--    (uses correct column names now that `type` exists)
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_job(p_booking_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking          RECORD;
    v_provider         RECORD;
    v_inserted         INTEGER := 0;
    v_cust_lat         DOUBLE PRECISION;
    v_cust_lng         DOUBLE PRECISION;
    v_max_radius       DOUBLE PRECISION := 20.0;
BEGIN
    -- 1. Get booking details
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- 2. Defaults for location if null (Agra, India fallback)
    v_cust_lat := COALESCE(v_booking.customer_latitude, 27.1767);
    v_cust_lng := COALESCE(v_booking.customer_longitude, 78.0081);

    -- 3. Search for Online, Verified Providers within radius who offer this service
    FOR v_provider IN
        SELECT * FROM (
            SELECT
                pd.provider_id AS user_id,
                pl.latitude,
                pl.longitude,
                (6371 * acos(
                    LEAST(1.0, GREATEST(-1.0,
                        cos(radians(v_cust_lat)) * cos(radians(pl.latitude)) *
                        cos(radians(pl.longitude) - radians(v_cust_lng)) +
                        sin(radians(v_cust_lat)) * sin(radians(pl.latitude))
                    ))
                )) AS distance_km
            FROM public.provider_details pd
            JOIN public.provider_locations pl ON pl.provider_id = pd.provider_id
            JOIN public.provider_services ps ON ps.provider_id = pd.provider_id
            WHERE pd.is_online = TRUE
              AND pd.verification_status = 'verified'
              AND ps.subcategory_id = v_booking.subcategory_id
              AND ps.is_active = TRUE
              -- Location must be fresh (last 4 hours)
              AND pl.recorded_at > (NOW() - INTERVAL '4 hours')
        ) sub
        WHERE sub.distance_km < v_max_radius
        ORDER BY sub.distance_km ASC
        LIMIT 15
    LOOP
        -- 4. Create Job Offer (trigger will insert notification automatically)
        INSERT INTO public.job_offers (booking_id, provider_id, distance_km, expires_at, status)
        VALUES (p_booking_id, v_provider.user_id, v_provider.distance_km, NOW() + INTERVAL '30 minutes', 'pending')
        ON CONFLICT (booking_id, provider_id) DO UPDATE
            SET status     = 'pending',
                expires_at = NOW() + INTERVAL '30 minutes',
                distance_km = EXCLUDED.distance_km;

        v_inserted := v_inserted + 1;
    END LOOP;

    -- 5. Transition booking status based on results
    IF v_inserted > 0 THEN
        UPDATE public.bookings
        SET status = 'searching', updated_at = NOW()
        WHERE id = p_booking_id AND (status = 'requested' OR status = 'searching');
    ELSE
        UPDATE public.bookings
        SET
            status = 'cancelled',
            cancellation_reason = 'No worker found',
            updated_at = NOW()
        WHERE id = p_booking_id AND (status = 'requested' OR status = 'searching');
    END IF;

    RETURN v_inserted;
END;
$$;

-- ──────────────────────────────────────────────
-- 5. Update RLS to allow providers to see their own notifications
-- ──────────────────────────────────────────────
DO $$
BEGIN
    -- Drop existing policy if any
    DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
    DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
    DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
    DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
    DROP POLICY IF EXISTS "notifications_insert_service_role" ON public.notifications;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert_service_role"
    ON public.notifications FOR INSERT
    WITH CHECK (true);  -- Backend service role handles inserts

-- ──────────────────────────────────────────────
-- 6. Enable realtime on notifications table
-- ──────────────────────────────────────────────
-- This ensures Supabase Realtime actually fires for new rows
DO $$
BEGIN
    -- Add to realtime publication if not already
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN
    -- Covers both duplicate_object and any other errors (permission issues, etc.)
    RAISE NOTICE 'Could not add notifications to realtime publication: %', SQLERRM;
END $$;

-- ──────────────────────────────────────────────
-- 7. Force PostgREST schema cache reload
-- ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
ORDER BY ordinal_position;
