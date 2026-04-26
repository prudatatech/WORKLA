-- Run this in Supabase SQL Editor to enable Realtime for job_offers table.
-- This enables the backup popup trigger in the provider app.

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_offers;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'job_offers realtime: %', SQLERRM;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notifications realtime: %', SQLERRM;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'bookings realtime: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verify
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('job_offers', 'notifications', 'bookings');
