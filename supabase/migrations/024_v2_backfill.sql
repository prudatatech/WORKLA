-- SCRIPT TO BACKFILL EXISTING AUTH USERS INTO THE NEW PROFILES TABLE
-- This fixes the issue where existing logged-in users get a 401 because their
-- row in public.profiles was deleted during the V2 DB Nuclear wipe.

INSERT INTO public.profiles (id, email, full_name, role, created_at)
SELECT 
    id,
    email,
    COALESCE(raw_user_meta_data->>'full_name', 'User'),
    CASE WHEN email LIKE '%admin%' THEN 'ADMIN' ELSE 'CUSTOMER' END,
    created_at
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
