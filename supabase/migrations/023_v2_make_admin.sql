-- SCRIPT TO FORCE CURRENT USERS TO ADMIN
-- Run this to instantly give your logged-in portal account Admin privileges.

UPDATE public.profiles SET role = 'ADMIN';
