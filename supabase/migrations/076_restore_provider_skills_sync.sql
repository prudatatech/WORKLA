-- ==============================================================
-- RESTORE PROVIDER SKILLS INFRASTRUCTURE
-- Fix for: "column supported_services of provider_details not found"
-- Re-enables sync between array columns and provider_services table
-- ==============================================================

-- 1. Restore the missing array columns to provider_details
ALTER TABLE public.provider_details
    ADD COLUMN IF NOT EXISTS supported_services UUID[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS supported_subservices UUID[] DEFAULT '{}';

-- 2. Restore the sync function
CREATE OR REPLACE FUNCTION public.sync_provider_services_array()
RETURNS TRIGGER AS $$
DECLARE
    v_sub_id UUID;
BEGIN
    -- Only run if the supported_subservices array actually changed
    IF NEW.supported_subservices IS DISTINCT FROM OLD.supported_subservices THEN
        
        -- Deactivate all existing services for this provider in the junction table
        UPDATE public.provider_services 
        SET is_active = FALSE 
        WHERE provider_id = NEW.provider_id;

        -- If the array has items, activate them in the junction table
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

-- 3. Re-attach the trigger
DROP TRIGGER IF EXISTS trg_sync_provider_services ON public.provider_details;
CREATE TRIGGER trg_sync_provider_services
    AFTER UPDATE OF supported_subservices ON public.provider_details
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_provider_services_array();

-- 4. PERFORM ONE-TIME BACKFILL
-- Sync existing data from provider_services back to arrays if arrays are empty
-- This ensures the UI is consistent with the current database state
UPDATE public.provider_details pd
SET 
  supported_subservices = (
    SELECT array_agg(subcategory_id) 
    FROM public.provider_services 
    WHERE provider_id = pd.provider_id AND is_active = TRUE
  ),
  supported_services = (
    SELECT array_agg(DISTINCT s.id)
    FROM public.provider_services ps
    JOIN public.service_subcategories ss ON ss.id = ps.subcategory_id
    JOIN public.services s ON s.id = ss.service_id
    WHERE ps.provider_id = pd.provider_id AND ps.is_active = TRUE
  )
WHERE (supported_subservices IS NULL OR supported_subservices = '{}')
  AND EXISTS (SELECT 1 FROM public.provider_services WHERE provider_id = pd.provider_id AND is_active = TRUE);

-- 5. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

SELECT 'Provider Skills Infrastructure Restored Successfully ✅' AS result;
