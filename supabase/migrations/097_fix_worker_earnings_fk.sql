-- Drop the broken foreign key constraint on worker_earnings
-- We cannot simply recreate it referencing bookings(id) because bookings is a partitioned table
-- and PostgreSQL requires the partition key (scheduled_date) to be part of the foreign key constraint.
-- Removing the DB-level constraint prevents the completion error while still allowing application-level integrity.

ALTER TABLE public.worker_earnings
DROP CONSTRAINT IF EXISTS worker_earnings_booking_id_fkey;
