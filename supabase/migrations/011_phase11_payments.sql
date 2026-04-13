-- ============================================================
-- Workla Phase 8: Razorpay Payments & Platform Wallets
-- ============================================================

-- 1. Payment Transactions Table
CREATE TABLE IF NOT EXISTS public.payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL REFERENCES public.bookings(id),
    customer_id     UUID NOT NULL REFERENCES auth.users(id),
    provider_id     UUID REFERENCES auth.users(id),
    amount          NUMERIC(10,2) NOT NULL,
    currency        TEXT DEFAULT 'INR',
    status          TEXT NOT NULL CHECK (status IN ('pending', 'authorized', 'captured', 'refunded', 'failed')),
    razorpay_order_id   TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature  TEXT,
    method          TEXT, -- card, upi, netbanking
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Platform Wallet / Balance Table
-- Tracks provider earnings and platform commission
CREATE TABLE IF NOT EXISTS public.wallets (
    user_id         UUID PRIMARY KEY REFERENCES auth.users(id),
    balance         NUMERIC(10,2) DEFAULT 0.00,
    held_balance    NUMERIC(10,2) DEFAULT 0.00, -- Escrowed funds
    total_earned    NUMERIC(10,2) DEFAULT 0.00,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Wallet Transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id       UUID NOT NULL REFERENCES public.wallets(user_id),
    amount          NUMERIC(10,2) NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'escrow_hold', 'escrow_release')),
    reference_id    UUID, -- Links to booking or payment
    description     TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own payments" ON public.payments FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = provider_id);
CREATE POLICY "Users see own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own wallet history" ON public.wallet_transactions FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.wallets WHERE user_id = auth.uid()));

-- 5. Auto-create wallet on user creation (trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_create_wallet
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_wallet();
