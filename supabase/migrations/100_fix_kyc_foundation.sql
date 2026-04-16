-- 100_fix_kyc_foundation.sql
-- Master script to re-initialize missing KYC tables, add required unique constraints, 
-- and restore missing Marketplace (Explore) functions.

-- ==========================================
-- 1. KYC FOUNDATION
-- ==========================================

-- Create provider_documents table if it doesn't exist
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

-- Ensure UNIQUE(provider_id, document_type) for 'upsert' to work
DO $$ 
BEGIN
    DELETE FROM public.provider_documents a
    USING public.provider_documents b
    WHERE a.id < b.id
      AND a.provider_id = b.provider_id
      AND a.document_type = b.document_type;
      
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_documents_provider_type_unique') THEN
        ALTER TABLE public.provider_documents ADD CONSTRAINT provider_documents_provider_type_unique UNIQUE (provider_id, document_type);
    END IF;
END $$;

-- Create provider_bank_accounts table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.provider_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_holder_name VARCHAR(255) NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    ifsc_code VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    branch_name VARCHAR(100),
    account_type VARCHAR(20) DEFAULT 'savings',
    is_verified BOOLEAN DEFAULT FALSE,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure UNIQUE(provider_id)
DO $$ 
BEGIN
    DELETE FROM public.provider_bank_accounts a
    USING public.provider_bank_accounts b
    WHERE a.id < b.id
      AND a.provider_id = b.provider_id;
      
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_bank_accounts_provider_id_unique') THEN
        ALTER TABLE public.provider_bank_accounts ADD CONSTRAINT provider_bank_accounts_provider_id_unique UNIQUE (provider_id);
    END IF;
END $$;

-- ==========================================
-- 2. BOOKINGS HARDENING
-- ==========================================

-- Ensure subcategory_id column exists in bookings table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'subcategory_id') THEN
        ALTER TABLE public.bookings ADD COLUMN subcategory_id UUID REFERENCES public.service_subcategories(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Ensure service_name_snapshot column exists in bookings table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'service_name_snapshot') THEN
        ALTER TABLE public.bookings ADD COLUMN service_name_snapshot VARCHAR(255);
        
        -- Populate it with a default from the subcategories if possible
        -- This join only works if subcategory_id exists (which we ensured above)
        UPDATE public.bookings b
        SET service_name_snapshot = s.name
        FROM public.service_subcategories s
        WHERE b.subcategory_id = s.id
        AND b.service_name_snapshot IS NULL;
    END IF;
END $$;

-- ==========================================
-- 3. MARKETPLACE (EXPLORE) FUNCTIONS
-- ==========================================

-- Helper functions for distance calculation
CREATE OR REPLACE FUNCTION pmin(a float, b float) RETURNS float AS $$
  SELECT CASE WHEN a < b THEN a ELSE b END;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION pmax(a float, b float) RETURNS float AS $$
  SELECT CASE WHEN a > b THEN a ELSE b END;
$$ LANGUAGE SQL IMMUTABLE;

-- The Marketplace function used in explore.tsx
DROP FUNCTION IF EXISTS public.get_available_jobs(UUID);

CREATE OR REPLACE FUNCTION public.get_available_jobs(p_provider_id UUID)
RETURNS TABLE (
    id UUID,
    service_name TEXT,
    customer_address TEXT,
    total_amount DECIMAL,
    scheduled_date DATE,
    scheduled_time_slot TEXT,
    distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        COALESCE(b.service_name_snapshot, 'Service Appointment')::TEXT AS service_name,
        b.customer_address::TEXT,
        b.total_amount::DECIMAL,
        b.scheduled_date::DATE,
        b.scheduled_time_slot::TEXT,
        jo.distance_km::DOUBLE PRECISION
    FROM public.job_offers jo
    JOIN public.bookings b ON b.id = jo.booking_id
    WHERE jo.provider_id = p_provider_id
      AND jo.status = 'pending'
      AND jo.expires_at > NOW()
      AND b.status IN ('requested', 'searching')
    ORDER BY b.created_at DESC;
END;
$$;

-- Ensure job_offers unique constraint (required for dispatch_job)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_offers_booking_id_provider_id_key') THEN
        ALTER TABLE public.job_offers ADD CONSTRAINT job_offers_booking_id_provider_id_key UNIQUE (booking_id, provider_id);
    END IF;
END $$;

-- ==========================================
-- 3. SECURITY & POLICIES
-- ==========================================

ALTER TABLE public.provider_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own documents" ON public.provider_documents;
CREATE POLICY "Providers manage own documents" ON public.provider_documents 
    FOR ALL USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Admins view all documents" ON public.provider_documents;
CREATE POLICY "Admins view all documents" ON public.provider_documents 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'));

DROP POLICY IF EXISTS "Providers manage own bank" ON public.provider_bank_accounts;
CREATE POLICY "Providers manage own bank" ON public.provider_bank_accounts 
    FOR ALL USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Admins view all bank details" ON public.provider_bank_accounts;
CREATE POLICY "Admins view all bank details" ON public.provider_bank_accounts 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'));

-- Reload schema cache so PostgREST sees the new function
NOTIFY pgrst, 'reload schema';
