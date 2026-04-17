-- Migration: 125_add_business_fields_to_profiles
-- Purpose: Support business invoicing for all users (Customers & Providers)

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(100);

-- Create a trigger function to keep provider_details.business_name in sync
CREATE OR REPLACE FUNCTION public.sync_profile_to_provider()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.business_name IS DISTINCT FROM NEW.business_name) THEN
        UPDATE public.provider_details
        SET business_name = NEW.business_name,
            updated_at = NOW()
        WHERE provider_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_to_provider ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_provider
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_provider();

-- Refresh the schema for PostgREST
NOTIFY pgrst, 'reload schema';
