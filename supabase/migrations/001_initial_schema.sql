-- Workla Supabase Full Database Schema
-- Run this setup script in your Supabase SQL Editor

-- Extensions
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USER MANAGEMENT
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    user_type VARCHAR(20) CHECK (user_type IN ('customer', 'provider', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    date_of_birth DATE,
    gender VARCHAR(20),
    avatar_url TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location geometry(Point, 4326),
    preferred_language VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_token TEXT NOT NULL,
    device_type VARCHAR(20) CHECK (device_type IN ('ios', 'android', 'web')),
    device_model VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SERVICE PROVIDER MANAGEMENT
CREATE TABLE service_providers (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    years_of_experience INTEGER DEFAULT 0,
    verification_status VARCHAR(50) DEFAULT 'pending',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    service_radius_km DOUBLE PRECISION DEFAULT 10.0,
    service_cities TEXT[],
    service_zipcodes TEXT[],
    is_available BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    accepts_new_jobs BOOLEAN DEFAULT TRUE,
    max_concurrent_jobs INTEGER DEFAULT 1,
    current_active_jobs INTEGER DEFAULT 0,
    avg_rating DOUBLE PRECISION DEFAULT 0.0,
    total_ratings_count INTEGER DEFAULT 0,
    total_jobs_completed INTEGER DEFAULT 0,
    completion_rate DOUBLE PRECISION DEFAULT 100.0,
    avg_response_time_minutes INTEGER,
    cancellation_rate DOUBLE PRECISION DEFAULT 0.0,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE provider_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    document_type VARCHAR(50) CHECK (document_type IN ('aadhaar', 'pan', 'license', 'certificate')),
    document_number VARCHAR(100),
    document_url TEXT NOT NULL,
    verified_status VARCHAR(20) DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    expiry_date DATE,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SERVICE CATALOG
CREATE TABLE service_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_subcategories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES service_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    estimated_duration_minutes INTEGER,
    base_price DECIMAL(10,2),
    unit VARCHAR(50) CHECK (unit IN ('per hour', 'per visit', 'per sqft', 'fixed')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE provider_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    subcategory_id UUID REFERENCES service_subcategories(id) ON DELETE CASCADE,
    is_primary_service BOOLEAN DEFAULT FALSE,
    experience_years INTEGER DEFAULT 0,
    hourly_rate DECIMAL(10,2),
    base_price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, subcategory_id)
);

CREATE TABLE service_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subcategory_id UUID REFERENCES service_subcategories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    duration_minutes INTEGER,
    included_items JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BOOKING/JOB MANAGEMENT
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES users(id),
    provider_id UUID REFERENCES service_providers(user_id),
    category_id UUID REFERENCES service_categories(id),
    subcategory_id UUID REFERENCES service_subcategories(id),
    status VARCHAR(50) CHECK (status IN ('requested', 'assigned', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'disputed')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'emergency')),
    scheduled_date DATE NOT NULL,
    scheduled_time_slot VARCHAR(100),
    actual_start_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    customer_location geometry(Point, 4326),
    customer_address TEXT,
    customer_latitude DOUBLE PRECISION,
    customer_longitude DOUBLE PRECISION,
    service_description TEXT,
    special_instructions TEXT,
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    estimated_price DECIMAL(10,2),
    final_price DECIMAL(10,2),
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    commission_amount DECIMAL(10,2) DEFAULT 0.00,
    commission_percentage DECIMAL(5,2) DEFAULT 10.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2),
    cancellation_reason TEXT,
    cancelled_by VARCHAR(20) CHECK (cancelled_by IN ('customer', 'provider', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE booking_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id),
    notes TEXT,
    location geometry(Point, 4326),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE booking_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    subcategory_id UUID REFERENCES service_subcategories(id),
    description TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
);

CREATE TABLE booking_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    photo_type VARCHAR(50) CHECK (photo_type IN ('before', 'during', 'after', 'issue')),
    caption TEXT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RELATIONAL CONSTRAINTS AND UPDATES
-- To maintain performance, you will need indexing, particularly for spatial queries (PostGIS).

CREATE INDEX ON user_profiles USING GIST (location);
CREATE INDEX ON bookings USING GIST (customer_location);
-- (Further setup: Add remaining tables for Payments, Analytics, Pricing Rules manually as needed)

-- RLS (Row Level Security) Templates
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers update own data" ON service_providers FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own bookings" ON bookings FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Providers view assigned bookings" ON bookings FOR SELECT USING (auth.uid() = provider_id);
