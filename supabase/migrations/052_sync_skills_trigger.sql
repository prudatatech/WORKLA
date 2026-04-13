-- =========================================================================
-- WORKLA SYNC TRIGGER: PROVIDER SKILLS ARRAY -> PROVIDER_SERVICES TABLE
-- =========================================================================
-- The Provider App saves skills as a JSON array in `provider_details`.
-- However, the dispatch algorithm needs them as rows in `provider_services`.
-- This trigger automatically synchronizes them.

CREATE OR REPLACE FUNCTION sync_provider_services_array()
RETURNS TRIGGER AS $$
DECLARE
    v_sub_id UUID;
BEGIN
    -- Only run if the supported_subservices array actually changed
    IF NEW.supported_subservices IS DISTINCT FROM OLD.supported_subservices THEN
        
        -- 1. Deactivate all existing services for this provider
        UPDATE public.provider_services 
        SET is_active = FALSE 
        WHERE provider_id = NEW.provider_id;

        -- 2. If the array is not null and has items, upsert them
        IF NEW.supported_subservices IS NOT NULL AND array_length(NEW.supported_subservices, 1) > 0 THEN
            FOREACH v_sub_id IN ARRAY NEW.supported_subservices
            LOOP
                INSERT INTO public.provider_services (provider_id, subcategory_id, is_active)
                VALUES (NEW.provider_id, v_sub_id, TRUE)
                ON CONFLICT (provider_id, subcategory_id) 
                DO UPDATE SET is_active = TRUE;
            END LOOP;
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trg_sync_provider_services ON public.provider_details;

-- Create the trigger
CREATE TRIGGER trg_sync_provider_services
AFTER UPDATE OF supported_subservices ON public.provider_details
FOR EACH ROW
EXECUTE FUNCTION sync_provider_services_array();

-- =========================================================================
-- INITIAL BACKFILL
-- Run this once to fix any providers who already selected their skills!
-- =========================================================================
DO $$
DECLARE
    v_provider RECORD;
    v_sub_id UUID;
BEGIN
    FOR v_provider IN SELECT provider_id, supported_subservices FROM public.provider_details WHERE supported_subservices IS NOT NULL
    LOOP
        FOREACH v_sub_id IN ARRAY v_provider.supported_subservices
        LOOP
            INSERT INTO public.provider_services (provider_id, subcategory_id, is_active)
            VALUES (v_provider.provider_id, v_sub_id, TRUE)
            ON CONFLICT (provider_id, subcategory_id) 
            DO UPDATE SET is_active = TRUE;
        END LOOP;
    END LOOP;
END $$;
