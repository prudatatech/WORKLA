-- ==========================================
-- FIX: user_profiles RLS and Profile Sync
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Correct Foreign Keys to reference auth.users
-- This ensures that public profiles are linked to the actual Supabase Auth accounts
ALTER TABLE public.user_profiles 
  DROP CONSTRAINT IF EXISTS user_profiles_user_id_fkey,
  ADD CONSTRAINT user_profiles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.service_providers 
  DROP CONSTRAINT IF EXISTS service_providers_user_id_fkey,
  ADD CONSTRAINT service_providers_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Add INSERT & SELECT Policies
-- This allows the trigger (or the user during sign up) to create and see their profile
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile" ON public.user_profiles 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can SELECT own profile" ON public.user_profiles;
CREATE POLICY "Users can SELECT own profile" ON public.user_profiles 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Providers can insert own record" ON public.service_providers;
CREATE POLICY "Providers can insert own record" ON public.service_providers 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Providers can SELECT own record" ON public.service_providers;
CREATE POLICY "Providers can SELECT own record" ON public.service_providers 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Providers update own data" ON public.service_providers;
CREATE POLICY "Providers update own data" ON public.service_providers 
  FOR UPDATE USING (auth.uid() = user_id);

-- 3. Additional Onboarding Tables
-- provider_documents
ALTER TABLE IF EXISTS public.provider_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers manage own documents" ON public.provider_documents;
CREATE POLICY "Providers manage own documents" ON public.provider_documents 
  FOR ALL USING (auth.uid() = provider_id);

-- provider_bank_accounts
CREATE TABLE IF NOT EXISTS public.provider_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
ALTER TABLE public.provider_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers manage own bank" ON public.provider_bank_accounts;
CREATE POLICY "Providers manage own bank" ON public.provider_bank_accounts 
  FOR ALL USING (auth.uid() = provider_id);

-- verification_requests
CREATE TABLE IF NOT EXISTS public.verification_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers manage own requests" ON public.verification_requests;
CREATE POLICY "Providers manage own requests" ON public.verification_requests 
  FOR ALL USING (auth.uid() = provider_id);

-- user_profiles (Public access for names)
DROP POLICY IF EXISTS "Allow public to see names" ON public.user_profiles;
CREATE POLICY "Allow public to see names" ON public.user_profiles
  FOR SELECT USING (true);

-- 4. Create Profile Sync Trigger
-- This function automatically creates a profile record whenever a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Ensure RLS is still enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

-- 5. Grant permissions (just in case)
GRANT ALL ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.service_providers TO authenticated;
-- 6. Bookings & Earnings RLS
-- Bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers manage own bookings" ON public.bookings;
CREATE POLICY "Customers manage own bookings" ON public.bookings 
  FOR ALL USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Providers view assigned bookings" ON public.bookings;
CREATE POLICY "Providers view assigned bookings" ON public.bookings 
  FOR SELECT USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Providers update assigned bookings" ON public.bookings;
CREATE POLICY "Providers update assigned bookings" ON public.bookings 
  FOR UPDATE USING (auth.uid() = provider_id);

-- Worker Earnings
CREATE TABLE IF NOT EXISTS public.worker_earnings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_id      UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    gross_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
    platform_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(10,2) GENERATED ALWAYS AS (gross_amount - platform_fee) STORED,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','withheld')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.worker_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers view own earnings" ON public.worker_earnings;
CREATE POLICY "Providers view own earnings" ON public.worker_earnings 
  FOR SELECT USING (auth.uid() = provider_id);

-- Push Tokens (used for notifications)
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT CHECK (platform IN ('ios','android','web')),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, token)
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own tokens" ON public.push_tokens;
CREATE POLICY "Users manage own tokens" ON public.push_tokens 
  FOR ALL USING (auth.uid() = user_id);

-- Grant permissions for new tables
GRANT ALL ON public.bookings TO authenticated;
GRANT ALL ON public.worker_earnings TO authenticated;
GRANT ALL ON public.push_tokens TO authenticated;
