-- ==============================================================
-- FIX: Drop faulty updated_at trigger on job_offers
-- The job_offers table uses responded_at instead of updated_at.
-- A previous migration blindly attached the touch_updated_at 
-- trigger to the table, causing a runtime exception on EVERY update,
-- which completely blocked job acceptance transactions!
-- ==============================================================

DROP TRIGGER IF EXISTS trg_job_offers_updated_at ON public.job_offers;

SELECT 'Faulty trigger dropped from job_offers ✅' AS result;
