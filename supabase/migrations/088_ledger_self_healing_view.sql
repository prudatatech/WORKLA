-- ==============================================================
-- ELITE HARDENING: Operational Oversight & Ledger Health
-- Purpose: Detect financial discrepancies and audit internal state.
-- ==============================================================

-- 🔍 Ledger Discrepancy Detector
-- Double-entry system: Sum of all credits and debits for a reference_id (booking) MUST be zero.
CREATE OR REPLACE VIEW public.ledger_health_report AS
SELECT 
    reference_id,
    b.booking_number,
    b.status AS booking_status,
    SUM(CASE WHEN side = 'credit' THEN amount ELSE -amount END) AS net_balance,
    COUNT(*) AS total_entries,
    MAX(fl.created_at) AS last_entry_at
FROM public.financial_ledger fl
LEFT JOIN public.bookings b ON b.id = fl.reference_id
GROUP BY reference_id, b.booking_number, b.status
HAVING ABS(SUM(CASE WHEN side = 'credit' THEN amount ELSE -amount END)) > 0.01;

-- 🛡️ Refund Integrity: Log refund_id in ledger
-- This is a documentation/convention change, but we ensure the view supports it.
COMMENT ON COLUMN public.financial_ledger.reference_id IS 'References booking_id or refund_id depending on transaction_type';

-- 📊 Platform Revenue Snapshot
CREATE OR REPLACE VIEW public.platform_revenue_analytics AS
SELECT 
    DATE_TRUNC('day', created_at) AS day,
    SUM(amount) FILTER (WHERE account_name = 'PLATFORM_REVENUE_ACCOUNT' AND side = 'credit') AS gross_revenue,
    SUM(amount) FILTER (WHERE account_name = 'MARKETING_EXPENSE_ACCOUNT' AND side = 'debit') AS marketing_spend,
    (SUM(amount) FILTER (WHERE account_name = 'PLATFORM_REVENUE_ACCOUNT' AND side = 'credit') - 
     COALESCE(SUM(amount) FILTER (WHERE account_name = 'MARKETING_EXPENSE_ACCOUNT' AND side = 'debit'), 0)) AS net_platform_margin
FROM public.financial_ledger
WHERE transaction_type IN ('BOOKING_PAYMENT', 'REFERRAL_REWARD', 'CANCELLATION_FEE')
GROUP BY 1
ORDER BY 1 DESC;

NOTIFY pgrst, 'reload schema';

SELECT 'Operational Oversight Views Deployed ✅' AS result;
