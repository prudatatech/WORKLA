-- Phase 7: Real-time Communication & Tracking

-- 1. Chat Messages Table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for Chat Messages
CREATE POLICY "Users can insert messages for their bookings" ON public.chat_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())
        )
    );

CREATE POLICY "Users can read messages for their bookings" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())
        )
    );

-- 2. Provider Live Locations (for ETA tracking)
CREATE TABLE IF NOT EXISTS public.provider_locations (
    provider_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can update their own location" ON public.provider_locations
    FOR ALL USING (auth.uid() = provider_id);

CREATE POLICY "Customers can view provider locations for active bookings" ON public.provider_locations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.provider_id = provider_locations.provider_id 
              AND b.customer_id = auth.uid()
              AND b.status IN ('confirmed', 'in_progress')
        )
    );

-- Enable Realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_locations;
