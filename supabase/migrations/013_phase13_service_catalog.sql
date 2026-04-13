-- ==========================================
-- Workla Phase 13: Premium Service Catalog Seed
-- Purpose: Building the "One-Stop Solution" for all services
-- ==========================================

-- 1. Insert Core Categories
INSERT INTO public.service_categories (id, name, slug, description, icon_url)
VALUES 
    (uuid_generate_v4(), 'Cleaning', 'cleaning', 'Professional deep cleaning services for homes and offices', 'sparkles'),
    (uuid_generate_v4(), 'Electrician', 'electrician', 'Expert electrical repairs, installations and maintenance', 'zap'),
    (uuid_generate_v4(), 'Plumbing', 'plumbing', 'Reliable plumbing solutions for leaks, blocks and installations', 'droplet'),
    (uuid_generate_v4(), 'Painting', 'painting', 'Premium interior and exterior painting with expert finish', 'paint-bucket'),
    (uuid_generate_v4(), 'Carpentry', 'carpentry', 'Custom furniture repair and woodwork services', 'hammer'),
    (uuid_generate_v4(), 'AC Repair', 'ac-repair', 'Complete AC servicing, repair and gas charging', 'wind'),
    (uuid_generate_v4(), 'Salon & Spa', 'salon-spa', 'Premium grooming and relaxation services at home', 'scissors')
ON CONFLICT (slug) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 2. Insert Subcategories
-- We need to fetch the IDs first, so we use a temporary mapping or subqueries.

DO $$
DECLARE
    clean_id UUID := (SELECT id FROM service_categories WHERE slug = 'cleaning');
    elec_id  UUID := (SELECT id FROM service_categories WHERE slug = 'electrician');
    plum_id  UUID := (SELECT id FROM service_categories WHERE slug = 'plumbing');
    paint_id UUID := (SELECT id FROM service_categories WHERE slug = 'painting');
    carp_id  UUID := (SELECT id FROM service_categories WHERE slug = 'carpentry');
    ac_id    UUID := (SELECT id FROM service_categories WHERE slug = 'ac-repair');
    salon_id UUID := (SELECT id FROM service_categories WHERE slug = 'salon-spa');
BEGIN
    -- Cleaning Subcategories
    INSERT INTO public.service_subcategories (category_id, name, slug, description, base_price, unit, estimated_duration_minutes)
    VALUES 
        (clean_id, 'Full Home Deep Cleaning', 'full-home-cleaning', 'Thorough cleaning of all rooms, kitchen and bathrooms', 3999, 'per visit', 300),
        (clean_id, 'Bathroom Deep Cleaning', 'bathroom-cleaning', 'Deep scrubbing and disinfection of bathrooms', 499, 'per visit', 60),
        (clean_id, 'Sofa & Carpet Cleaning', 'sofa-cleaning', 'Shampooing and vacuuming of sofas and carpets', 999, 'per visit', 120)
    ON CONFLICT (slug) DO NOTHING;

    -- Electrician Subcategories
    INSERT INTO public.service_subcategories (category_id, name, slug, description, base_price, unit, estimated_duration_minutes)
    VALUES 
        (elec_id, 'Fan Repair & Installation', 'fan-repair', 'Repairing noisy fans or new installations', 149, 'per visit', 45),
        (elec_id, 'Switch & Socket Repair', 'switch-repair', 'Fixing loose connections or replacing switches', 99, 'per visit', 30),
        (elec_id, 'Full Home Inspection', 'elec-inspection', 'Complete checkup of home electrical wiring', 499, 'per visit', 90)
    ON CONFLICT (slug) DO NOTHING;

    -- Plumbing Subcategories
    INSERT INTO public.service_subcategories (category_id, name, slug, description, base_price, unit, estimated_duration_minutes)
    VALUES 
        (plum_id, 'Tap & Mixer Repair', 'tap-repair', 'Fixing leaking taps and mixers', 199, 'per visit', 45),
        (plum_id, 'Toilet & Flush Repair', 'toilet-repair', 'Fixing flush tanks and toilet blocks', 349, 'per visit', 60),
        (plum_id, 'Water Tank Cleaning', 'tank-cleaning', 'Deep cleaning and UV treatment of water tanks', 799, 'per visit', 120)
    ON CONFLICT (slug) DO NOTHING;

    -- AC Repair Subcategories
    INSERT INTO public.service_subcategories (category_id, name, slug, description, base_price, unit, estimated_duration_minutes)
    VALUES 
        (ac_id, 'Split AC Servicing', 'split-ac-service', 'Deep jet cleaning of indoor and outdoor units', 599, 'per visit', 60),
        (ac_id, 'AC Gas Charging', 'ac-gas-charge', 'Full gas refill with leak detection', 2499, 'per visit', 90)
    ON CONFLICT (slug) DO NOTHING;

END $$;
