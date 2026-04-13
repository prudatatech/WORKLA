-- Add Proof of Work columns to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS work_proof_start_url TEXT,
ADD COLUMN IF NOT EXISTS work_proof_complete_url TEXT;

-- Update RLS for public/customer access if needed (already broad for selection)
COMMENT ON COLUMN public.bookings.work_proof_start_url IS 'Photo URL captured when provider starts the job (Before)';
COMMENT ON COLUMN public.bookings.work_proof_complete_url IS 'Photo URL captured when provider completes the job (After)';

-- Ensure booking_photos table exists (already in initial schema but for safety)
CREATE TABLE IF NOT EXISTS public.booking_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    photo_type VARCHAR(50) CHECK (photo_type IN ('before', 'during', 'after', 'issue')),
    caption TEXT,
    uploaded_by UUID REFERENCES auth.users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on booking_photos
ALTER TABLE public.booking_photos ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    if NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'booking_photos' AND policyname = 'Anyone authenticated can view booking photos') THEN
        CREATE POLICY "Anyone authenticated can view booking photos"
            ON public.booking_photos FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    if NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'booking_photos' AND policyname = 'Providers can upload photos') THEN
        CREATE POLICY "Providers can upload photos"
            ON public.booking_photos FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
END $$;
