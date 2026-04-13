-- =========================================================================
-- WORKLA: ASSIGN SKILLS TO PROVIDER
-- Because the Provider App currently lacks a "Skills Selection" screen,
-- we must manually give the provider permission to perform these subcategories.
-- =========================================================================

-- Replace this with your actual Provider ID (from the users table or provider_details)
-- You can find this in Supabase -> Authentication -> Users
DO $$ 
DECLARE 
    -- ⚠️ CHANGE THIS TO YOUR PROVIDER'S UUID ⚠️
    v_provider_id UUID := 'YOUR-PROVIDER-UUID-HERE'; 
    v_sub RECORD;
BEGIN
    -- This loop assigns EVERY active subcategory to the provider
    -- so they will receive offers for literally any job booked.
    FOR v_sub IN SELECT id FROM public.service_subcategories WHERE is_active = TRUE
    LOOP
        INSERT INTO public.provider_services (provider_id, subcategory_id, is_active)
        VALUES (v_provider_id, v_sub.id, TRUE)
        ON CONFLICT (provider_id, subcategory_id) DO NOTHING;
    END LOOP;
END $$;
