-- 0. Ensure the 'invoices' table exists first (Fallback for missing migrations)
CREATE TABLE IF NOT EXISTS public.invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL UNIQUE,
    scheduled_date  DATE NOT NULL,
    invoice_number  VARCHAR(50) UNIQUE NOT NULL,
    customer_id     UUID NOT NULL REFERENCES public.profiles(id),
    provider_id     UUID REFERENCES public.profiles(id),
    total_amount    DECIMAL(12,2) NOT NULL,
    tax_amount      DECIMAL(12,2) NOT NULL,
    cgst_amount     DECIMAL(12,2) NOT NULL,
    sgst_amount     DECIMAL(12,2) NOT NULL,
    platform_fee    DECIMAL(12,2) NOT NULL DEFAULT 0,
    invoice_type    VARCHAR(20) DEFAULT 'INVOICE',
    status          VARCHAR(20) NOT NULL DEFAULT 'generated',
    storage_path    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure sequential invoice number generator exists
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    v_year TEXT := TO_CHAR(NOW(), 'YYYY');
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO v_count FROM public.invoices WHERE TO_CHAR(created_at, 'YYYY') = v_year;
    RETURN 'WK-' || v_year || '-' || LPAD(COALESCE(v_count, 1)::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Ensure RLS is enabled on the table
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 1. Ensure the 'invoices' storage bucket exists
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
