/**
 * Workla Shared Types
 * 
 * Common TypeScript types used across Customer and Provider apps.
 */

// ── User & Auth ─────────────────────────────────────────
export interface User {
    id: string;
    email: string;
    full_name: string;
    phone: string;
    avatar_url?: string;
    role: 'customer' | 'provider' | 'admin';
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// ── Services & Catalog ──────────────────────────────────
export interface Service {
    id: string;
    name: string;
    description?: string;
    icon_url?: string;
    image_url?: string;
    is_active: boolean;
    is_featured: boolean;
    is_recommended: boolean;
    display_order: number;
}

export interface SubService {
    id: string;
    service_id: string;
    name: string;
    description?: string;
    base_price: number;
    duration_minutes?: number;
    is_active: boolean;
}

// ── Bookings ────────────────────────────────────────────
export type BookingStatus =
    | 'pending'
    | 'accepted'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'disputed';

export interface Booking {
    id: string;
    customer_id: string;
    provider_id?: string;
    service_id: string;
    subservice_id?: string;
    status: BookingStatus;
    scheduled_at?: string;
    total_amount: number;
    address_id?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}

// ── Addresses ───────────────────────────────────────────
export interface Address {
    id: string;
    user_id: string;
    label: string;
    address_line: string;
    city: string;
    state: string;
    pincode: string;
    latitude?: number;
    longitude?: number;
    is_default: boolean;
}

// ── Providers ───────────────────────────────────────────
export interface Provider {
    id: string;
    user_id: string;
    business_name?: string;
    skills: string[];
    rating: number;
    total_jobs: number;
    is_available: boolean;
    is_verified: boolean;
    latitude?: number;
    longitude?: number;
}

// ── Reviews ─────────────────────────────────────────────
export interface Review {
    id: string;
    booking_id: string;
    customer_id: string;
    provider_id: string;
    rating: number;
    comment?: string;
    created_at: string;
}

// ── Notifications ───────────────────────────────────────
export interface Notification {
    id: string;
    user_id: string;
    title: string;
    body: string;
    type: string;
    is_read: boolean;
    metadata?: Record<string, any>;
    created_at: string;
}

// ── Chat ────────────────────────────────────────────────
export interface ChatMessage {
    id: string;
    booking_id: string;
    sender_id: string;
    content: string;
    created_at: string;
}

// ── Wallet & Payments ───────────────────────────────────
export interface WalletTransaction {
    id: string;
    user_id: string;
    amount: number;
    type: 'credit' | 'debit';
    description: string;
    created_at: string;
}

// ── API Response ────────────────────────────────────────
export type ApiResponse<T = any> = {
    data: T | null;
    error: string | null;
};
