-- Run this in the Supabase SQL Editor to add push notification support
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
