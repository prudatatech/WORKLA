-- =========================================================================
-- SINGLE KILLER QUERY: Shows exactly what's broken
-- Run this ONE query in Supabase SQL Editor and paste the result
-- =========================================================================

SELECT 
    '--- PROVIDER STATUS ---' AS section,
    pd.provider_id,
    pd.is_online,
    pd.verification_status,
    CASE WHEN pd.is_online = TRUE THEN '✅' ELSE '❌ OFFLINE' END AS online_check,
    CASE WHEN pd.verification_status = 'verified' THEN '✅' ELSE '❌ STATUS: ' || pd.verification_status END AS verified_check,
    CASE WHEN pl.provider_id IS NOT NULL THEN '✅ lat=' || pl.latitude || ' lng=' || pl.longitude ELSE '❌ NO LOCATION' END AS location_check,
    CASE WHEN ps.provider_id IS NOT NULL THEN '✅ skills=' || COUNT(ps.id) ELSE '❌ NO SKILLS' END AS skills_check,
    '--- LATEST BOOKING ---' AS booking_section,
    b.id AS booking_id,
    b.subcategory_id AS booking_subcategory,
    b.status AS booking_status,
    b.service_name_snapshot,
    CASE WHEN EXISTS (
        SELECT 1 FROM public.provider_services ps2 
        WHERE ps2.provider_id = pd.provider_id 
          AND ps2.subcategory_id = b.subcategory_id 
          AND ps2.is_active = TRUE
    ) THEN '✅ SKILL MATCHES BOOKING' ELSE '❌ SKILL DOES NOT MATCH BOOKING' END AS skill_match_check,
    '--- JOB OFFERS ---' AS offers_section,
    (SELECT COUNT(*) FROM public.job_offers WHERE status = 'pending') AS pending_offers,
    (SELECT COUNT(*) FROM public.job_offers WHERE status = 'pending' AND expires_at > NOW()) AS active_offers,
    (SELECT COUNT(*) FROM public.job_offers WHERE status = 'expired') AS expired_offers
FROM public.provider_details pd
LEFT JOIN public.provider_locations pl ON pl.provider_id = pd.provider_id
LEFT JOIN public.provider_services ps ON ps.provider_id = pd.provider_id AND ps.is_active = TRUE
CROSS JOIN (SELECT id, subcategory_id, status, service_name_snapshot FROM public.bookings ORDER BY created_at DESC LIMIT 1) b
GROUP BY pd.provider_id, pd.is_online, pd.verification_status, pl.provider_id, pl.latitude, pl.longitude, ps.provider_id,
         b.id, b.subcategory_id, b.status, b.service_name_snapshot;
