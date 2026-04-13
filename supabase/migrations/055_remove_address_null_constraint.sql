-- Fix NOT NULL constraints on legacy columns in customer_addresses 
-- The new frontend uses 'full_address', so 'address_line' cannot remain NOT NULL.

ALTER TABLE public.customer_addresses 
ALTER COLUMN address_line DROP NOT NULL;

-- Also drop NOT NULL from other legacy fields just in case they were added
-- Note: city and pincode were not originally NOT NULL in supabase_v3_nuclear.sql, 
-- but we drop them just to be absolutely safe against different schema versions.
ALTER TABLE public.customer_addresses 
ALTER COLUMN city DROP NOT NULL;

ALTER TABLE public.customer_addresses 
ALTER COLUMN pincode DROP NOT NULL;

-- Optional: If you haven't run the previous script to add the new columns, run these again:
ALTER TABLE public.customer_addresses 
ADD COLUMN IF NOT EXISTS name VARCHAR(255),
ADD COLUMN IF NOT EXISTS full_address TEXT,
ADD COLUMN IF NOT EXISTS landmark TEXT;
