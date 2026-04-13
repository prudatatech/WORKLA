-- =========================================================================
-- FIX: RE-LINKING BOOKING HISTORY TO CORRECT TABLE
-- This fixes the "violates foreign key constraint" error
-- =========================================================================

-- 1. Drop the old/broken foreign key
ALTER TABLE public.booking_status_history 
DROP CONSTRAINT IF EXISTS booking_status_history_booking_id_fkey;

-- 2. Re-create the foreign key pointing to the CORRECT bookings table
ALTER TABLE public.booking_status_history 
ADD CONSTRAINT booking_status_history_booking_id_fkey 
FOREIGN KEY (booking_id) 
REFERENCES public.bookings(id) 
ON DELETE CASCADE;

-- 3. Just in case, also ensure the profiles FK is correct
ALTER TABLE public.booking_status_history 
DROP CONSTRAINT IF EXISTS booking_status_history_changed_by_fkey;

ALTER TABLE public.booking_status_history 
ADD CONSTRAINT booking_status_history_changed_by_fkey 
FOREIGN KEY (changed_by) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;
