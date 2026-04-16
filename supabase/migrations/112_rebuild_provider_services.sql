-- Migration: 112_rebuild_provider_services.sql
-- Fixes: "Could not find the table 'public.provider_services' in the schema cache"
-- Rebuilds the provider_services table, RLS policies, and sync triggers

-- 1. Re-Create the provider_services table
CREATE TABLE IF NOT EXISTS public.provider_services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     UUID NOT NULL REFERENCES public.provider_details(provider_id) ON DELETE CASCADE,
    subcategory_id  UUID NOT NULL REFERENCES public.service_subcategories(id) ON DELETE CASCADE,
    custom_price    DECIMAL(10,2),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(provider_id, subcategory_id)
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_provider_services_provider ON public.provider_services(provider_id, is_active);
CREATE INDEX IF NOT EXISTS idx_provider_services_subcat ON public.provider_services(subcategory_id, is_active);

-- 3. Row Level Security
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provider_services TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public reads provider services" ON public.provider_services;
CREATE POLICY "Public reads provider services" ON public.provider_services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Providers manage own services" ON public.provider_services;
CREATE POLICY "Providers manage own services" ON public.provider_services FOR ALL USING (auth.uid() = provider_id);

-- 4. Ensure provider_details has the array columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='provider_details' AND column_name='supported_subservices') THEN
        ALTER TABLE public.provider_details ADD COLUMN supported_subservices UUID[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='provider_details' AND column_name='supported_services') THEN
        ALTER TABLE public.provider_details ADD COLUMN supported_services UUID[] DEFAULT '{}';
    END IF;
END $$;

-- 5. Re-enables sync between provider_details array columns and provider_services table
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

-- 6. Re-attach the trigger
DROP TRIGGER IF EXISTS trg_sync_provider_services ON public.provider_details;
CREATE TRIGGER trg_sync_provider_services
    AFTER UPDATE OF supported_subservices ON public.provider_details
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_provider_services_array();

-- 7. PERFORM ONE-TIME BACKFILL 
-- (Takes everyone's chosen JSON skills from the app and inserts them into the new table so they can receive dispatches immediately)
DO $$
DECLARE
    v_provider RECORD;
    v_sub_id UUID;
BEGIN
    FOR v_provider IN SELECT provider_id, supported_subservices FROM public.provider_details WHERE supported_subservices IS NOT NULL AND array_length(supported_subservices, 1) > 0 LOOP
        FOREACH v_sub_id IN ARRAY v_provider.supported_subservices LOOP
            INSERT INTO public.provider_services (provider_id, subcategory_id, is_active)
            VALUES (v_provider.provider_id, v_sub_id, TRUE)
            ON CONFLICT (provider_id, subcategory_id) DO UPDATE SET is_active = TRUE;
        END LOOP;
    END LOOP;
END $$;

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

SELECT 'Repair: provider_services table rebuilt and synced ✅' AS result;
