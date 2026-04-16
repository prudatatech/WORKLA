-- MANUAL SYNC FOR KUSHAGRA ELECTRICIAN
-- Run this in your Supabase SQL Editor AFTER running the 100_fix_kyc_foundation.sql script.

DO $$ 
DECLARE
    v_provider_id UUID := 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';
BEGIN
    -- Ensure the provider exists in profiles/provider_details
    -- If they don't exist, this script will notify you.
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_provider_id) THEN
        RAISE NOTICE 'Provider with ID % not found in profiles table.', v_provider_id;
        RETURN;
    END IF;

    -- 1. Insert Aadhaar Record
    INSERT INTO public.provider_documents (
        provider_id, 
        document_type, 
        document_url, 
        verified_status, 
        document_number
    )
    VALUES (
        v_provider_id, 
        'aadhaar', 
        v_provider_id || '/aadhaar_1776318638557.jpg', 
        'pending',
        'PENDING_ENTRY' -- Temporary number, provider can update later in app
    )
    ON CONFLICT (provider_id, document_type) DO UPDATE 
    SET document_url = EXCLUDED.document_url, 
        verified_status = 'pending';

    -- 2. Insert PAN Record
    INSERT INTO public.provider_documents (
        provider_id, 
        document_type, 
        document_url, 
        verified_status, 
        document_number
    )
    VALUES (
        v_provider_id, 
        'pan', 
        v_provider_id || '/pan_1776318638594.jpg', 
        'pending',
        'PENDING_ENTRY'
    )
    ON CONFLICT (provider_id, document_type) DO UPDATE 
    SET document_url = EXCLUDED.document_url, 
        verified_status = 'pending';

    -- 3. Update provider status to pending review
    UPDATE public.provider_details
    SET verification_status = 'pending'
    WHERE provider_id = v_provider_id;

    RAISE NOTICE 'Successfully synced documents for Kushagra electrician.';
END $$;
