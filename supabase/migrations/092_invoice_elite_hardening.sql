-- ==============================================================
-- Migration: 092_invoice_elite_hardening.sql
-- Description: Elite Hardening for Invoicing (GSTIN & Security)
-- ==============================================================

-- 1. B2B & Compliance Support: Add GSTIN, Business Name, and Place of Supply
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50) DEFAULT 'Karnataka'; -- Default to platform base state

-- 2. Compliance enhancement: Support for Credit Notes
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'INVOICE' CHECK (invoice_type IN ('INVOICE', 'CREDIT_NOTE')),
ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Storage Security (RLS for Invoices Bucket)
-- We'll assume the 'invoices' bucket exists.
-- RLS for objects in the 'invoices' bucket.
-- Policies are applied to storage.objects.

DO $$ 
BEGIN
    -- Only owners or admins can select invoices
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Invoices are private to customer'
    ) THEN
        CREATE POLICY "Invoices are private to customer"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'invoices' 
            AND (
                -- Check if the object name (invoice_number.pdf) belongs to an invoice the user owns
                EXISTS (
                    SELECT 1 FROM public.invoices i
                    WHERE i.storage_path = 'invoices/' || name -- Match by full path
                    AND i.customer_id = auth.uid()
                )
                OR public.is_admin()
            )
        );
    END IF;
END $$;

-- 4. Updated Helper function for PDF (includes B2B fields)
CREATE OR REPLACE FUNCTION public.get_invoice_data(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'invoice_number', inv.invoice_number,
        'invoice_type', inv.invoice_type,
        'created_at', inv.created_at,
        'customer_name', COALESCE(p.business_name, p.full_name),
        'customer_phone', p.phone,
        'customer_gstin', p.gstin,
        'customer_place_of_supply', p.place_of_supply,
        'customer_address', b.address_snapshot,
        'service_name', b.service_name_snapshot,
        'sac_code', ss.sac_code,
        'total_amount', inv.total_amount,
        'tax_amount', inv.tax_amount,
        'cgst', inv.cgst_amount,
        'sgst', inv.sgst_amount,
        'platform_fee', inv.platform_fee,
        'status', b.status
    ) INTO result
    FROM public.invoices inv
    JOIN public.bookings b ON inv.booking_id = b.id
    JOIN public.profiles p ON b.customer_id = p.id
    LEFT JOIN public.service_subcategories ss ON b.subcategory_id = ss.id
    WHERE inv.booking_id = p_booking_id;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Admin View: Professional GST Audit Report
CREATE OR REPLACE VIEW public.admin_gst_report AS
SELECT 
    inv.invoice_number,
    b.booking_number,
    inv.created_at as invoice_date,
    p.full_name as customer_name,
    p.gstin as customer_gstin,
    inv.total_amount,
    inv.tax_amount,
    inv.cgst_amount,
    inv.sgst_amount,
    ss.sac_code,
    b.status as booking_status
FROM public.invoices inv
JOIN public.bookings b ON inv.booking_id = b.id
JOIN public.profiles p ON inv.customer_id = p.id
LEFT JOIN public.service_subcategories ss ON b.subcategory_id = ss.id
ORDER BY inv.created_at DESC;

SELECT '092_invoice_elite_hardening: Applied ✅' as result;
