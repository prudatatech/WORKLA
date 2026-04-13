-- Provider Availability Table
CREATE TABLE IF NOT EXISTS public.provider_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(provider_id, day_of_week, start_time)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_provider_avail_search ON public.provider_availability(provider_id, day_of_week);

-- RLS
ALTER TABLE public.provider_availability ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_availability' AND policyname = 'Providers can manage their own availability') THEN
        CREATE POLICY "Providers can manage their own availability"
            ON public.provider_availability
            FOR ALL
            TO authenticated
            USING (auth.uid() = provider_id)
            WITH CHECK (auth.uid() = provider_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_availability' AND policyname = 'Public can view availability') THEN
        CREATE POLICY "Public can view availability"
            ON public.provider_availability
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

-- Function to check availability for a booking time
CREATE OR REPLACE FUNCTION public.check_provider_availability(
    p_provider_id UUID,
    p_date DATE,
    p_time TIME
) RETURNS BOOLEAN AS $$
DECLARE
    v_day INT;
    v_is_avail BOOLEAN;
BEGIN
    v_day := EXTRACT(DOW FROM p_date);
    
    SELECT EXISTS (
        SELECT 1 
        FROM public.provider_availability
        WHERE provider_id = p_provider_id
          AND day_of_week = v_day
          AND start_time <= p_time
          AND end_time > p_time
          AND is_available = true
    ) INTO v_is_avail;
    
    RETURN v_is_avail;
END;
$$ LANGUAGE plpgsql;
