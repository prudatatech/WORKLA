-- Create an RPC to fetch all public tables
-- We use this because PostgREST does not expose information_schema to the client
CREATE OR REPLACE FUNCTION get_all_public_tables()
RETURNS TABLE (table_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY 
    SELECT t.table_name::text
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' 
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name ASC;
END;
$$;
