-- ============================================================
-- Workla Phase 1: High-Trust Infrastructure (Ratings & Verification)
-- Consolidation of ratings and reviews into a single 'ratings' table.
-- ============================================================

-- 1. Create consolidated ratings table if not exists
CREATE TABLE IF NOT EXISTS public.ratings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    reviewer_id     UUID NOT NULL REFERENCES auth.users(id),
    reviewee_id     UUID NOT NULL REFERENCES auth.users(id), -- Usually the provider
    rating_score    INTEGER NOT NULL CHECK (rating_score >= 1 AND rating_score <= 5),
    review_text     TEXT,
    praise_tags     TEXT[], -- Array for things like 'On Time', 'Professional'
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(booking_id, reviewer_id)
);

-- 2. Drop the old conflicting table name if it exists accurately
DROP TABLE IF EXISTS public.ratings_reviews;

-- 3. Enable RLS
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ratings" ON public.ratings FOR SELECT USING (true);
CREATE POLICY "Users can create ratings for their own bookings" ON public.ratings FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE id = booking_id AND (customer_id = auth.uid() OR provider_id = auth.uid())
    )
);

-- 4. Unified Aggregate Trigger
-- This updates service_providers.avg_rating and total_reviews counts
CREATE OR REPLACE FUNCTION public.update_provider_rating_aggregate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.service_providers
    SET 
        avg_rating = (
            SELECT ROUND(AVG(rating_score)::numeric, 2)
            FROM public.ratings
            WHERE reviewee_id = NEW.reviewee_id
        ),
        total_ratings_count = (
            SELECT COUNT(*)
            FROM public.ratings
            WHERE reviewee_id = NEW.reviewee_id
        )
    WHERE user_id = NEW.reviewee_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_provider_rating ON public.ratings;
CREATE TRIGGER trg_update_provider_rating
AFTER INSERT OR UPDATE ON public.ratings
FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating_aggregate();

-- 5. Search Indexing for Reviews
CREATE INDEX IF NOT EXISTS idx_ratings_review_search ON public.ratings USING GIN (to_tsvector('english', review_text));

-- 6. Clean up old references in bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_rating INTEGER;
