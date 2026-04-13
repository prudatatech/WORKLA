-- =========================================================================
-- Phase 18: Booking Drafts (Customer Retention)
-- Allows users to save their progress when booking a service.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.booking_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.service_subcategories(id) ON DELETE CASCADE,
    form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    current_step INTEGER NOT NULL DEFAULT 1,
    total_steps INTEGER NOT NULL DEFAULT 3,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_booking_drafts_user_id ON public.booking_drafts(user_id);

-- Enable RLS
ALTER TABLE public.booking_drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'booking_drafts' AND policyname = 'Users can manage their own drafts.') THEN
        CREATE POLICY "Users can manage their own drafts."
            ON public.booking_drafts
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_draft_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_booking_draft_timestamp
    BEFORE UPDATE ON public.booking_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_draft_timestamp();
