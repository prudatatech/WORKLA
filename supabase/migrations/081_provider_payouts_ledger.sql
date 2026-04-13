-- ==============================================================
-- FINANCIAL HARDENING: Provider Payouts & Escrow Ledgering
-- Purpose: Safely manages provider withdrawal requests using
-- double-entry ledger logic and strict state machines.
-- ==============================================================

-- 1. Create the Payout Requests Table
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
    transfer_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer',
    transfer_details JSONB,
    remarks TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers view their own payouts"
    ON public.payout_requests FOR SELECT
    USING (auth.uid() = provider_id);

CREATE POLICY "Admins manage all payouts"
    ON public.payout_requests FOR ALL
    USING (public.is_admin());

-- 2. Escrow Ledger Trigger for Payout State Changes
CREATE OR REPLACE FUNCTION public.handle_payout_ledger_escrow()
RETURNS TRIGGER AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
BEGIN
    -- SCENARIO A: New Payout Requested (Pending)
    -- MOVE FUNDS: Provider Payable (Liability) -> Payout Reserve (Liability Escrow)
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        -- Verify provider has sufficient digital balance
        IF NOT EXISTS (
            SELECT 1 FROM public.provider_earnings_summary 
            WHERE provider_id = NEW.provider_id 
            AND total_earnings >= NEW.amount
        ) THEN
            RAISE EXCEPTION 'Insufficient digital earnings balance for withdrawal.';
        END IF;

        -- DEBIT: Provider Payable (Provider balance decreases)
        INSERT INTO public.financial_ledger 
            (scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (v_today, NEW.id, 'PROVIDER_PAYABLE_LIABILITY', NEW.amount, 'debit', 'PAYOUT_REQUEST', 'Funds locked for withdrawal request');

        -- CREDIT: Payout Reserve Escrow (System hold increases)
        INSERT INTO public.financial_ledger 
            (scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (v_today, NEW.id, 'PAYOUT_RESERVE_LIABILITY', NEW.amount, 'credit', 'PAYOUT_REQUEST', 'Funds securely held in escrow pending admin approval');
    END IF;

    -- SCENARIO B: Payout Approved (Completed)
    -- MOVE FUNDS: Payout Reserve (Liability Escrow) -> Bank Account (Asset)
    IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'completed' THEN
        -- DEBIT: Payout Reserve Escrow (Release the hold)
        INSERT INTO public.financial_ledger 
            (scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (v_today, NEW.id, 'PAYOUT_RESERVE_LIABILITY', NEW.amount, 'debit', 'PAYOUT_COMPLETED', 'Escrow released for successful payout');

        -- CREDIT: Bank Asset (Money leaves our bank account)
        INSERT INTO public.financial_ledger 
            (scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (v_today, NEW.id, 'BANK_RAZORPAY_ASSET', NEW.amount, 'credit', 'PAYOUT_COMPLETED', 'Cash wired to Provider bank account. ' || COALESCE(NEW.remarks, ''));
            
        NEW.processed_at := NOW();
    END IF;

    -- SCENARIO C: Payout Rejected
    -- MOVE FUNDS: Payout Reserve (Liability Escrow) -> Provider Payable (Liability)
    IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'rejected' THEN
        -- DEBIT: Payout Reserve Escrow (Release the hold)
        INSERT INTO public.financial_ledger 
            (scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (v_today, NEW.id, 'PAYOUT_RESERVE_LIABILITY', NEW.amount, 'debit', 'PAYOUT_REJECTED', 'Escrow released due to rejection');

        -- CREDIT: Provider Payable (Provider gets their digital balance back)
        INSERT INTO public.financial_ledger 
            (scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (v_today, NEW.id, 'PROVIDER_PAYABLE_LIABILITY', NEW.amount, 'credit', 'PAYOUT_REJECTED', 'Funds returned to provider balance. Reason: ' || COALESCE(NEW.remarks, ''));
            
        NEW.processed_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_payout_escrow_sync ON public.payout_requests;
CREATE TRIGGER trg_payout_escrow_sync
    BEFORE INSERT OR UPDATE ON public.payout_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_payout_ledger_escrow();

-- 3. Update Provider Summary View to factor in Payouts
-- Drop existing view to redefine it
DROP VIEW IF EXISTS public.provider_earnings_summary CASCADE;

CREATE OR REPLACE VIEW public.provider_earnings_summary AS
SELECT 
    sub.provider_id,
    COALESCE(sub.total_gross_earnings, 0) AS total_gross_earnings,
    COALESCE(sub.total_platform_fees,  0) AS total_platform_fees,
    COALESCE(sub.total_tax_deducted,   0) AS total_tax_deducted,
    COALESCE(sub.completed_jobs,       0) AS completed_jobs,
    -- Core Fix: The user's balance is entirely determined by the Financial Ledger
    COALESCE((
        -- Liability Credit = We owe them. Liability Debit = We paid them.
        SELECT SUM(CASE WHEN side = 'credit' THEN amount ELSE -amount END)
        FROM public.financial_ledger
        WHERE account_name = 'PROVIDER_PAYABLE_LIABILITY'
          AND reference_id IN (
              SELECT id FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE provider_id = sub.provider_id)
              UNION 
              SELECT id FROM public.payout_requests WHERE provider_id = sub.provider_id
          )
    ), 0) AS total_earnings, -- This acts as "Digital Balance"
    COALESCE((
        SELECT SUM(amount) FROM public.payout_requests 
        WHERE provider_id = sub.provider_id AND status = 'pending'
    ), 0) AS pending_payouts,
    COALESCE((
        SELECT SUM(amount) FROM public.payout_requests 
        WHERE provider_id = sub.provider_id AND status = 'completed'
    ), 0) AS withdrawn_amount,
    COALESCE(pd.avg_rating, 0) AS rating,
    COALESCE((
        SELECT SUM(net_amount) 
        FROM public.worker_earnings 
        WHERE provider_id = sub.provider_id 
        AND created_at >= current_date
    ), 0) AS today_net
FROM (
    SELECT 
        we.provider_id,
        SUM(we.gross_amount) AS total_gross_earnings,
        SUM(we.platform_fee) AS total_platform_fees,
        SUM(we.tax_deduction) AS total_tax_deducted,
        COUNT(DISTINCT we.booking_id) AS completed_jobs
    FROM public.worker_earnings we
    GROUP BY we.provider_id
) sub
LEFT JOIN public.provider_details pd ON sub.provider_id = pd.provider_id;

SELECT 'Payout Engine Deployed ✅' AS result;
