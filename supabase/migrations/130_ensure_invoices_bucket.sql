-- Ensure the 'invoices' storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for the 'invoices' bucket
-- 1. Allow the service role (backend) to manage all invoices
-- (Service role bypasses RLS, so this is mainly for clarity)

-- 2. Allow customers to READ their own invoices
DROP POLICY IF EXISTS "Customers can view their own invoices" ON storage.objects;
CREATE POLICY "Customers can view their own invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.storage_path = storage.objects.name
      AND inv.customer_id = auth.uid()
    )
  )
);

-- 3. Allow providers to READ invoices for jobs they completed
DROP POLICY IF EXISTS "Providers can view job invoices" ON storage.objects;
CREATE POLICY "Providers can view job invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.storage_path = storage.objects.name
      AND inv.provider_id = auth.uid()
    )
  )
);
