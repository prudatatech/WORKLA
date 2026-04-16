-- 1. Ensure the provider_details table and years_of_experience column exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_details') THEN
        CREATE TABLE public.provider_details (
            provider_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
            business_name VARCHAR(255),
            verification_status VARCHAR(50) DEFAULT 'unverified',
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
        
        ALTER TABLE public.provider_details ENABLE ROW LEVEL SECURITY;
        -- Reverting to basic RLS setup
        DROP POLICY IF EXISTS "Public views provider details" ON public.provider_details;
        DROP POLICY IF EXISTS "Providers update own details" ON public.provider_details;
        
        CREATE POLICY "Public views provider details" ON public.provider_details FOR SELECT USING (true);
        CREATE POLICY "Providers update own details" ON public.provider_details FOR UPDATE USING (auth.uid() = provider_id);
    ELSE
        -- Table exists, just check the column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='provider_details' AND column_name='years_of_experience') THEN
            ALTER TABLE public.provider_details ADD COLUMN years_of_experience INTEGER DEFAULT 0;
        END IF;
    END IF;

    -- 3. Drop the strict check constraint that prevents 'unverified'
    ALTER TABLE public.provider_details DROP CONSTRAINT IF EXISTS "provider_details_verification_status_check";
    
END $$;

-- 4. Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
