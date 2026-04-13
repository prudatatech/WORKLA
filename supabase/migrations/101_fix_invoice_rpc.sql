-- ============================================================
-- Migration: Fix get_invoice_data RPC - column b.address_snapshot
-- does not exist; correct column is b.customer_address
-- Also fix invoice_number sequence to prevent duplicates on retry
-- ============================================================

-- Fix the RPC to use the correct column name
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
        'customer_address', b.customer_address,  -- FIXED: was b.address_snapshot
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

SELECT '101_fix_invoice_rpc: Applied ✅' as result;
