ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS sender_role VARCHAR(20) DEFAULT 'unknown';

-- Backfill existing messages based on whether the sender_id matches the customer_id of the booking
UPDATE public.chat_messages cm
SET sender_role = 'customer'
FROM public.bookings b
WHERE cm.booking_id = b.id AND cm.sender_id = b.customer_id AND cm.sender_role = 'unknown';

UPDATE public.chat_messages cm
SET sender_role = 'provider'
FROM public.bookings b
WHERE cm.booking_id = b.id AND cm.sender_id = b.provider_id AND cm.sender_role = 'unknown';

NOTIFY pgrst, 'reload schema';
