-- Migration: 114_fix_provider_role_and_rls.sql
-- Fixes: Access Denied error when accepting jobs

-- 1. Fix the role mismatch for the specific provider
-- (This ensures the backend recognizes them as a PROVIDER during job acceptance)
UPDATE public.profiles 
SET role = 'PROVIDER' 
WHERE id = 'fb1c0d3d-17fa-4779-8b25-d58f56d2e026';

-- 2. Harden RLS for job_offers
-- Ensure providers can ALWAYS see their own offers regardless of global settings
DROP POLICY IF EXISTS "Providers can view own job offers" ON public.job_offers;
CREATE POLICY "Providers can view own job offers" 
ON public.job_offers FOR SELECT 
TO authenticated 
USING (auth.uid() = provider_id);

-- Optional: Ensure index exists for performance
CREATE INDEX IF NOT EXISTS idx_job_offers_provider_id ON public.job_offers(provider_id);

SELECT 'Repair: Provider role and RLS fixed ✅' AS result;
