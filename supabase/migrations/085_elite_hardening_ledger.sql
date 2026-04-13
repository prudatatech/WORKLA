-- ==============================================================
-- ELITE HARDENING: Ledger Performance & Audit Trails
-- Purpose: Optimized lookups via owner_id and immutable status history.
-- ==============================================================

-- 1. Hardening: Ledger Performance (Owner ID)
-- Add owner_id to financial_ledger to allow direct indexing
ALTER TABLE public.financial_ledger 
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id);

-- Create index for ultra-fast balance lookups
CREATE INDEX IF NOT EXISTS idx_financial_ledger_owner_id ON public.financial_ledger(owner_id);

-- 2. Hardening: Immutable Booking Audit Trails
CREATE TABLE IF NOT EXISTS public.booking_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL,
    scheduled_date DATE, -- Required for composite FK
    actor_id UUID REFERENCES public.profiles(id),
    event_type VARCHAR(50) NOT NULL, -- 'status_change', 'payment_received', etc.
    old_value TEXT,
    new_value TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_booking_event_booking
        FOREIGN KEY (booking_id, scheduled_date)
        REFERENCES public.bookings(id, scheduled_date)
        ON DELETE CASCADE
);

-- Index for history lookups
CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id ON public.booking_events(booking_id, scheduled_date);

-- 3. Trigger: Automatically Log Status Changes to booking_events
CREATE OR REPLACE FUNCTION public.log_booking_event()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.booking_events (booking_id, scheduled_date, actor_id, event_type, old_value, new_value)
        VALUES (NEW.id, NEW.scheduled_date, auth.uid(), 'status_change', OLD.status, NEW.status);
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.booking_events (booking_id, scheduled_date, actor_id, event_type, new_value)
        VALUES (NEW.id, NEW.scheduled_date, auth.uid(), 'booking_created', NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_booking_events ON public.bookings;
CREATE TRIGGER trg_log_booking_events
    AFTER INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.log_booking_event();

-- 4. Speed: Index Service Zones
CREATE INDEX IF NOT EXISTS idx_bookings_service_zone_id ON public.bookings(service_zone_id);

-- 5. Data Migration: Populate owner_id in financial_ledger for existing rewards (Best Effort)
-- Join with bookings to find owners
UPDATE public.financial_ledger fl
SET owner_id = b.customer_id
FROM public.bookings b
WHERE fl.reference_id = b.id
  AND fl.account_name = 'USER_WALLET_LIABILITY'
  AND fl.owner_id IS NULL;

UPDATE public.financial_ledger fl
SET owner_id = b.provider_id
FROM public.bookings b
WHERE fl.reference_id = b.id
  AND fl.account_name = 'PROVIDER_PAYABLE_LIABILITY'
  AND fl.owner_id IS NULL;

-- 6. Reload Schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Elite Ledger & Audit Hardening Applied ✅' AS result;
