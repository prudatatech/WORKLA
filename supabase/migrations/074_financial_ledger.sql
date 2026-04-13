-- ══════════════════════════════════════════════════════════════════════════════
-- WORKLA: Financial Ledger Migration (074) - ELITE HARDENING V4
-- Purpose: Professional double-entry accounting with Escrow & Reconciliation.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Create financial_ledger table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_ledger (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID,
    scheduled_date  DATE, -- For Partitioned FK
    reference_id    UUID, -- payment_id, refund_id, etc.
    account_name    VARCHAR(50) NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    side            VARCHAR(10) NOT NULL CHECK (side IN ('debit', 'credit')),
    transaction_type VARCHAR(50) NOT NULL,
    description     TEXT,
    metadata        JSONB,
    reconciled_at   TIMESTAMPTZ, -- For Daily Closure
    is_locked       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ledger_booking 
        FOREIGN KEY (booking_id, scheduled_date) 
        REFERENCES public.bookings(id, scheduled_date) 
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_booking ON public.financial_ledger(booking_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON public.financial_ledger(account_name);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON public.financial_ledger(created_at DESC);

ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'financial_ledger' AND policyname = 'Admins manage ledger') THEN
        CREATE POLICY "Admins manage ledger" ON public.financial_ledger FOR ALL USING (public.is_admin());
    END IF;
END $$;

-- ── 2. ESCROW: Register Funds-in-Flight ────────────────────────────────────
-- Fires when a payment is CAPTURED. Debits Bank, Credits Escrow.
CREATE OR REPLACE FUNCTION public.handle_payment_escrow_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_source_acct VARCHAR(50);
    v_sched_date  DATE;
BEGIN
    -- Only ledger on CAPTURE transition
    IF (OLD.status IS DISTINCT FROM 'captured' AND NEW.status = 'captured') THEN
        
        SELECT scheduled_date INTO v_sched_date FROM public.bookings WHERE id = NEW.booking_id;

        CASE 
            WHEN NEW.method = 'wallet' THEN v_source_acct := 'USER_WALLET_LIABILITY';
            WHEN NEW.method IN ('online', 'razorpay', 'upi', 'card') THEN v_source_acct := 'BANK_RAZORPAY_ASSET';
            ELSE v_source_acct := 'CASH_CLEARING_ASSET';
        END CASE;

        -- DEBIT: The Bank/Source (We received the asset)
        INSERT INTO public.financial_ledger 
            (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (NEW.booking_id, v_sched_date, NEW.id, v_source_acct, NEW.amount, 'debit', 'PAYMENT_CAPTURE', 'Funds captured and moved to Escrow');

        -- CREDIT: Escrow (We owe this to someone, but don't know who yet)
        INSERT INTO public.financial_ledger 
            (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (NEW.booking_id, v_sched_date, NEW.id, 'ESCROW_HOLD_LIABILITY', NEW.amount, 'credit', 'PAYMENT_CAPTURE', 'Funds held in escrow for booking');
            
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_payment_escrow_ledger ON public.payments;
CREATE TRIGGER trg_payment_escrow_ledger
    AFTER UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_payment_escrow_ledger();

-- ── 3. COMPLETION: Move Funds from Escrow to Destination ───────────────────
CREATE OR REPLACE FUNCTION public.handle_booking_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee   DECIMAL(10,2);
    v_net            DECIMAL(10,2);
    v_tax            DECIMAL(10,2);
    v_payment_id     UUID;
BEGIN
    IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
        
        v_platform_fee := COALESCE(NEW.platform_fee, 0);
        v_tax := COALESCE(NEW.tax_amount, 0);
        v_net := NEW.total_amount - v_platform_fee - v_tax;

        -- 1. Ensure worker_earnings record exists
        INSERT INTO public.worker_earnings
            (booking_id, provider_id, gross_amount, platform_fee, tax_deduction, net_amount, status)
        VALUES
            (NEW.id, NEW.provider_id, NEW.total_amount, v_platform_fee, v_tax, v_net, 'pending')
        ON CONFLICT (booking_id) DO NOTHING;

        -- 2. Fetch triggering payment info
        SELECT id INTO v_payment_id FROM public.payments WHERE booking_id = NEW.id ORDER BY created_at DESC LIMIT 1;

        -- 3. DEBIT ESCROW: Reversing the hold
        INSERT INTO public.financial_ledger 
            (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (NEW.id, NEW.scheduled_date, v_payment_id, 'ESCROW_HOLD_LIABILITY', NEW.total_amount, 'debit', 'JOB_COMPLETION', 'Releasing escrow for distribution');

        -- 4. CREDIT Destination: Provider Payable
        INSERT INTO public.financial_ledger 
            (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (NEW.id, NEW.scheduled_date, v_payment_id, 'PROVIDER_PAYABLE_LIABILITY', v_net, 'credit', 'JOB_COMPLETION', 'Net earnings credited to provider');

        -- 5. CREDIT Destination: Platform Revenue
        IF v_platform_fee > 0 THEN
            INSERT INTO public.financial_ledger 
                (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
            VALUES 
                (NEW.id, NEW.scheduled_date, v_payment_id, 'PLATFORM_REVENUE_EQUITY', v_platform_fee, 'credit', 'JOB_COMPLETION', 'Workla commission');
        END IF;

        -- 6. CREDIT Destination: Tax Payable
        IF v_tax > 0 THEN
            INSERT INTO public.financial_ledger 
                (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
            VALUES 
                (NEW.id, NEW.scheduled_date, v_payment_id, 'TAX_PAYABLE_LIABILITY', v_tax, 'credit', 'JOB_COMPLETION', 'Tax collected');
        END IF;

        -- 7. Stats
        UPDATE public.provider_details SET total_jobs = total_jobs + 1, total_earnings = total_earnings + v_net, updated_at = NOW() WHERE provider_id = NEW.provider_id;
        NEW.completed_at := NOW();
    END IF;

    IF OLD.status IS DISTINCT FROM 'confirmed' AND NEW.status = 'confirmed' THEN NEW.confirmed_at := NOW(); END IF;
    IF OLD.status IS DISTINCT FROM 'in_progress' AND NEW.status = 'in_progress' THEN NEW.started_at := NOW(); END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. RECONCILIATION VIEW ─────────────────────────────────────────────────
-- Flags any booking where the ledger doesn't balance to Zero.
CREATE OR REPLACE VIEW public.ledger_reconciliation_audit AS
SELECT 
    booking_id, 
    scheduled_date,
    SUM(CASE WHEN side = 'debit' THEN amount ELSE -amount END) as balance,
    COUNT(*) as entry_count
FROM public.financial_ledger
GROUP BY booking_id, scheduled_date
HAVING SUM(CASE WHEN side = 'debit' THEN amount ELSE -amount END) != 0;

-- ── 5. WALLET & REFUND HARDENING ───────────────────────────────────────────
-- (Keeping previous logic but ensuring Escrow alignment if needed)

CREATE OR REPLACE FUNCTION public.handle_wallet_ledger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        INSERT INTO public.financial_ledger (reference_id, account_name, amount, side, transaction_type, description)
        VALUES 
            (NEW.id, 'INCENTIVE_EXPENSE_EQUITY', NEW.amount, 'debit', 'WALLET_ADJUSTMENT', NEW.description),
            (NEW.id, 'USER_WALLET_LIABILITY', NEW.amount, 'credit', 'WALLET_ADJUSTMENT', NEW.description);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_payment_status_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee DECIMAL(10,2);
    v_net          DECIMAL(10,2);
    v_tax          DECIMAL(10,2);
    v_sched_date   DATE;
BEGIN
    -- REFUND: We reverse the finalized accounts (or Escrow if not completed)
    IF OLD.status != 'refunded' AND NEW.status = 'refunded' THEN
        SELECT scheduled_date INTO v_sched_date FROM public.bookings WHERE id = NEW.booking_id;
        
        -- If booking was completed, reverse finalized accounts. 
        -- If NOT completed, reverse Escrow.
        IF EXISTS (SELECT 1 FROM public.bookings WHERE id = NEW.booking_id AND status = 'completed') THEN
             SELECT platform_fee, net_amount, tax_deduction INTO v_platform_fee, v_net, v_tax FROM public.worker_earnings WHERE booking_id = NEW.booking_id;
             
             INSERT INTO public.financial_ledger (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description) VALUES
             (NEW.booking_id, v_sched_date, NEW.id, 'PROVIDER_PAYABLE_LIABILITY', COALESCE(v_net, 0), 'debit', 'PAYMENT_REFUND', 'Reverse provider'),
             (NEW.booking_id, v_sched_date, NEW.id, 'PLATFORM_REVENUE_EQUITY', v_platform_fee, 'debit', 'PAYMENT_REFUND', 'Reverse platform'),
             (NEW.booking_id, v_sched_date, NEW.id, 'TAX_PAYABLE_LIABILITY', v_tax, 'debit', 'PAYMENT_REFUND', 'Reverse tax');
        ELSE
             -- Reverse Escrow
             INSERT INTO public.financial_ledger (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description) VALUES
             (NEW.booking_id, v_sched_date, NEW.id, 'ESCROW_HOLD_LIABILITY', NEW.amount, 'debit', 'PAYMENT_REFUND', 'Reverse escrow for refund');
        END IF;

        -- CREDIT Assets (Money leaving)
        INSERT INTO public.financial_ledger (booking_id, scheduled_date, reference_id, account_name, amount, side, transaction_type, description)
        VALUES (NEW.booking_id, v_sched_date, NEW.id, 'BANK_RAZORPAY_ASSET', NEW.amount, 'credit', 'PAYMENT_REFUND', 'Refund issued');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 6. AUDIT LOCK ENFORCEMENT ──────────────────────────────────────────────
-- Prevents editing or deleting rows where is_locked = true.
CREATE OR REPLACE FUNCTION public.enforce_ledger_lock()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_locked = true THEN
        RAISE EXCEPTION 'Ledger entry is locked and cannot be modified or deleted.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_ledger_lock ON public.financial_ledger;
CREATE TRIGGER trg_enforce_ledger_lock
    BEFORE UPDATE OR DELETE ON public.financial_ledger
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ledger_lock();

-- ── 7. MASTER WALLET-LEDGER SYNCHRONIZATION ────────────────────────────
-- Automatically updates wallets.balance when USER_WALLET_LIABILITY is hit.
CREATE OR REPLACE FUNCTION public.sync_wallet_from_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- This account represents what the platform owes the user (Liability)
    -- Debit = We owe less (User spent money) -> Balance decreases
    -- Credit = We owe more (User received money) -> Balance increases
    
    IF NEW.account_name = 'USER_WALLET_LIABILITY' THEN
        -- 1. Identify the user.
        -- We can get this from payments (if booking_id exists) or wallet_transactions (if reference_id exists)
        IF NEW.booking_id IS NOT NULL THEN
            SELECT customer_id INTO v_user_id FROM public.bookings WHERE id = NEW.booking_id;
        ELSIF NEW.reference_id IS NOT NULL THEN
            SELECT customer_id INTO v_user_id FROM public.wallets WHERE id = (SELECT wallet_id FROM public.wallet_transactions WHERE id = NEW.reference_id);
        END IF;

        IF v_user_id IS NOT NULL THEN
            UPDATE public.wallets
            SET 
                balance = balance + (CASE WHEN NEW.side = 'credit' THEN NEW.amount ELSE -NEW.amount END),
                updated_at = NOW()
            WHERE customer_id = v_user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_wallet_from_ledger ON public.financial_ledger;
CREATE TRIGGER trg_sync_wallet_from_ledger
    AFTER INSERT ON public.financial_ledger
    FOR EACH ROW EXECUTE FUNCTION public.sync_wallet_from_ledger();

-- ── 8. ADMIN FINANCIAL REPORTING RPCs ─────────────────────────────────────

-- A. High-level dashboard summary
CREATE OR REPLACE FUNCTION public.get_financial_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT json_build_object(
        'platform_revenue', COALESCE(SUM(CASE WHEN account_name = 'PLATFORM_REVENUE_EQUITY' THEN (CASE WHEN side = 'credit' THEN amount ELSE -amount END) ELSE 0 END), 0),
        'tax_payable',      COALESCE(SUM(CASE WHEN account_name = 'TAX_PAYABLE_LIABILITY' THEN (CASE WHEN side = 'credit' THEN amount ELSE -amount END) ELSE 0 END), 0),
        'escrow_balance',   COALESCE(SUM(CASE WHEN account_name = 'ESCROW_HOLD_LIABILITY' THEN (CASE WHEN side = 'credit' THEN amount ELSE -amount END) ELSE 0 END), 0),
        'provider_payable', COALESCE(SUM(CASE WHEN account_name = 'PROVIDER_PAYABLE_LIABILITY' THEN (CASE WHEN side = 'credit' THEN amount ELSE -amount END) ELSE 0 END), 0),
        'wallet_total',     COALESCE(SUM(CASE WHEN account_name = 'USER_WALLET_LIABILITY'   THEN (CASE WHEN side = 'credit' THEN amount ELSE -amount END) ELSE 0 END), 0)
    ) INTO result
    FROM public.financial_ledger;
    
    RETURN result;
END;
$$;

-- B. Per-booking audit trail
CREATE OR REPLACE FUNCTION public.get_booking_ledger_audit(p_booking_id UUID)
RETURNS SETOF public.financial_ledger
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.financial_ledger 
    WHERE booking_id = p_booking_id 
    ORDER BY created_at ASC;
$$;

-- C. Daily Closure (Locking the books)
CREATE OR REPLACE FUNCTION public.close_financial_day(p_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_unbalanced_count INTEGER;
BEGIN
    -- 1. Check if everything balances for this day
    SELECT COUNT(*) INTO v_unbalanced_count
    FROM public.ledger_reconciliation_audit
    WHERE scheduled_date = p_date;
    
    IF v_unbalanced_count > 0 THEN
        RAISE EXCEPTION 'Cannot close day: % bookings are unbalanced for date %', v_unbalanced_count, p_date;
    END IF;

    -- 2. Lock the entries
    UPDATE public.financial_ledger
    SET is_locked = true, reconciled_at = NOW()
    WHERE scheduled_date = p_date AND is_locked = false;

    RETURN json_build_object('status', 'success', 'date', p_date, 'reconciled_at', NOW());
END;
$$;

SELECT '074_financial_ledger_v5: Daily Closure & Master Sync Applied.' as status;
