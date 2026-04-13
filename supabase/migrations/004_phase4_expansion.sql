-- ==========================================
-- Phase 4 Expansion: Advanced Bookings & Dynamic Fare Engine
-- Run this in Supabase SQL Editor
-- ==========================================

-- 15. FARE STRUCTURES
CREATE TABLE IF NOT EXISTS fare_structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID REFERENCES cities(id) ON DELETE CASCADE,
    category_id UUID REFERENCES service_categories(id) ON DELETE CASCADE,
    subcategory_id UUID REFERENCES service_subcategories(id) ON DELETE SET NULL,
    base_fare DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    per_km_fare DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    per_minute_fare DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    minimum_fare DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    surge_multiplier DOUBLE PRECISION DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. DYNAMIC PRICING RULES
CREATE TABLE IF NOT EXISTS dynamic_pricing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name VARCHAR(100) NOT NULL,
    city_id UUID REFERENCES cities(id) ON DELETE CASCADE,
    start_time TIME,
    end_time TIME,
    day_of_week INTEGER, -- 0 (Sunday) to 6 (Saturday), NULL for all days
    surge_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: booking_items and booking_photos already exist from Phase 0 (supabase_schema.sql)
-- Adding fare_breakdown to bookings table to store detailed cost components
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fare_breakdown JSONB;

-- Add strict RLS
ALTER TABLE fare_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view fare structures" ON fare_structures FOR SELECT USING (true);
CREATE POLICY "Only admins can manage fare structures" ON fare_structures FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin')
);

ALTER TABLE dynamic_pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view pricing rules" ON dynamic_pricing_rules FOR SELECT USING (true);
CREATE POLICY "Only admins can manage pricing rules" ON dynamic_pricing_rules FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.user_type = 'admin')
);

-- ==========================================
-- FINISHED PHASE 4 SCHEMA EXPANSION
-- ==========================================
