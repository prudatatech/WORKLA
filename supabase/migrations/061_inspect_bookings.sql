-- =========================================================================
-- SCHEMA INSPECTION: Check 'bookings' table structure and Primary Keys
-- =========================================================================

-- 1. Check columns in bookings
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'bookings' AND table_schema = 'public';

-- 2. Check Primary Key for bookings
SELECT 
    ku.table_name,
    ku.column_name,
    tc.constraint_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS ku
      ON tc.constraint_name = ku.constraint_name 
      AND tc.table_schema = ku.table_schema
WHERE 
    tc.constraint_type = 'PRIMARY KEY' 
    AND tc.table_name = 'bookings';

-- 3. Check for any unique indexes on bookings(id)
SELECT 
    i.relname as index_name,
    a.attname as column_name,
    ix.indisunique,
    ix.indisprimary
FROM 
    pg_class t,
    pg_class i,
    pg_index ix,
    pg_attribute a
WHERE 
    t.oid = ix.indrelid
    AND i.oid = ix.indexrelid
    AND a.attrelid = t.oid
    AND a.attnum = ANY(ix.indkey)
    AND t.relkind = 'r'
    AND t.relname = 'bookings';
