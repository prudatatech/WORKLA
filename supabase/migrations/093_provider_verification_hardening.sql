-- 1. Ensure provider_documents table exists
CREATE TABLE IF NOT EXISTS public.provider_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_type VARCHAR(50) CHECK (document_type IN ('aadhaar', 'pan', 'license', 'certificate')),
    document_number VARCHAR(100),
    document_url TEXT NOT NULL,
    verified_status VARCHAR(20) DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    rejection_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhance provider_documents table (for redundancy if it already existed but missed these columns)
ALTER TABLE public.provider_documents 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1.5 Fraud Prevention: Unique constraint on (type, number) per active/verified doc
-- We use a partial index to ignore 'rejected' documents so they can be re-uploaded.
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_docs_unique_active 
ON public.provider_documents (document_type, document_number)
WHERE verified_status != 'rejected';

-- Add a trigger to update updated_at
CREATE OR REPLACE FUNCTION update_provider_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provider_documents_updated_at ON public.provider_documents;
CREATE TRIGGER trg_provider_documents_updated_at
BEFORE UPDATE ON public.provider_documents
FOR EACH ROW EXECUTE FUNCTION update_provider_documents_updated_at();

DROP TRIGGER IF EXISTS tr_update_provider_documents_updated_at ON public.provider_documents;
CREATE TRIGGER tr_update_provider_documents_updated_at
BEFORE UPDATE ON public.provider_documents
FOR EACH ROW
EXECUTE FUNCTION update_provider_documents_updated_at();

-- 2. Storage Security (RLS for provider-documents bucket)
-- Note: Assuming the bucket 'provider-documents' is already created or will be.
INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-documents', 'provider-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Providers can only upload and view their own documents
DROP POLICY IF EXISTS "Providers can manage their own documents" ON storage.objects;
CREATE POLICY "Providers can manage their own documents"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'provider-documents' AND (storage.foldername(name))[1]::uuid = auth.uid())
WITH CHECK (bucket_id = 'provider-documents' AND (storage.foldername(name))[1]::uuid = auth.uid());

-- Policy: Admins can view all documents for review
DROP POLICY IF EXISTS "Admins can view all provider documents" ON storage.objects;
CREATE POLICY "Admins can view all provider documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'provider-documents' AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 3. Admin View for Pending Verifications
CREATE OR REPLACE VIEW public.admin_pending_verifications AS
SELECT 
    pd.id as document_id,
    pd.provider_id,
    p.full_name as provider_name,
    p.phone as provider_phone,
    pd.document_type,
    pd.document_number,
    pd.document_url,
    pd.verified_status,
    pd.uploaded_at,
    pr.business_name
FROM public.provider_documents pd
JOIN public.profiles p ON pd.provider_id = p.id
JOIN public.provider_details pr ON pd.provider_id = pr.provider_id
WHERE pd.verified_status = 'pending'
ORDER BY pd.uploaded_at ASC;

-- 4. Function to Approve/Reject Document
CREATE OR REPLACE FUNCTION public.review_provider_document(
    p_document_id UUID,
    p_status VARCHAR(20),
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_provider_id UUID;
    v_final_status VARCHAR(20);
BEGIN
    -- Authorization check: only admins
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- Update document status
    UPDATE public.provider_documents
    SET 
        verified_status = p_status,
        rejection_reason = p_rejection_reason,
        verified_at = CASE WHEN p_status = 'verified' THEN NOW() ELSE NULL END
    WHERE id = p_document_id
    RETURNING provider_id INTO v_provider_id;

    -- If all mandatory documents (aadhaar & pan) are verified, update provider_details status
    -- For now, let's just update the provider_details if this one is verified.
    -- In a real scenario, we might wait for multiple docs.
    IF p_status = 'verified' THEN
        -- Check if there are other pending docs
        IF NOT EXISTS (
            SELECT 1 FROM public.provider_documents 
            WHERE provider_id = v_provider_id AND verified_status = 'pending'
        ) THEN
            UPDATE public.provider_details
            SET verification_status = 'verified'
            WHERE provider_id = v_provider_id;
        END IF;
    ELSIF p_status = 'rejected' THEN
        -- Determine the final status for provider_details
        IF EXISTS (SELECT 1 FROM public.provider_documents WHERE provider_id = v_provider_id AND verified_status = 'verified') THEN
            v_final_status := 'partially_verified'; -- Or 'pending_reupload' depending on desired logic
        ELSE
            v_final_status := 'rejected';
        END IF;

        UPDATE public.provider_details
        SET verification_status = v_final_status,
            updated_at = NOW()
        WHERE provider_id = v_provider_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Elite Security: Get Signed URL RPC
-- This allows the admin dashboard to fetch temporary secure links without public access.
CREATE OR REPLACE FUNCTION public.get_admin_signed_url(p_file_path TEXT)
RETURNS TEXT AS $$
DECLARE
    v_url TEXT;
BEGIN
    -- This is a placeholder for the logic; in practice, signed URLs are generated via the Supabase Client (Auth/Storage).
    -- However, we can track access by creating a view or helper.
    RETURN p_file_path; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
