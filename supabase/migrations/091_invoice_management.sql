-- ==============================================================
-- Migration: 091_invoice_management.sql
-- Description: GST-Compliant Invoicing System
-- ==============================================================

-- 1. Add SAC (Services Accounting Code) to service_subcategories
-- Default 9987: Maintenance and repair services
ALTER TABLE public.service_subcategories ADD COLUMN IF NOT EXISTS sac_code VARCHAR(10) DEFAULT '9987';

-- 2. Create Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL,
    scheduled_date  DATE NOT NULL, -- Required for composite FK to bookings
    invoice_number  VARCHAR(50) UNIQUE NOT NULL,
    customer_id     UUID NOT NULL REFERENCES public.profiles(id),
    provider_id     UUID REFERENCES public.profiles(id),
    
    -- Financial Snapshots
    total_amount    DECIMAL(12,2) NOT NULL,
    tax_amount      DECIMAL(12,2) NOT NULL,
    cgst_amount     DECIMAL(12,2) NOT NULL,
    sgst_amount     DECIMAL(12,2) NOT NULL,
    platform_fee    DECIMAL(12,2) NOT NULL DEFAULT 0,
    
    -- Status & Storage
    status          VARCHAR(20) NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'cancelled')),
    storage_path    TEXT, -- Path in Supabase storage (e.g., invoices/WK-2026-0001.pdf)
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_invoice_booking
        FOREIGN KEY (booking_id, scheduled_date)
        REFERENCES public.bookings(id, scheduled_date)
        ON DELETE CASCADE,
    
    UNIQUE(booking_id) -- Still one invoice per booking
);

-- 3. RLS & Permissions
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view their own invoices"
ON public.invoices FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Admins can manage all invoices"
ON public.invoices FOR ALL
USING (public.is_admin());

-- 4. Function to generate sequential invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
    v_year TEXT := TO_CHAR(NOW(), 'YYYY');
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO v_count FROM public.invoices WHERE TO_CHAR(created_at, 'YYYY') = v_year;
    RETURN 'WK-' || v_year || '-' || LPAD(v_count::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 5. Helper function for PDF content fetching
CREATE OR REPLACE FUNCTION public.get_invoice_data(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'invoice_number', inv.invoice_number,
        'created_at', inv.created_at,
        'customer_name', p.full_name,
        'customer_phone', p.phone,
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

-- 6. Storage Bucket Setup
-- Note: This is usually done via API/Dashboard, but we'll assume 'invoices' bucket exists or is private.
-- We can add a policy for it if we were managing storage objects directly in SQL.

SELECT '091_invoice_management: GST Invoicing Applied ✅' as result;
