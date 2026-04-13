-- ==============================================================
-- 064_PROVIDER_EARNINGS_VIEW.sql
-- Purpose: Create summary view for Provider Financials dashboard
-- ==============================================================

CREATE OR REPLACE VIEW public.provider_earnings_summary AS
SELECT
    p.id AS provider_id,
    COALESCE(SUM(we.net_amount), 0) AS total_earnings,
    COALESCE(SUM(CASE WHEN we.status = 'pending' THEN we.net_amount ELSE 0 END), 0) AS pending_payout,
    COUNT(we.id) AS completed_jobs,
    COALESCE(SUM(CASE WHEN we.created_at >= date_trunc('week', now()) THEN we.net_amount ELSE 0 END), 0) AS this_week,
    COALESCE(SUM(CASE WHEN we.created_at >= date_trunc('month', now()) THEN we.net_amount ELSE 0 END), 0) AS this_month,
    COALESCE(SUM(CASE WHEN we.created_at >= date_trunc('day', now()) THEN we.net_amount ELSE 0 END), 0) AS today_net,
    COALESCE(pd.avg_rating, 0) AS rating
FROM
    public.profiles p
JOIN
    public.provider_details pd ON p.id = pd.provider_id
LEFT JOIN
    public.worker_earnings we ON p.id = we.provider_id
WHERE
    p.role = 'PROVIDER'
GROUP BY
    p.id, pd.avg_rating;

GRANT SELECT ON public.provider_earnings_summary TO authenticated;
