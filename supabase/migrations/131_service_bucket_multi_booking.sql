-- ─── Multi-Booking Batch Support ─────────────────────────────────────────────
-- Adds batch_id to bookings so parallel bookings can be grouped & tracked together

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_bookings_batch ON bookings(batch_id) WHERE batch_id IS NOT NULL;

-- Convenience view for customer active bookings (supports multi-booking home widget)
CREATE OR REPLACE VIEW customer_active_bookings AS
SELECT 
  id, customer_id, status, service_name_snapshot, booking_number, 
  created_at, provider_id, batch_id, total_amount, scheduled_date, scheduled_time_slot
FROM bookings
WHERE status IN ('requested', 'searching', 'confirmed', 'en_route', 'arrived', 'in_progress');

-- RLS: customers can only see their own active bookings
ALTER VIEW customer_active_bookings OWNER TO postgres;
