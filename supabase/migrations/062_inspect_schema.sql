-- =========================================================================
-- SCHEMA INSPECTION: Check Foreign Key targets for booking_status_history
-- =========================================================================

SELECT
    tc.table_schema, 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'booking_status_history';

-- Also check if there are multiple bookings tables and their IDs
SELECT 'bookings' as tbl, count(*) from public.bookings
UNION ALL
SELECT 'bookings_old' as tbl, count(*) from public.bookings_old;
