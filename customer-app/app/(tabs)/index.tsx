import * as Location from 'expo-location';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Banner } from '../../components/BannerCarousel';
import HomeHeader from '../../components/home/HomeHeader';
import ActiveBookingBanner from '../../components/home/ActiveBookingBanner';
import RatingPrompt from '../../components/home/RatingPrompt';
import OffersCarousel from '../../components/home/OffersCarousel';
import QuickRebook from '../../components/home/QuickRebook';
import ServiceGrid from '../../components/home/ServiceGrid';
import FeaturedSection from '../../components/home/FeaturedSection';
import { useAddressStore } from '../../lib/addressStore';
import { api } from '../../lib/api';
import { localCache } from '../../lib/localCache';
import { supabase } from '../../lib/supabase';
import { ChevronRight } from 'lucide-react-native';
import { PRIMARY, getBgForCategory, getColorForCategory, getIconForCategory } from '../../lib/ui-constants';

const { width } = Dimensions.get('window');

const SECTION_NAV = [
  { key: 'all', label: 'All Services', emoji: '🏠' },
  { key: 'popular', label: 'Popular', emoji: '⭐' },
  { key: 'smart', label: 'Smart Picks', emoji: '⚡' },
  { key: 'recommended', label: 'For You', emoji: '👍' },
];

// Session-level flag to track if user explicitly dismissed the banner
let isBannerDismissedThisSession = false;

