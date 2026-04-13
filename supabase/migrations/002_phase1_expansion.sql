-- ==========================================
-- Phase 1 Expansion: Financial & Support Layer
-- Run this in Supabase SQL Editor AFTER supabase_schema.sql
-- ==========================================

-- 6. PAYMENTS & TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(100) UNIQUE NOT NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) CHECK (transaction_type IN ('payment', 'refund', 'payout', 'commission', 'wallet_topup')),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(50) CHECK (status IN ('pending', 'processing', 'success', 'failed', 'refunded')) DEFAULT 'pending',
    payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'card', 'upi', 'wallet', 'netbanking')),
    gateway_name VARCHAR(50),
    gateway_transaction_id VARCHAR(100),
    gateway_response JSONB,
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    locked_amount DECIMAL(10,2) DEFAULT 0.00,
    total_earned DECIMAL(10,2) DEFAULT 0.00,
    total_spent DECIMAL(10,2) DEFAULT 0.00,
    last_transaction_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID REFERENCES wallets(user_id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    type VARCHAR(20) CHECK (type IN ('credit', 'debit')),
    amount DECIMAL(10,2) NOT NULL,
    balance_before DECIMAL(10,2) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    account_holder_name VARCHAR(255) NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    ifsc_code VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    branch_name VARCHAR(100),
    account_type VARCHAR(20) CHECK (account_type IN ('savings', 'current')),
    is_verified BOOLEAN DEFAULT FALSE,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    bank_account_id UUID REFERENCES provider_bank_accounts(id) ON DELETE SET NULL,
    status VARCHAR(50) CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    payout_method VARCHAR(50) DEFAULT 'bank_transfer',
    gateway_reference_id VARCHAR(100),
    failure_reason TEXT,
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS provider_earnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    gross_amount DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    commission_percentage DECIMAL(5,2) NOT NULL,
    tax_deducted DECIMAL(10,2) DEFAULT 0.00,
    net_earnings DECIMAL(10,2) NOT NULL,
    payout_status VARCHAR(50) CHECK (payout_status IN ('pending', 'processed', 'paid')) DEFAULT 'pending',
    payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. RATINGS & REVIEWS
CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    review_photos TEXT[],
    professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
    punctuality_rating INTEGER CHECK (punctuality_rating >= 1 AND punctuality_rating <= 5),
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    value_for_money_rating INTEGER CHECK (value_for_money_rating >= 1 AND value_for_money_rating <= 5),
    is_verified BOOLEAN DEFAULT TRUE,
    is_flagged BOOLEAN DEFAULT FALSE,
    flagged_reason TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(booking_id, customer_id)
);

CREATE TABLE IF NOT EXISTS provider_responses (
    rating_id UUID PRIMARY KEY REFERENCES ratings(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES service_providers(user_id) ON DELETE CASCADE,
    response_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. CUSTOMER SUPPORT
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    category VARCHAR(50) CHECK (category IN ('booking_issue', 'payment', 'provider_complaint', 'technical', 'other')),
    priority VARCHAR(50) CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    attachment_url TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add strict RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wallet" ON wallets FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wallet transactions" ON wallet_transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM wallets WHERE wallets.user_id = wallet_transactions.wallet_id AND wallets.user_id = auth.uid())
);

ALTER TABLE provider_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers manage own bank accounts" ON provider_bank_accounts FOR ALL USING (auth.uid() = provider_id);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers view own payouts" ON payouts FOR SELECT USING (auth.uid() = provider_id);

ALTER TABLE provider_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers view own earnings" ON provider_earnings FOR SELECT USING (auth.uid() = provider_id);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view verified ratings" ON ratings FOR SELECT USING (is_verified = true);
CREATE POLICY "Customers can create ratings" ON ratings FOR INSERT WITH CHECK (auth.uid() = customer_id);

ALTER TABLE provider_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view provider responses" ON provider_responses FOR SELECT USING (true);
CREATE POLICY "Providers can create responses" ON provider_responses FOR INSERT WITH CHECK (auth.uid() = provider_id);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own tickets" ON support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own tickets" ON support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view messages for own tickets" ON ticket_messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.user_id = auth.uid())
);
CREATE POLICY "Users insert messages for own tickets" ON ticket_messages FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.user_id = auth.uid())
);

-- ==========================================
-- FINISHED PHASE 1 SCHEMA EXPANSION
-- ==========================================
