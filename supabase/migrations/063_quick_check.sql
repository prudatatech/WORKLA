-- =========================================================================
-- QUICK CHECK: Are there ANY confirmed bookings assigned to a provider?
-- =========================================================================

SELECT 
    id, 
    status, 
    provider_id, 
    customer_id, 
    service_name_snapshot,
    scheduled_date,
    created_at
FROM public.bookings
WHERE status IN ('confirmed', 'en_route', 'arrived', 'in_progress')
ORDER BY created_at DESC
LIMIT 10;
