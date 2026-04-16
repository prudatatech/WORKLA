-- Migration: 118_absolute_universal_bookings_repair.sql
-- Purpose: Final comprehensive repair of the bookings table schema.
-- Fixes: "column confirmed_at does not exist" and other missing lifecycle columns.

DO $$ 
BEGIN
    -- 1. Identity & Relationships
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'booking_number') THEN
        ALTER TABLE public.bookings ADD COLUMN booking_number VARCHAR(50) UNIQUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'service_name_snapshot') THEN
        ALTER TABLE public.bookings ADD COLUMN service_name_snapshot VARCHAR(255) DEFAULT 'Service Appointment';
    END IF;

    -- 2. Status & Cancellation
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'cancelled_by') THEN
        ALTER TABLE public.bookings ADD COLUMN cancelled_by VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'cancellation_reason') THEN
        ALTER TABLE public.bookings ADD COLUMN cancellation_reason TEXT;
    END IF;

    -- 3. Financial & Audit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'price_breakdown') THEN
        ALTER TABLE public.bookings ADD COLUMN price_breakdown JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'total_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0.00;
    END IF;

    -- 4. CRITICAL TIMESTAMPS (The missing pieces)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'confirmed_at') THEN
        ALTER TABLE public.bookings ADD COLUMN confirmed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'started_at') THEN
        ALTER TABLE public.bookings ADD COLUMN started_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'completed_at') THEN
        ALTER TABLE public.bookings ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'updated_at') THEN
        ALTER TABLE public.bookings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- Diagnostic check
SELECT 'Repair: Absolute universal bookings schema restored! ✅' AS result;
