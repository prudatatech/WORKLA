-- Migration: 126_add_gold_subscription_fields
-- Purpose: Add fields to track Workla Gold membership for customers

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_gold BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS gold_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50);

-- Trigger schema reload for PostgREST
NOTIFY pgrst, 'reload schema';