export default function HomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  // 🛡️ AppState tracking for background lifecycle
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const realtimeChannelRef = useRef<any>(null);
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const lastLoadTimeRef = useRef<number>(0); // ⏱ Debounce repeated focus-loads
  const lastBackgroundTimeRef = useRef<number>(0); // ⏱ Track away time for foreground resume

  // ── Data State ──
  const [services, setServices] = useState<any[]>([]);
  const [popularServices, setPopularServices] = useState<any[]>([]);
  const [smartPickServices, setSmartPickServices] = useState<any[]>([]);
  const [recommendedServices, setRecommendedServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loyaltyCoins, setLoyaltyCoins] = useState(0);
  const [unratedBooking, setUnratedBooking] = useState<any>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [drafts, setDrafts] = useState<any[]>([]);

  const { selectedAddress, rawLocationName, setRawLocationName, autoDetectAddress } = useAddressStore();

  // ── Animation ──
  const notifPulse = useRef(new Animated.Value(1)).current;
  const bannerSlide = useRef(new Animated.Value(-80)).current;
  const sectionRefs = useRef<Record<string, number>>({ all: 0, popular: 0, smart: 0, recommended: 0 });
  const scrollToSection = (key: string) => scrollRef.current?.scrollTo({ y: sectionRefs.current[key] ?? 0, animated: true });

  const mapService = (s: any) => ({
    ...s, priority_number: s.priority_number || s.display_order,
    Icon: getIconForCategory(s.slug), bg: getBgForCategory(s.slug), color: getColorForCategory(s.slug),
  });

  // 🔒 Stable refs to call latest callbacks without being dependencies
  const loadDataRef = useRef<(isRefresh?: boolean) => Promise<void>>(() => Promise.resolve());
  const subscribeRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const startPulseRef = useRef<() => void>(() => {});
  const hasMountedRef = useRef(false);

  const loadData = useCallback(async (isRefresh = false) => {
    // ── Instant: Show cached data while we fetch fresh ──
    if (!isRefresh) {
      const [cachedSrv, cachedBanners, cachedFeatured] = await Promise.all([
        localCache.get<any[]>('home:services'),
        localCache.get<any[]>('home:banners'),
        localCache.get<any>('home:featured'),
      ]);
      if (cachedSrv?.length) {
        setServices(cachedSrv.map(mapService));
        setServicesError(null);
        setLoading(false); // Show content immediately from cache
      }
      if (cachedBanners?.length) setBanners(cachedBanners);
      if (cachedFeatured) {
        const subToCard = (list: any[]) => (list || []).map(item => ({
          ...item, Icon: getIconForCategory(item.slug || 'home'), bg: getBgForCategory(item.slug || 'home'), color: getColorForCategory(item.slug || 'home'),
        }));
        setPopularServices(subToCard(cachedFeatured.popular));
        setSmartPickServices(subToCard(cachedFeatured.smartPicks));
        setRecommendedServices(subToCard(cachedFeatured.recommended));
      }
    }

    setLoading(prev => isRefresh ? true : prev); 
    try {
      console.log('[HOME DEBUG] Starting data fetch...');
      const queryParams = isRefresh ? '?refresh=true' : '';
      setServicesError(null);
      
      // Phase 1: Auth + Core Services (with 5s Timeout)
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth Timeout')), 5000));
      
      console.log('[HOME DEBUG] Phase 1: Checking session...');
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
      const user = session?.user;

      console.log('[HOME DEBUG] Phase 1: Fetching services...');
      const srvRes = await api.get(`/api/v1/services${queryParams}`);

      // If backend returned services, use them
      if (srvRes.data && Array.isArray(srvRes.data)) {
        const mapped = (srvRes.data as any[]).filter((s: any) => (s.priority_number || 0) <= 10).map(mapService);
        setServices(prev => JSON.stringify(prev) === JSON.stringify(mapped) ? prev : mapped);
        localCache.set('home:services', srvRes.data.filter((s: any) => (s.priority_number || 0) <= 10), 600);
      } else {
        console.warn('[HOME] Backend services failed, using Supabase fallback');
        const { data: fallbackServices } = await supabase
          .from('services').select('id, name, slug, description, image_url, display_order')
          .eq('is_active', true).order('display_order', { ascending: true }).limit(20);

        if (fallbackServices?.length) {
          const mapped = fallbackServices.map(mapService);
          setServices(prev => JSON.stringify(prev) === JSON.stringify(mapped) ? prev : mapped);
          localCache.set('home:services', fallbackServices, 600);
        } else {
          setServicesError(srvRes.error || 'Services unavailable');
        }
      }

      // Phase 2: Load featured & banners in background (non-blocking)
      (async () => {
        try {
          const [featuredRes, bannerRes] = await Promise.all([
            api.get(`/api/v1/services/featured${queryParams}`),
            api.get(`/api/v1/services/banners${queryParams}`),
          ]);
          if (featuredRes.data && !featuredRes.error) {
            const subToCard = (list: any[]) => (list || []).map(item => ({
              ...item, Icon: getIconForCategory(item.slug || 'home'), bg: getBgForCategory(item.slug || 'home'), color: getColorForCategory(item.slug || 'home'),
            }));
            
            setPopularServices(prev => JSON.stringify(prev) === JSON.stringify(subToCard(featuredRes.data.popular)) ? prev : subToCard(featuredRes.data.popular));
            setSmartPickServices(prev => JSON.stringify(prev) === JSON.stringify(subToCard(featuredRes.data.smartPicks)) ? prev : subToCard(featuredRes.data.smartPicks));
            setRecommendedServices(prev => JSON.stringify(prev) === JSON.stringify(subToCard(featuredRes.data.recommended)) ? prev : subToCard(featuredRes.data.recommended));
            localCache.set('home:featured', featuredRes.data, 600);
          }
          if (bannerRes.data && Array.isArray(bannerRes.data)) {
            setBanners(prev => JSON.stringify(prev) === JSON.stringify(bannerRes.data) ? prev : bannerRes.data);
            localCache.set('home:banners', bannerRes.data, 600);
          }
        } catch (e) {
          console.warn('[Home] Featured/banners failed:', e);
        }
      })();

      // Phase 2: Background user-specific data
      (async () => {
        if (!user) return;
        const userId = user.id; // narrowed: guaranteed string after guard
        try {
          const results = await Promise.all([
            api.get('/api/v1/users/me').catch(() => ({ data: null } as any)),
            supabase.from('bookings').select('id, service_name_snapshot')
              .eq('customer_id', userId).eq('status', 'completed').is('customer_rating', null)
              .order('completed_at', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('bookings').select('id, service_name_snapshot, completed_at, scheduled_date')
              .eq('customer_id', userId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(3),
            supabase.from('bookings').select('id, status, service_name_snapshot, booking_number, batch_id')
              .eq('customer_id', userId).in('status', ['requested', 'searching', 'confirmed', 'en_route', 'arrived', 'in_progress'])
              .order('created_at', { ascending: false }).limit(3),
            api.get('/api/v1/drafts').catch(() => ({ data: [] } as any)),
            api.get('/api/v1/addresses').catch(() => ({ data: [] } as any))
          ]);

          
          const [meRes, unratedRes, recentRes, activeRes, draftRes, addressRes] = results as any[];

          if (meRes.data?.data) {
            const p = meRes.data.data;
            setLoyaltyCoins(p.loyalty_coins || 0);
            setUnreadCount(p.unread_notifications || 0);
            const cur = useAddressStore.getState();
            if (p.city && !cur.selectedAddress && (cur.rawLocationName === 'Detecting location...' || cur.rawLocationName === 'Please select location')) {
              setRawLocationName(p.city);
            }
          }
          if (unratedRes.data) setUnratedBooking(unratedRes.data);
          if (recentRes.data) setRecentBookings(recentRes.data);
          
          if (activeRes.data && activeRes.data.length > 0 && !isBannerDismissedThisSession) {
            setActiveBookings(activeRes.data);
            Animated.spring(bannerSlide, { toValue: 0, useNativeDriver: true, speed: 10 }).start();
          } else {
            setActiveBookings([]);
          }
          if (Array.isArray(draftRes.data)) setDrafts(draftRes.data);

          // GPS & Addresses — safe, never throws
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              // Use last known first (instant, no GPS hang). Fall back to current only if needed.
              let loc = await Location.getLastKnownPositionAsync({});
              if (!loc) {
                loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              }
              if (loc) {
                const savedAddrs = (addressRes.data || []).map((a: any) => ({
                  id: a.id, label: a.label, name: a.name, address: a.full_address, latitude: a.latitude, longitude: a.longitude
                }));
                autoDetectAddress(loc.coords.latitude, loc.coords.longitude, savedAddrs);
                if (meRes.data?.data && !meRes.data.data.city) {
                  const rev = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                  if (rev[0]?.city) {
                    await supabase.from('profiles').update({ city: rev[0].city, preferred_location_lat: loc.coords.latitude, preferred_location_lng: loc.coords.longitude }).eq('id', user.id);
                  }
                }
              }
            }
          } catch {
            // GPS unavailable (device off, emulator, permission revoked) — silently skip
            console.warn('[Home] GPS unavailable, skipping location update');
          }
        } catch (phase2Err) {
          console.error('Background error:', phase2Err);
        }
      })();

      supabase.from('coupons').select('*').eq('is_active', true).limit(5).then(({ data }) => data && (() => {}));
    } catch (err) {
      console.error('loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, [bannerSlide, setRawLocationName, autoDetectAddress]);

  // Sync refs on each render so they always call the latest version
  loadDataRef.current = loadData;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  // 🛡️ Subscribe to realtime booking updates (extracted for reuse)
  const subscribeToBookingUpdates = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    // Clean up existing channel first
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel(`home-active-booking-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${session.user.id}` },
        async (payload) => {
          // Only process events when app is in foreground
          if (appStateRef.current !== 'active') return;
          
          console.log('[Real-time 📢] Active booking update:', payload.eventType);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const booking = payload.new as any;
            const activeStatuses = ['requested', 'searching', 'confirmed', 'en_route', 'arrived', 'in_progress'];
            
            if (activeStatuses.includes(booking.status)) {
              const { data: active } = await supabase
                .from('bookings').select('id, status, service_name_snapshot, booking_number, batch_id')
                .eq('customer_id', session.user.id)
                .in('status', activeStatuses)
                .order('created_at', { ascending: false })
                .limit(3);
              
              if (active && active.length > 0 && !isBannerDismissedThisSession) {
                setActiveBookings(active);
                Animated.spring(bannerSlide, { toValue: 0, useNativeDriver: true, speed: 10 }).start();
              }
            } else if (booking.status === 'completed' || booking.status === 'cancelled') {
              setActiveBookings(prev => prev.filter(b => b.id !== booking.id));
              if (activeBookings.length <= 1) {
                Animated.timing(bannerSlide, { toValue: -80, useNativeDriver: true, duration: 200 }).start();
              }
              if (booking.status === 'completed') {
                loadData(); 
              }
            }
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  }, [bannerSlide, loadData, activeBookings.length]);

  // Sync refs
  subscribeRef.current = subscribeToBookingUpdates;

  // 🛡️ Start pulse animation (extracted for reuse)
  const startPulseAnimation = useCallback(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(notifPulse, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        Animated.timing(notifPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.delay(3000),
      ])
    );
    pulseAnimRef.current = anim;
    anim.start();
  }, [notifPulse]);

  // Sync ref
  startPulseRef.current = startPulseAnimation;

  // 🛡️ AppState lifecycle: pause everything in background, resume in foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState.match(/active/) && nextState.match(/inactive|background/)) {
        // === GOING TO BACKGROUND ===
        console.log('[Home] Backgrounded — pausing animations & realtime');
        lastBackgroundTimeRef.current = Date.now();
        
        // Stop infinite animation to free CPU
        if (pulseAnimRef.current) {
          pulseAnimRef.current.stop();
          pulseAnimRef.current = null;
        }
        
        // Unsubscribe realtime channel
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
      } else if (prevState.match(/inactive|background/) && nextState === 'active') {
        // === RETURNING TO FOREGROUND ===
        console.log('[Home] Foregrounded — resuming animations & data');
        
        // Resume animation
        startPulseRef.current();
        
        // Re-subscribe realtime
        subscribeRef.current();
        
        // 🛡️ Soft refresh data — only if it's been > 5 minutes to prevent annoying reloads
        const awayTime = Date.now() - lastBackgroundTimeRef.current;
        if (awayTime > 5 * 60 * 1000) {
          console.log('[Home] Away for > 5m, refreshing data');
          loadDataRef.current();
        } else {
          console.log('[Home] Away for brief moment, skipping reload');
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Refresh data when screen comes into focus — debounced to 2 minutes
  // This prevents hammering the API on every tab switch
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastLoadTimeRef.current > 2 * 60 * 1000) {
        lastLoadTimeRef.current = now;
        loadDataRef.current();
      }
    }, [])
  );

  // 🔑 Single mount effect — runs ONCE, uses refs to avoid re-run loops
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;

    loadDataRef.current();
    startPulseRef.current();
    subscribeRef.current();

    return () => {
      if (pulseAnimRef.current) pulseAnimRef.current.stop();
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    };
  }, []);

  const dismissBanner = () => {
    isBannerDismissedThisSession = true;
    Animated.timing(bannerSlide, { toValue: -80, useNativeDriver: true, duration: 200 }).start(() => setActiveBookings([]));
  };

  return (
    <View style={styles.root}>
      <HomeHeader
        selectedAddress={selectedAddress}
        rawLocationName={rawLocationName}
        loyaltyCoins={loyaltyCoins}
        unreadCount={unreadCount}
        notifPulse={notifPulse}
      />

      {activeBookings.length > 0 && (
        <ActiveBookingBanner activeBookings={activeBookings} bannerSlide={bannerSlide} onDismiss={dismissBanner} />
      )}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
      >
        <RatingPrompt unratedBooking={unratedBooking} onDismiss={() => setUnratedBooking(null)} />
        <OffersCarousel banners={banners} loading={loading} />
        
        {/* Continue Booking Draft Card */}
        {!loading && drafts.length > 0 && (
          <View style={styles.draftSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Continue Booking</Text>
              <TouchableOpacity onPress={async () => {
                // Clear all drafts
                await Promise.all(drafts.map(d => api.delete(`/api/v1/drafts/${d.id}`)));
                setDrafts([]);
              }}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.draftScroll}>
              {drafts.map(draft => (
                <TouchableOpacity
                  key={draft.id}
                  style={styles.draftCard}
                  onPress={() => router.push({
                    pathname: `/book/${draft.service_id}`,
                    params: { resume: 'true', draftId: draft.id }
                  } as any)}
                >
                  <View style={styles.draftCircle}>
                    <Text style={styles.draftPercent}>{Math.round((draft.current_step / draft.total_steps) * 100)}%</Text>
                  </View>
                  <View style={styles.draftContent}>
                    <Text style={styles.draftMain} numberOfLines={1}>
                      {draft.service_subcategories?.name || 'Incomplete Booking'}
                    </Text>
                    <Text style={styles.draftSub}>Step {draft.current_step} of {draft.total_steps}</Text>
                  </View>
                  <ChevronRight size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <QuickRebook recentBookings={recentBookings} />

        {/* Section Nav Grid */}
        <View style={styles.topNavGrid}>
          {SECTION_NAV.map((item) => (
            <TouchableOpacity key={item.key} style={styles.topNavItem} onPress={() => scrollToSection(item.key)}>
              <View style={styles.topNavImagePlaceholder}>
                <Text style={styles.topNavEmoji}>{item.emoji}</Text>
              </View>
              <Text style={styles.topNavLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ServiceGrid services={services} loading={loading} error={servicesError} onRetry={() => loadData(true)} onLayout={y => { sectionRefs.current['all'] = y; }} />

        {popularServices.length > 0 && (
          <FeaturedSection title="⭐ Popular Services" data={popularServices} loading={loading} layout="popular" onLayout={y => { sectionRefs.current['popular'] = y; }} />
        )}
        {smartPickServices.length > 0 && (
          <FeaturedSection title="⚡ Smart Picks" data={smartPickServices} loading={loading} layout="smart" onLayout={y => { sectionRefs.current['smart'] = y; }} />
        )}
        {recommendedServices.length > 0 && (
          <FeaturedSection title="Recommended for You" data={recommendedServices} loading={loading} layout="recommended" onLayout={y => { sectionRefs.current['recommended'] = y; }} />
        )}

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { paddingBottom: 12, paddingTop: 0 },
  topNavGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  topNavItem: { alignItems: 'center', width: (width - 32) / 4.5 },
  topNavImagePlaceholder: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  topNavEmoji: { fontSize: 24, opacity: 0.8 },
  topNavLabel: { fontSize: 11, fontWeight: '700', color: '#374151', textAlign: 'center' },

  // Draft Section
  draftSection: { paddingHorizontal: 16, marginTop: 12, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  clearAllText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  draftScroll: { gap: 12, paddingRight: 20 },
  draftCard: {
    width: 260,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  draftCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  draftPercent: { fontSize: 11, fontWeight: '800', color: PRIMARY },
  draftContent: { flex: 1 },
  draftMain: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  draftSub: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
});
