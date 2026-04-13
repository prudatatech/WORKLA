-- Add work proof columns to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS work_proof_start_url TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS work_proof_complete_url TEXT;

-- Create payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES public.profiles(id),
    amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, completed
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS for payout_requests
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view their own payout requests" ON public.payout_requests;
CREATE POLICY "Providers can view their own payout requests" 
    ON public.payout_requests FOR SELECT 
    USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Providers can create their own payout requests" ON public.payout_requests;
CREATE POLICY "Providers can create their own payout requests" 
    ON public.payout_requests FOR INSERT 
    WITH CHECK (auth.uid() = provider_id);

-- Storage bucket for work proofs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('work-proofs', 'work-proofs', true) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('provider-documents', 'provider-documents', false) 
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies for work-proofs
-- 1. Allow public read (since bucket is public, but let's be explicit if needed)
DROP POLICY IF EXISTS "Public Read for work-proofs" ON storage.objects;
CREATE POLICY "Public Read for work-proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'work-proofs');

-- 2. Allow providers to upload their work proofs
DROP POLICY IF EXISTS "Providers can upload work-proofs" ON storage.objects;
CREATE POLICY "Providers can upload work-proofs"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'work-proofs' 
    AND auth.role() = 'authenticated'
);
