-- =================================================================================
-- WORKLA PLATFORM: PHASE 5 SECURITY AUDIT (RLS REINFORCEMENT)
-- Purpose: Guarantee strict isolation of financial data and secure profiles
-- =================================================================================

-- 1. Ensure Financial Tables are strictly isolated to the owner (Customer or Provider)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_earnings ENABLE ROW LEVEL SECURITY;

-- Re-apply policies safely to ensure no missing constraints
DO $$
BEGIN
    -- Wallets: Only owner or admin
    DROP POLICY IF EXISTS "Users read own wallet" ON public.wallets;
    CREATE POLICY "Users read own wallet" ON public.wallets FOR SELECT USING (auth.uid() = customer_id);

    -- Wallet Transactions: Only owner or admin
    DROP POLICY IF EXISTS "Users read own transactions" ON public.wallet_transactions;
    CREATE POLICY "Users read own transactions" ON public.wallet_transactions FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = wallet_id AND w.customer_id = auth.uid())
    );

    -- Payments: Only customer or admin
    DROP POLICY IF EXISTS "Customers read own payments" ON public.payments;
    CREATE POLICY "Customers read own payments" ON public.payments FOR SELECT USING (auth.uid() = customer_id);

    -- Worker Earnings: Only provider or admin
    DROP POLICY IF EXISTS "Providers read own earnings" ON public.worker_earnings;
    CREATE POLICY "Providers read own earnings" ON public.worker_earnings FOR SELECT USING (auth.uid() = provider_id);
END $$;

-- 2. Profiles: Allow parties of a booking to see each other's basic profile details 
--    (e.g. Customer needs to see Provider's name and avatar, and vice-versa)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Booking parties read profiles" ON public.profiles;
    CREATE POLICY "Booking parties read profiles" ON public.profiles FOR SELECT USING (
        auth.uid() = id 
        OR 
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE (b.customer_id = auth.uid() AND b.provider_id = profiles.id) 
               OR (b.provider_id = auth.uid() AND b.customer_id = profiles.id)
        )
        OR
        public.is_admin()
    );
END $$;
