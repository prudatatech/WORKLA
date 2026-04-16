-- Migration: 111_repair_bookings_schema.sql
-- Fixes: Missing columns in bookings table (catalog_price, service_id, latitude, etc.)

DO $$ 
BEGIN
    -- 1. Core Foreign Keys & Identity
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'service_id') THEN
        ALTER TABLE public.bookings ADD COLUMN service_id UUID REFERENCES public.services(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'category_id') THEN
        ALTER TABLE public.bookings ADD COLUMN category_id UUID REFERENCES public.service_categories(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'provider_id') THEN
        ALTER TABLE public.bookings ADD COLUMN provider_id UUID REFERENCES public.provider_details(provider_id) ON DELETE SET NULL;
    END IF;

    -- 2. Financial Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'catalog_price') THEN
        ALTER TABLE public.bookings ADD COLUMN catalog_price DECIMAL(10,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'platform_fee') THEN
        ALTER TABLE public.bookings ADD COLUMN platform_fee DECIMAL(10,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'tax_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'discount_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0.00;
    END IF;

    -- 3. Metadata & Status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'payment_method') THEN
        ALTER TABLE public.bookings ADD COLUMN payment_method VARCHAR(50) DEFAULT 'cash';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'payment_status') THEN
        ALTER TABLE public.bookings ADD COLUMN payment_status VARCHAR(30) DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'coupon_id') THEN
        ALTER TABLE public.bookings ADD COLUMN coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL;
    END IF;

    -- 4. Location Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_latitude') THEN
        ALTER TABLE public.bookings ADD COLUMN customer_latitude DOUBLE PRECISION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_longitude') THEN
        ALTER TABLE public.bookings ADD COLUMN customer_longitude DOUBLE PRECISION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_address') THEN
        ALTER TABLE public.bookings ADD COLUMN customer_address TEXT;
    END IF;

    -- 5. Scheduling Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'scheduled_date') THEN
        ALTER TABLE public.bookings ADD COLUMN scheduled_date DATE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'scheduled_time_slot') THEN
        ALTER TABLE public.bookings ADD COLUMN scheduled_time_slot VARCHAR(100);
    END IF;
    
    -- 6. Special Instructions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'special_instructions') THEN
        ALTER TABLE public.bookings ADD COLUMN special_instructions TEXT;
    END IF;

END $$;

-- Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';

-- Diagnostic check
SELECT 'Repair: bookings table universal schema fixed ✅' AS result;
