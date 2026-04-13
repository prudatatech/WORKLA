-- =========================================================================
-- DIAGNOSTIC: CHECK BOOKING STATE AFTER ACCEPTANCE
-- =========================================================================

SELECT 
    id, 
    booking_number, 
    status, 
    provider_id, 
    customer_id, 
    scheduled_date, 
    service_name_snapshot
FROM public.bookings
WHERE id = 'c45664a9-1787-4a59-80e8-cd82eb649646';

-- Also check if the provider_id exists in profiles/provider_details
SELECT p.id, p.full_name, pd.is_online, pd.verification_status
FROM public.profiles p
LEFT JOIN public.provider_details pd ON pd.provider_id = p.id
WHERE p.id = (SELECT provider_id FROM public.bookings WHERE id = 'c45664a9-1787-4a59-80e8-cd82eb649646');

-- Check RLS on bookings
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'bookings';
