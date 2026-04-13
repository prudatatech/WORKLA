SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'service_subcategories' 
AND column_name IN ('long_description', 'benefits', 'exclusions', 'faqs', 'gallery_urls');
