-- Fix customer_addresses table to match frontend requirements (Swiggy/Zomato style)

-- 1. Add missing columns
ALTER TABLE public.customer_addresses 
ADD COLUMN IF NOT EXISTS name VARCHAR(255),
ADD COLUMN IF NOT EXISTS full_address TEXT,
ADD COLUMN IF NOT EXISTS landmark TEXT;

-- 2. Migrate data from old columns (optional but good practice)
-- If there's data in the old columns, we can try to concatenate them into full_address
UPDATE public.customer_addresses
SET full_address = address_line || COALESCE(', ' || city, '') || COALESCE(', ' || pincode, '')
WHERE full_address IS NULL AND address_line IS NOT NULL;

-- 3. Drop old columns if you want to keep it clean (optional - user said "proper and efficient")
-- ALTER TABLE public.customer_addresses DROP COLUMN IF EXISTS address_line;
-- ALTER TABLE public.customer_addresses DROP COLUMN IF EXISTS city;
-- ALTER TABLE public.customer_addresses DROP COLUMN IF EXISTS pincode;

-- 4. Ensure RLS is enabled and policies allow authenticated users to manage their own addresses
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own addresses" ON public.customer_addresses;
CREATE POLICY "Users can manage their own addresses" 
ON public.customer_addresses 
FOR ALL 
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

-- 5. Add index for performance
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON public.customer_addresses(customer_id);
