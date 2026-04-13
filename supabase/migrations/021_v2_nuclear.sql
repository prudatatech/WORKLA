-- ==============================================================
-- WORKLA V2 "NUCLEAR" DATABASE OVERHAUL
-- Goal: Industry-standard data normalization & RLS performance.
-- WARNING: Drops all user, provider, and transactional data.
-- ==============================================================

-- 1. DROP ALL DEPENDENT POLICIES ON CATALOG BEFORE DROPPING USERS
DROP POLICY IF EXISTS "Admins can manage categories" ON public.service_categories;
DROP POLICY IF EXISTS "Admins can manage subcategories" ON public.service_subcategories;
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;

-- 2. NUCLEAR DROP OF LEGACY TABLES
DROP TABLE IF EXISTS public.booking_photos CASCADE;
DROP TABLE IF EXISTS public.booking_items CASCADE;
DROP TABLE IF EXISTS public.booking_status_history CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.provider_services CASCADE;
DROP TABLE IF EXISTS public.provider_documents CASCADE;
DROP TABLE IF EXISTS public.provider_locations CASCADE;
DROP TABLE IF EXISTS public.service_providers CASCADE;
DROP TABLE IF EXISTS public.user_devices CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.customer CASCADE;
DROP TABLE IF EXISTS public.users CASCADE; -- The root cause of the sync issues

-- 3. CREATE V2 IAM TABLES
-- The master profiles table, strictly 1-to-1 with auth.users
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'CUSTOMER', 'PROVIDER')) DEFAULT 'CUSTOMER',
    is_admin BOOLEAN DEFAULT false,
    full_name VARCHAR(255),
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    avatar_url TEXT,
    city VARCHAR(100),
    pincode VARCHAR(20),
    gender VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extension table exclusively for providers
CREATE TABLE public.provider_details (
    provider_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    verification_status VARCHAR(50) DEFAULT 'pending',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    years_of_experience INTEGER DEFAULT 0,
    service_areas TEXT[],
    service_categories TEXT[],
    service_radius_km DOUBLE PRECISION DEFAULT 10.0,
    avg_rating DOUBLE PRECISION DEFAULT 0.0,
    total_jobs INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Live tracking isolated table for providers
CREATE TABLE public.provider_locations (
    provider_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RECREATE BOOKINGS TRANSACTIONS (V2)
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES public.provider_details(provider_id) ON DELETE SET NULL, -- Keep booking if provider leaves
    category_id UUID REFERENCES public.service_categories(id) ON DELETE RESTRICT,
    service_id UUID REFERENCES public.services(id) ON DELETE RESTRICT,
    subcategory_id UUID REFERENCES public.service_subcategories(id) ON DELETE RESTRICT,
    
    -- State Machine
    status VARCHAR(50) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'assigned', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'disputed')),
    
    scheduled_date DATE NOT NULL,
    scheduled_time_slot VARCHAR(100),
    
    -- geospatial / routing
    customer_address TEXT NOT NULL,
    customer_latitude DOUBLE PRECISION,
    customer_longitude DOUBLE PRECISION,
    
    special_instructions TEXT,
    
    -- immutable ledger references
    estimated_price DECIMAL(10,2),
    final_price DECIMAL(10,2),
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    commission_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. AUTOMATIC PROFILE CREATION TRIGGER
-- Generates a profile instantly with proper IAM role when a user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    passed_role VARCHAR(20);
BEGIN
    -- Extract role from raw_user_meta_data if passed during signup. Default to CUSTOMER.
    passed_role := UPPER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'CUSTOMER'));
    
    -- Special auto-admin rule for your emails
    IF NEW.email LIKE '%admin%' THEN
        passed_role := 'ADMIN';
    END IF;

    INSERT INTO public.profiles (id, email, phone, full_name, avatar_url, role, is_admin)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        passed_role,
        (passed_role = 'ADMIN') -- set is_admin true if role is ADMIN
    );
    
    -- If provider, also instantiate their details
    IF passed_role = 'PROVIDER' THEN
        INSERT INTO public.provider_details (provider_id, business_name)
        VALUES (
            NEW.id, 
            COALESCE(NEW.raw_user_meta_data->>'business_name', NEW.raw_user_meta_data->>'full_name', 'Independent Provider')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind Trigger to Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- 6. BULLETPROOF ROLE-BASED ACCESS CONTROL (RLS)

-- Helper function to prevent Infinite Recursion when determining admin status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    );
$$;

-- A. PROFILES (IAM)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.profiles TO anon, authenticated, service_role;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT USING ( public.is_admin() );

-- B. PROVIDER DETAILS
ALTER TABLE public.provider_details ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provider_details TO anon, authenticated, service_role;

CREATE POLICY "Public views provider details" ON public.provider_details FOR SELECT USING (true);
CREATE POLICY "Providers update own details" ON public.provider_details FOR UPDATE USING (auth.uid() = provider_id);

-- C. LOCATIONS
ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provider_locations TO anon, authenticated, service_role;

CREATE POLICY "Public views live locations" ON public.provider_locations FOR SELECT USING (true);
CREATE POLICY "Providers update own exact location" ON public.provider_locations FOR ALL USING (auth.uid() = provider_id) WITH CHECK (auth.uid() = provider_id);

-- D. BOOKINGS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bookings TO anon, authenticated, service_role;

CREATE POLICY "Customers view own bookings" ON public.bookings FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Customers create own bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Providers view assigned bookings" ON public.bookings FOR SELECT USING (auth.uid() = provider_id);
CREATE POLICY "Providers update assigned bookings" ON public.bookings FOR UPDATE USING (auth.uid() = provider_id);
CREATE POLICY "Admins view all bookings" ON public.bookings FOR SELECT USING ( public.is_admin() );


-- 7. RE-APPLY SECURE ADMIN VISIBILITY TO CATALOG
CREATE POLICY "Public read categories" ON public.service_categories FOR SELECT USING (true);
CREATE POLICY "Public read subcategories" ON public.service_subcategories FOR SELECT USING (true);
CREATE POLICY "Public read services" ON public.services FOR SELECT USING (true);

CREATE POLICY "Admins can manage categories" ON public.service_categories FOR ALL USING ( public.is_admin() );
CREATE POLICY "Admins can manage subcategories" ON public.service_subcategories FOR ALL USING ( public.is_admin() );
CREATE POLICY "Admins can manage services" ON public.services FOR ALL USING ( public.is_admin() );

-- Ensure schema cache is busted so the API learns the new auth tables
NOTIFY pgrst, 'reload schema';
