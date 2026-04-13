-- ==============================================================
-- SERVICE AREA GEO-FENCING
-- Purpose: Restrict bookings to active polygon-defined zones.
-- ==============================================================

-- 1. Create the Service Zones Table
CREATE TABLE IF NOT EXISTS public.service_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    boundary geometry(Polygon, 4326) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for spatial queries
CREATE INDEX IF NOT EXISTS idx_service_zones_boundary ON public.service_zones USING GIST (boundary);

-- RLS
ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active zones"
    ON public.service_zones FOR SELECT
    USING (status = 'active');

CREATE POLICY "Admins manage all zones"
    ON public.service_zones FOR ALL
    USING (public.is_admin());

-- 2. Validation Function: Is point in any active zone?
CREATE OR REPLACE FUNCTION public.is_location_in_service_zone(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.service_zones 
        WHERE status = 'active' 
          AND ST_Contains(boundary, ST_SetSRID(ST_Point(p_lng, p_lat), 4326))
    );
END;
$$;

-- 3. Utility: Get zone name for a location
CREATE OR REPLACE FUNCTION public.get_service_zone_at_location(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_zone_name TEXT;
BEGIN
    SELECT name INTO v_zone_name
    FROM public.service_zones
    WHERE status = 'active'
      AND ST_Contains(boundary, ST_SetSRID(ST_Point(p_lng, p_lat), 4326))
    LIMIT 1;
    
    RETURN v_zone_name;
END;
$$;

-- 4. Admin Utility: Create or Update Zone via GeoJSON
CREATE OR REPLACE FUNCTION public.upsert_service_zone(
    p_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_geojson TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
    v_geom geometry;
BEGIN
    IF p_geojson IS NOT NULL THEN
        v_geom := ST_GeomFromGeoJSON(p_geojson);
        -- Ensure it's SRID 4326
        v_geom := ST_SetSRID(v_geom, 4326);
    END IF;

    IF p_id IS NOT NULL THEN
        UPDATE public.service_zones
        SET 
            name = COALESCE(p_name, name),
            description = COALESCE(p_description, description),
            status = COALESCE(p_status, status),
            boundary = COALESCE(v_geom, boundary),
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;
    ELSE
        INSERT INTO public.service_zones (name, description, status, boundary)
        VALUES (p_name, p_description, COALESCE(p_status, 'active'), v_geom)
        RETURNING id INTO v_id;
    END IF;

    RETURN jsonb_build_object('id', v_id);
END;
$$;

-- 5. Reload Schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Geo-fencing infrastructure deployed ✅' AS result;
