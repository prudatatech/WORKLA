-- ==========================================
-- Phase 3 Expansion: Service Catalog & Geofencing
-- Run this in Supabase SQL Editor
-- ==========================================

-- 14. SYSTEM CONFIGURATION & GEOFENCING
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    data_type VARCHAR(50),
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    country VARCHAR(100) DEFAULT 'India',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_serviceable BOOLEAN DEFAULT TRUE,
    launch_date DATE,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    currency VARCHAR(10) DEFAULT 'INR',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID REFERENCES cities(id) ON DELETE CASCADE,
    area_name VARCHAR(100) NOT NULL,
    boundary geometry(Polygon, 4326) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON service_areas USING GIST (boundary);

-- Add strict RLS for new tables
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view app settings" ON app_settings FOR SELECT USING (true);
CREATE POLICY "Only admins can update app settings" ON app_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin')
);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view cities" ON cities FOR SELECT USING (true);
CREATE POLICY "Only admins can insert/update cities" ON cities FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin')
);

ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view service areas" ON service_areas FOR SELECT USING (true);
CREATE POLICY "Only admins can insert/update service areas" ON service_areas FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin')
);

-- Note:
-- The core catalog tables (service_categories, service_subcategories, service_packages)
-- were already created in supabase_schema.sql. They include:
-- - service_categories
-- - service_subcategories
-- - service_packages
-- - provider_services

-- Advanced Search RPC (Phase 3 Requirement)
-- Combines PostGIS location bounds and Service Catalog matching
CREATE OR REPLACE FUNCTION search_providers_by_catalog_and_location(
    search_query TEXT,
    customer_lat DOUBLE PRECISION,
    customer_lng DOUBLE PRECISION,
    max_distance_km DOUBLE PRECISION DEFAULT 50.0
)
RETURNS TABLE (
    provider_id UUID,
    business_name VARCHAR,
    avg_rating DOUBLE PRECISION,
    total_jobs_completed INTEGER,
    avatar_url TEXT,
    city VARCHAR,
    pincode VARCHAR,
    distance_km DOUBLE PRECISION,
    matched_service VARCHAR
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (sp.user_id)
        sp.user_id AS provider_id,
        sp.business_name,
        sp.avg_rating,
        sp.total_jobs_completed,
        up.avatar_url,
        up.city,
        up.pincode,
        (ST_DistanceSphere(ST_MakePoint(customer_lng, customer_lat), up.location) / 1000.0) AS distance_km,
        ss.name AS matched_service
    FROM service_providers sp
    JOIN user_profiles up ON up.user_id = sp.user_id
    LEFT JOIN provider_services ps ON ps.provider_id = sp.user_id
    LEFT JOIN service_subcategories ss ON ss.id = ps.subcategory_id
    WHERE 
        (sp.business_name ILIKE '%' || search_query || '%' OR ss.name ILIKE '%' || search_query || '%')
        AND sp.is_available = true
        AND up.location IS NOT NULL
        AND (ST_DistanceSphere(ST_MakePoint(customer_lng, customer_lat), up.location) / 1000.0) <= max_distance_km
    ORDER BY sp.user_id, distance_km ASC
    LIMIT 20;
END;
$$;

-- ==========================================
-- FINISHED PHASE 3 SCHEMA EXPANSION
-- ==========================================
