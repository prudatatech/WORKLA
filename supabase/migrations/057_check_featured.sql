-- Check if the featured-related columns exist on services/service_subcategories
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'service_subcategories'
ORDER BY ordinal_position;

-- Check if any services are flagged as popular/recommended
SELECT 
    COUNT(*) FILTER (WHERE is_popular = true) as popular_count,
    COUNT(*) FILTER (WHERE is_recommended = true) as recommended_count
FROM public.service_subcategories;
