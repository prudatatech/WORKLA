-- ==============================================================
-- CANCELLATION EARNINGS SYNCHRONIZATION
-- Ensures providers see cancellation penalties in their Earnings History.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.handle_booking_cancelled_earnings()
RETURNS TRIGGER AS $$
DECLARE
    v_penalty_data JSONB;
    v_penalty_amt DECIMAL(10,2) := 0;
    v_provider_share DECIMAL(10,2) := 0;
    v_platform_fee DECIMAL(10,2) := 0;
BEGIN
    -- Only trigger when a booking transitions to 'cancelled', it has a provider, and the customer cancelled
    IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' 
       AND NEW.provider_id IS NOT NULL 
       AND NEW.cancelled_by = 'customer' THEN
        
        -- Need to recalculate penalty to know the exact amount (since it was just applied to ledger)
        v_penalty_data := public.calculate_cancellation_penalty(NEW.id);
        v_penalty_amt := COALESCE((v_penalty_data->>'penalty')::DECIMAL, 0);

        IF v_penalty_amt > 0 THEN
            -- Reverse engineering the 60/40 split applied in update_booking_status_hardened_rpc
            v_platform_fee := v_penalty_amt * 0.4;
            v_provider_share := v_penalty_amt * 0.6;

            -- 1. Insert into worker_earnings so it shows in history
            INSERT INTO public.worker_earnings
                (booking_id, provider_id, gross_amount, platform_fee, tax_deduction, net_amount, status)
            VALUES
                (NEW.id, NEW.provider_id, v_penalty_amt, v_platform_fee, 0, v_provider_share, 'paid')
            ON CONFLICT (booking_id) DO UPDATE 
                SET gross_amount = v_penalty_amt,
                    platform_fee = v_platform_fee,
                    net_amount = v_provider_share,
                    status = 'paid';

            -- 2. Update provider stats immediately for the Summary view
            UPDATE public.provider_details 
            SET total_earnings = total_earnings + v_provider_share, 
                updated_at = NOW() 
            WHERE provider_id = NEW.provider_id;
            
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to bookings table
DROP TRIGGER IF EXISTS trg_booking_cancelled_earnings_sync ON public.bookings;
CREATE TRIGGER trg_booking_cancelled_earnings_sync
    AFTER UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.handle_booking_cancelled_earnings();

SELECT 'Cancellation Earnings Sync Deployed ✅' AS result;
