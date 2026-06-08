# Workla — On-Demand Home Services Platform

> A full-stack, production-grade marketplace connecting customers with verified service professionals — built for India.

---

## 📦 Monorepo Structure

```
WorkLAA-main/
├── customer-app/          # React Native app for customers (Expo)
├── provider-app/          # React Native app for service providers (Expo)
├── admin-portal/          # Next.js web dashboard for admins
├── backend-services/      # Fastify API server (Node.js + TypeScript)
├── supabase/
│   └── migrations/        # 133 SQL migrations (Postgres schema + RPCs)
└── packages/              # Shared utilities
```

---

## 🏗️ System Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Customer App   │     │   Provider App   │     │  Admin Portal   │
│  (Expo RN)      │     │   (Expo RN)      │     │  (Next.js 16)   │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                          │
         └───────────────────────┼──────────────────────────┘
                                 │ HTTPS + WebSocket
                    ┌────────────▼──────────────┐
                    │   Fastify API Gateway      │
                    │   (Node.js + TypeScript)   │
                    │   + Socket.io (real-time)  │
                    └────────────┬──────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                       │
   ┌──────▼──────┐     ┌─────────▼──────┐     ┌────────▼────────┐
   │  Supabase   │     │   Redis Cache  │     │ Elasticsearch   │
   │  (Postgres  │     │   (ioredis)    │     │ (Service Search)│
   │   + Auth    │     └────────────────┘     └─────────────────┘
   │   + Storage │
   │   + Realtime│
   └─────────────┘
```

---

## 1. 📱 Customer App (`customer-app/`)

**Framework:** React Native 0.81 · Expo SDK 54 · TypeScript

### Screens & Navigation (Expo Router — File-Based)

| Screen | Path | Purpose |
|--------|------|---------|
| **Onboarding** | `app/onboarding.tsx` | Welcome + phone OTP flow |
| **Auth** | `app/auth.tsx` | Login / Register via Supabase OTP |
| **Home** | `app/(tabs)/index.tsx` | Service categories, banners, recommended |
| **Explore** | `app/(tabs)/explore.tsx` | Browse all services by category |
| **Search** | `app/(tabs)/search.tsx` / `app/search.tsx` | Elasticsearch-powered full-text search |
| **Bookings** | `app/(tabs)/bookings.tsx` | Active + past order history |
| **Profile** | `app/(tabs)/profile.tsx` | Account management |
| **Support** | `app/(tabs)/support.tsx` | Help & customer support |
| **Book Service** | `app/book/[id].tsx` | Booking flow with slot picker, address, coupon |
| **Configure Bucket** | `app/book/configure-bucket.tsx` | Multi-service batch booking builder |
| **Track Job** | `app/track/[id].tsx` | Live tracking — map, status, ETA, receipt |
| **Track Batch** | `app/track/batch/[batchId].tsx` | Multi-service order overview tracking |
| **Service Detail** | `app/service/detail/[id].tsx` | Service info, pricing, provider list |
| **Provider Profile** | `app/provider/[id].tsx` | Public provider profile + reviews |
| **Rate & Review** | `app/rate/[id].tsx` | Post-job rating submission |
| **Addresses** | `app/addresses.tsx` | Saved address book (CRUD) |
| **Wallet** | `app/wallet.tsx` | Workla wallet balance + transactions |
| **Coupons** | `app/coupons.tsx` | Apply promo codes / discover offers |
| **Payment History** | `app/payment-history.tsx` | Transaction ledger |
| **Referral** | `app/referral.tsx` | Referral code + earnings |
| **Workla Gold** | `app/workla-gold.tsx` | Subscription plan management |
| **Notifications** | `app/notifications.tsx` | In-app notification center |
| **Settings** | `app/settings.tsx` | App preferences |
| **Edit Profile** | `app/edit-profile.tsx` | Profile update form |
| **Chat** | `app/chat/[id].tsx` | In-job real-time messaging with provider |
| **All Services** | `app/all-services.tsx` | Complete service directory |
| **Location** | `app/location.tsx` | Map-based address picker |
| **Reset Password** | `app/reset-password.tsx` | Password reset screen |

### UI Components

| Component | Purpose |
|-----------|---------|
| `BannerCarousel.tsx` | Auto-scrolling promotional banner slider |
| `BucketFAB.tsx` | Floating action button for multi-service cart |
| `EmptyState.tsx` | Reusable empty list illustration |
| `InAppToast.tsx` | In-app notification toast overlay |
| `LoadingScreen.tsx` | Full-screen loading indicator |
| `NetworkBanner.tsx` | Offline/online connectivity status banner |
| `ProviderFoundScreen.tsx` | Animated "Partner Found" popup |
| `SearchingProvider.tsx` | Animated spinner while dispatching |
| `SkeletonLoader.tsx` | Skeleton placeholders for all list types |

### Libraries & Packages

| Package | Version | Use |
|---------|---------|-----|
| `expo` | ~54.0 | Core mobile framework |
| `expo-router` | ~6.0 | File-based navigation |
| `react-native` | 0.81.5 | Core UI framework |
| `react-native-reanimated` | ~4.1 | Spring animations & gestures |
| `react-native-maps` | 1.20.1 | Live map view with provider marker |
| `expo-location` | ~19.0 | GPS / Geofencing for arrival check |
| `expo-notifications` | ~0.32 | Push notifications (FCM / APNs) |
| `expo-image-picker` | ~17.0 | Proof-of-work photo capture |
| `expo-haptics` | ~15.0 | Tactile feedback |
| `@supabase/supabase-js` | ^2.98 | DB, Auth, Realtime subscriptions |
| `socket.io-client` | ^4.8 | WebSocket connection to backend |
| `zustand` | ^5.0 | Lightweight global state management |
| `react-native-razorpay` | ^2.3 | Payment gateway integration |
| `lucide-react-native` | ^0.576 | Icon library |
| `@react-native-community/netinfo` | 11.4 | Network state detection |
| `react-native-gesture-handler` | ~2.28 | Swipe & gesture interactions |
| `react-native-safe-area-context` | ~5.6 | Safe area layout handling |

---

## 2. 🔧 Provider App (`provider-app/`)

**Framework:** React Native 0.81 · Expo SDK 54 · TypeScript

### Screens & Navigation

| Screen | Path | Purpose |
|--------|------|---------|
| **Onboarding** | `app/onboarding.tsx` | Multi-step KYC + service registration wizard |
| **Home / Dashboard** | `app/(tabs)/index.tsx` | Live availability toggle, earnings widget |
| **Work Orders** | `app/(tabs)/jobs.tsx` | Active jobs, job offers, status advancement |
| **Explore** | `app/(tabs)/explore.tsx` | Market trends / nearby demand |
| **Schedule** | `app/(tabs)/schedule.tsx` | Calendar-based availability + booked slots |
| **Earnings** | `app/(tabs)/earnings.tsx` | Daily/weekly earnings breakdown |
| **Insights** | `app/(tabs)/insights.tsx` | Job performance analytics |
| **Profile** | `app/(tabs)/profile.tsx` | Provider profile, documents, ratings |
| **Support** | `app/(tabs)/support.tsx` | Help center |
| **Services Setup** | `app/services.tsx` | Configure offered services & pricing |
| **Service Areas** | `app/service-areas.tsx` | Define operational zones by pincode |
| **Payouts** | `app/payouts.tsx` | Bank account + payout history |
| **Chat** | `app/chat/[id].tsx` | In-job customer messaging |
| **Reset Password** | `app/reset-password.tsx` | Password reset |

### UI Components

| Component | Purpose |
|-----------|---------|
| `JobCard.tsx` | Active job card with status advancement buttons |
| `JobOfferCard.tsx` | Incoming job offer card with Accept/Decline |
| `EmptyState.tsx` | Empty list states |
| `InAppToast.tsx` | In-app alert overlay |
| `NetworkBanner.tsx` | Connectivity status banner |
| `SkeletonLoader.tsx` | Loading placeholders |

### Key Lib Utilities (`lib/`)

| File | Purpose |
|------|---------|
| `api.ts` | Centralized HTTP client with auth headers |
| `localCache.ts` | AsyncStorage-backed TTL cache layer |
| `syncQueue.ts` | Offline action queue — syncs on reconnect |
| `notifications.ts` | Push notification setup (Expo token registration) |
| `socket.ts` | Socket.io client connection manager |
| `supabase.ts` | Supabase client initialization |
| `resilienceStore.ts` | Zustand store for offline/retry state |

---

## 3. 🖥️ Admin Portal (`admin-portal/`)

**Framework:** Next.js 16 (App Router) · TypeScript · TailwindCSS 4 · Recharts

### Dashboard Modules

| Module | Route | Purpose |
|--------|-------|---------|
| **Overview** | `/` | KPI cards — revenue, bookings, providers, users |
| **Bookings** | `/bookings` | All bookings — filter, search, status management |
| **Providers** | `/providers` | Provider list, verification status, KYC review |
| **Users** | `/users` | Customer account management |
| **Revenue** | `/revenue` | Financial charts — Recharts bar/line graphs |
| **Payouts** | `/payouts` | Provider payout management + bank details |
| **Catalog** | `/catalog` | Service categories, subcategories, pricing CRUD |
| **Promotions** | `/promotions` | Coupon code creation & management |
| **Banners** | `/banners` | App banner management |
| **Settings** | `/settings` | Platform configuration |
| **Database** | `/database` | Raw table viewer (admin RPC) |
| **Debug** | `/debug` | Operational diagnostics |
| **Privacy / ToS** | `/privacy`, `/tos` | Legal pages |

---

## 4. ⚙️ Backend API (`backend-services/`)

**Framework:** Fastify 5 · Node.js · TypeScript  
**Deployment:** Docker + Railway

### API Routes (`src/routes/`)

| Route File | Prefix | Endpoints |
|-----------|--------|-----------|
| `booking.ts` | `/api/v1/bookings` | Create, list, get, update status, batch create, reschedule |
| `jobOffer.ts` | `/api/v1/job-offers` | List offers, accept, reject, claim by booking |
| `provider.ts` | `/api/v1/providers` | Profile, location update, verification, KYC |
| `user.ts` | `/api/v1/users` | Profile CRUD, wallet, referral |
| `service.ts` | `/api/v1/services` | Service catalog, subcategories |
| `search.ts` | `/api/v1/search` | Elasticsearch full-text + geo search |
| `payment.ts` | `/api/v1/payments` | Razorpay order create + webhook verify |
| `payout.ts` | `/api/v1/payouts` | Provider payout requests |
| `earnings.ts` | `/api/v1/earnings` | Provider earnings ledger |
| `notification.ts` | `/api/v1/notifications` | List + mark read |
| `coupon.ts` | `/api/v1/coupons` | Apply & validate coupons |
| `address.ts` | `/api/v1/addresses` | Saved address CRUD |
| `availability.ts` | `/api/v1/availability` | Provider schedule slots |
| `schedule.ts` | `/api/v1/schedule` | Smart scheduling engine |
| `review.ts` | `/api/v1/reviews` | Submit & fetch reviews |
| `draft.ts` | `/api/v1/drafts` | Booking drafts (pre-confirmation) |
| `admin.ts` | `/api/v1/admin` | Full admin CRUD for all entities |

### Backend Services (`src/services/`)

| Service | Purpose |
|---------|---------|
| `jobService.ts` | Job dispatch, offer management, acceptance engine |
| `paymentService.ts` | Razorpay integration, COD reconciliation |
| `invoiceService.ts` | PDF invoice generation (pdfkit) |
| `pushNotificationService.ts` | Expo Push SDK — FCM/APNs delivery |
| `verificationService.ts` | KYC document verification workflow |

### Event System (`src/events/`)

| Module | Purpose |
|--------|---------|
| `bus.ts` | Internal EventBus — publish/subscribe pattern |
| `notificationWorker.ts` | Listens to `booking.created` → triggers dispatch, nudges, push notifications |
| `locationWorker.ts` | Handles provider location update events |
| `searchWorker.ts` | Indexes new providers/services in Elasticsearch |

### Infrastructure Libs (`src/lib/`)

| Module | Purpose |
|--------|---------|
| `supabase.ts` | Supabase Admin client (service role) |
| `redis.ts` | ioredis client with connection health checks |
| `cache.ts` | Redis-backed cache with `getOrSet`, TTL, invalidation |
| `redisBus.ts` | Redis pub/sub for cross-instance Socket.io events |
| `elasticsearch.ts` | Elasticsearch client + index management |
| `config.ts` | Centralized env config with validation |
| `constants.ts` | Booking status machine, active status lists |
| `resilience.ts` | Circuit breaker / retry helpers |
| `schemas.ts` | Shared JSON Schema type definitions |

### Middleware

| Middleware | Purpose |
|-----------|---------|
| `requireAuth` | JWT verification via Supabase Admin |
| Rate Limiting | `@fastify/rate-limit` — per-route limits |
| Helmet | `@fastify/helmet` — HTTP security headers |
| CORS | `@fastify/cors` — origin whitelisting |
| Compression | `@fastify/compress` — gzip responses |

---

## 5. 🗄️ Database (`supabase/migrations/`)

**Engine:** PostgreSQL via Supabase · 133 migration files

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (customer + provider shared) |
| `provider_details` | Provider extended profile, verification status |
| `provider_locations` | Real-time GPS coordinates (TTL indexed) |
| `provider_services` | Provider ↔ subcategory skill mappings |
| `provider_service_areas` | Pincode-based operational zones |
| `services` | Top-level service categories |
| `service_subcategories` | Individual bookable services with pricing |
| `bookings` | Core booking records with full status lifecycle |
| `job_offers` | Provider offer assignments per booking |
| `notifications` | In-app notification records |
| `reviews` | Customer ratings + comments |
| `transactions` | Payment ledger entries |
| `wallet_transactions` | Workla wallet credits/debits |
| `referral_codes` | Referral program codes |
| `coupons` | Promotional discount codes |
| `booking_drafts` | Pre-confirmation booking drafts |
| `chat_messages` | In-job chat history |
| `invoices` | Generated PDF invoice records |
| `financial_ledger` | Double-entry accounting ledger |
| `provider_payouts` | Payout request records |
| `cancellation_policies` | Cancellation fee rules |
| `scheduled_slots` | Provider availability slots |
| `service_zones` | Geographic service zone definitions |

### Key Database Functions (RPCs)

| Function | Purpose |
|----------|---------|
| `dispatch_job(p_booking_id)` | Finds online, nearby, skilled providers via Haversine; creates job offers |
| `accept_job_offer_rpc` | Atomic job acceptance — locks booking, expires competing offers |
| `update_provider_location` | Upserts provider GPS coordinates |
| `get_provider_marketplace` | Returns paginated, filtered provider listings |
| `check_service_area_coverage` | Validates if a pincode is serviceable |
| `admin_table_viewer` | Raw table data access for admin portal |

---

## 6. 🗺️ Job Matching & Geofencing System

### Dispatch Flow

```
Customer books → backend creates booking (status: requested)
       ↓
dispatch_job RPC runs
       ↓
Haversine distance filter (≤25km radius)
       ↓
Filter: is_online=true, verification_status=verified,
        subcategory_id matches, location updated <4hrs
       ↓
Adaptive ranking: distance + avg_rating + acceptance_rate
       ↓
Top 15 providers → job_offers created (status: pending)
       ↓
booking status → "searching"
       ↓
Providers notified: Socket.io emit + Push Notification
       ↓
Provider accepts → accept_job_offer_rpc (atomic)
       ↓
booking status → "confirmed", competing offers → expired
```

### Batch Booking Dispatch (Multi-Service)
- Each service in a batch is dispatched **independently and in parallel** (`Promise.allSettled`)
- If RPC finds 0 providers, a **manual Node.js Haversine fallback** runs
- Services with available providers → `searching`; truly unavailable → `cancelled`
- Provider notifications sent **immediately** without waiting for the EventBus

### Arrival Geofence (Provider App)
- **Algorithm:** Haversine formula (in-app, `expo-location`)
- **Radius:** 500 meters
- **Flow:** Provider taps "I've Arrived" → GPS fetched (High Accuracy) → distance calculated → if >500m, alert shown with Navigate/Override options
- **Fallback:** If GPS unavailable, manual confirmation prompt

---

## 7. 🔄 Real-Time Architecture

| Channel | Technology | Events |
|---------|-----------|--------|
| Booking status changes | Supabase Realtime (postgres_changes) | Customer tracking screen updates instantly |
| Job offers | Supabase Realtime (INSERT on job_offers) | Provider offer card appears with haptic feedback |
| Location updates | Socket.io + Redis pub/sub | Live provider marker movement on customer map |
| Chat messages | Socket.io room per booking | Sub-100ms message delivery |
| Notifications | Socket.io `notification:alert` | In-app toast without polling |

---

## 8. 💳 Payments & Financial System

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Online Payments | **Razorpay SDK** | UPI, cards, net banking |
| COD Flow | Custom confirmation UI | Cash collected acknowledgement with animation |
| Wallet | Internal ledger | Credits, referral bonuses, refunds |
| Earnings | `financial_ledger` table | Double-entry per booking completion |
| Payouts | Razorpay Transfers API | Automated provider bank transfers |
| Invoices | **pdfkit** | PDF invoice generation + Supabase Storage |
| Cancellation Policy | SQL triggers | Automatic fee calculation on cancel |

---

## 9. 🔔 Notification System

| Channel | Technology | Triggers |
|---------|-----------|---------|
| Push (Background) | **Expo Push SDK** (FCM + APNs) | New job offer, booking confirmed, status changes |
| In-App (Foreground) | Socket.io + `InAppToast` component | All real-time events |
| Database | `notifications` table | Persistent notification history |
| Nudge Engine | `notificationWorker.ts` cron | Re-notifies providers if no acceptance after 2 min |

---

## 10. 🧱 Full Tech Stack Summary

### Languages
- **TypeScript** — Used across all apps, backend, and admin portal

### Frontend
| App | Framework | State | Real-time |
|-----|-----------|-------|-----------|
| Customer App | React Native 0.81 + Expo 54 | Zustand | Supabase Realtime + Socket.io |
| Provider App | React Native 0.81 + Expo 54 | Zustand | Supabase Realtime + Socket.io |
| Admin Portal | Next.js 16 (App Router) | React State | Supabase Realtime |

### Backend
| Layer | Technology |
|-------|-----------|
| API Framework | **Fastify 5** |
| Runtime | **Node.js** |
| Language | **TypeScript** (compiled via `tsx`) |
| Database ORM | **Supabase JS SDK** (query builder) |
| Database | **PostgreSQL** (via Supabase) |
| Auth | **Supabase Auth** (OTP + JWT) |
| Cache | **Redis** (ioredis) |
| Search | **Elasticsearch 8** |
| Messaging | **Kafka** (configured, event streaming) |
| WebSockets | **Socket.io 4** |
| File Storage | **Supabase Storage** (S3-compatible) |
| Error Tracking | **Sentry** |

### DevOps & Infrastructure
| Tool | Purpose |
|------|---------|
| Docker + Docker Compose | Local infra (Redis, Elasticsearch, Kafka) |
| Railway | Cloud deployment for backend |
| EAS (Expo Application Services) | Mobile app builds & OTA updates |
| GitHub Actions | CI/CD pipeline |

### Third-Party Services
| Service | Use |
|---------|-----|
| **Supabase** | DB, Auth, Realtime, Storage |
| **Razorpay** | Payments + Payouts |
| **Expo Push** | Mobile push notifications |
| **Google Maps** | Navigation + Geocoding |
| **Sentry** | Error monitoring |
| **Elasticsearch** | Full-text service search |

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 20
- Docker Desktop
- Expo Go (iOS/Android) or simulator
- Supabase project + keys

### Environment Setup

**Backend** (`backend-services/.env`):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
```

**Customer App / Provider App** (`.env`):
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=https://your-backend.railway.app
```

### Run Locally

```bash
# 1. Start backend infrastructure (Redis, Elasticsearch)
cd backend-services
npm run infra:up

# 2. Start API server
npm run dev

# 3. Start customer app
cd ../customer-app
npx expo start --go

# 4. Start provider app
cd ../provider-app
npx expo start --go

# 5. Start admin portal
cd ../admin-portal
npm run dev
```

### Database Migrations

All 133 migration files are in `supabase/migrations/`. Apply via Supabase CLI:
```bash
supabase db push
```

---

## 📊 Key Business Metrics Tracked

- Total Bookings / Revenue / Active Providers (Admin Dashboard)
- Provider Acceptance Rate, Avg Rating, Job Completion Rate (Insights)
- Customer Wallet Balance, Referral Earnings
- Earnings per Day/Week/Month (Provider Earnings screen)
- Cancellation rates + policy enforcement
- Dispatch success rate per service area

---

*Built with ❤️ by the Workla Engineering Team*
