-- Check what services table actually exists and has data
SELECT 
    table_name,
    (xpath('/row/count/text()', query_to_xml(format('SELECT COUNT(*) FROM %I', table_name), true, true, '')))[1]::text::int AS row_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('services', 'service_categories', 'service_subcategories', 'subcategories')
ORDER BY table_name;

-- Also show first few rows from whatever has data
SELECT id, name, is_active FROM public.service_subcategories WHERE is_active = true LIMIT 5;
