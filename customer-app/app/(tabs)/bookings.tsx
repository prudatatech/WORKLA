import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { PRIMARY } from '../../lib/ui-constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookingCardSkeleton } from '../../components/SkeletonLoader';
import BookingCard from '../../components/bookings/BookingCard';
import CancelModal from '../../components/bookings/CancelModal';
import FilterTabs from '../../components/common/FilterTabs';
import EmptyState from '../../components/EmptyState';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { localCache } from '../../lib/localCache';

const BookingsEmptyImg = require('../../assets/images/bookings-empty.png');

const FILTER_TABS = ['Latest', 'Completed', 'All'];

function MyBookingsScreen() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('Latest');

  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [cancelling, setCancelling] = useState(false);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const hasMountedRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);

  const router = useRouter();

  const renderLatest = () => {
    if (bookings.length === 0) return null;
    
    // Sort by created_at desc to find latest
    const sorted = [...bookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sorted[0];

    return (
      <View style={styles.latestContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured Order</Text>
          <TouchableOpacity onPress={() => router.push(`/track/${latest.id}` as any)}>
            <Text style={styles.viewFullDetail}>Monitor Status</Text>
          </TouchableOpacity>
        </View>
        
        {/* Featured Card */}
        <TouchableOpacity 
          style={styles.featuredCard}
          onPress={() => router.push(`/track/${latest.id}` as any)}
          activeOpacity={0.9}
        >
          <View style={styles.featuredBadge}>
            <RefreshCw size={10} color="#FFF" />
            <Text style={styles.featuredBadgeText}>LATEST ACTIVITY</Text>
          </View>
          <Text style={styles.featuredService}>{latest.service_subcategories?.name || 'Service'}</Text>
          <Text style={styles.featuredDate}>Ordered {new Date(latest.created_at).toLocaleDateString()} • {new Date(latest.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          
          <View style={styles.featuredPriceBox}>
            <Text style={styles.featuredPriceLabel}>Amount Paid</Text>
            <Text style={styles.featuredPrice}>₹{latest.total_amount}</Text>
          </View>

          <View style={styles.featuredDivider} />
          
          <View style={styles.featuredFooter}>
            <View style={{ flex: 1 }}>
              <Text style={styles.featuredStatusLabel}>CURRENT STATUS</Text>
              <Text style={styles.featuredStatusVal}>{latest.status.replace('_', ' ').toUpperCase()}</Text>
            </View>
            <TouchableOpacity style={styles.trackBtnSmall} onPress={() => router.push(`/track/${latest.id}` as any)}>
              <Text style={styles.trackBtnSmallText}>View Full Detail</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        
        {bookings.length > 1 && (
          <View style={{ marginTop: 30 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
            </View>
            {sorted.slice(1, 4).map(item => (
              <BookingCard key={item.id} item={item} onCancel={(id) => { setCancelConfirmId(id); setCancelReason(''); setCustomReason(''); }} />
            ))}
          </View>
        )}
      </View>
    );
  };

  // Stable fetch function — no dependency on refreshing state
  const fetchBookings = useCallback(async (isSilent = false) => {
    const cacheKey = 'customer:bookings';
    
    if (!isSilent) {
      localCache.get<any[]>(cacheKey).then(cached => {
        if (cached?.length) {
          setBookings(cached);
          setLoading(false); // Render immediately from cache
        } else {
          setLoading(true);
        }
      });
    }

    try {
      console.log('[BOOKINGS DEBUG] Fetching bookings...');
      // 🛡️ 5-second safety timeout for auth + api
      const sessionPromise = supabase.auth.getUser();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth Timeout')), 5000));
      
      const { data: { user } } = await Promise.race([sessionPromise, timeoutPromise]) as any;

      if (!user) {
        console.warn('[BOOKINGS DEBUG] No user found');
        if (!isSilent) router.replace('/auth');
        return;
      }

      console.log('[BOOKINGS DEBUG] Fetching from API...');
      const res = await api.get('/api/v1/bookings');
      if (res.data) {
        console.log('[BOOKINGS DEBUG] Success:', res.data.length, 'bookings');
        setBookings(res.data);
        localCache.set(cacheKey, res.data, 600); // Cache for 10 minutes
      }
    } catch (e: any) {
      console.error('[BOOKINGS DEBUG] Error:', e.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed router to prevent infinite loop

  // Real-time subscription — runs once on mount, stable because fetchBookings is stable
  useEffect(() => {
    let channel: any;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await fetchBookings();
      
      channel = supabase
        .channel(`user-bookings-live-${user.id}`)
        .on(
          'postgres_changes', 
          { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${user.id}` }, 
          (payload) => {
            console.log('[Bookings Real-time] Change detected:', payload.eventType);
            setIsLiveUpdating(true);
            fetchBookings(true); // Silent refresh — no loading spinner
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTimeout(() => setIsLiveUpdating(false), 2000);
          }
        )
        .subscribe((status) => {
          console.log('[Bookings Real-time] Status:', status);
        });
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchBookings]);

  // Debounced tab focus refresh (every 2 minutes max) to prevent hammering
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (hasMountedRef.current && (now - lastLoadTimeRef.current > 2 * 60 * 1000)) {
        lastLoadTimeRef.current = now;
        fetchBookings(true);
      }
      hasMountedRef.current = true;
    }, [fetchBookings])
  );

  const doCancel = async () => {
    if (!cancelReason || !cancelConfirmId) {
      alert("Please select a reason");
      return;
    }
    const finalReason = cancelReason === 'Other' ? customReason : cancelReason;
    setCancelling(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await api.patch(`/api/v1/bookings/${cancelConfirmId}/status`, { status: 'cancelled', cancellationReason: finalReason });
    setCancelConfirmId(null);
    setCancelling(false);
    fetchBookings();
  };

  const filtered = bookings.filter((b) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Completed') return b.status === 'completed';
    return true;
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Bookings</Text>
          <TouchableOpacity onPress={() => fetchBookings()} style={styles.refreshBtn}>
            <AlertCircle size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <FilterTabs tabs={FILTER_TABS} activeTab={activeFilter} onTabPress={setActiveFilter} />

        {loading && !refreshing ? (
          <View style={styles.loadingWrap}>
            {Array.from({ length: 4 }).map((_, i) => <BookingCardSkeleton key={i} />)}
          </View>
        ) : (
          <FlatList
            data={activeFilter === 'Latest' ? [] : filtered}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <View>
                {activeFilter === 'Latest' && renderLatest()}
                {isLiveUpdating && !refreshing && (
                  <View style={styles.liveIndicator}>
                    <RefreshCw size={12} color={PRIMARY} />
                    <Text style={styles.liveIndicatorText}>Live Update Detected...</Text>
                  </View>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <BookingCard item={item} onCancel={(id) => { setCancelConfirmId(id); setCancelReason(''); setCustomReason(''); }} />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} />}
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={5}
            ListEmptyComponent={
              <EmptyState 
                title="No Bookings Yet"
                description={activeFilter === 'All' ? 'You haven\'t booked any services yet. Start exploring now!' : `You don't have any ${activeFilter.toLowerCase()} bookings.`}
                imageSource={BookingsEmptyImg}
                ctaLabel={activeFilter === 'All' ? 'Explore Services' : undefined}
                onCtaPress={activeFilter === 'All' ? () => router.push('/(tabs)/explore' as any) : undefined}
              />
            }
          />
        )}

        <CancelModal
          visible={cancelConfirmId !== null}
          bookingId={cancelConfirmId}
          cancelReason={cancelReason}
          customReason={customReason}
          cancelling={cancelling}
          onClose={() => setCancelConfirmId(null)}
          onSelectReason={setCancelReason}
          onCustomReasonChange={setCustomReason}
          onConfirm={doCancel}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

export default MyBookingsScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  refreshBtn: { padding: 4 },
  listContent: { padding: 16, paddingBottom: 160 },
  loadingWrap: { flex: 1, padding: 16, backgroundColor: '#F9FAFB' },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151' },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24 },
  activeSection: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  viewFullDetail: { fontSize: 12, fontWeight: '700', color: PRIMARY },
  latestContainer: { paddingBottom: 20 },
  featuredCard: {
    backgroundColor: PRIMARY,
    borderRadius: 24,
    padding: 24,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
    marginTop: 4
  },
  featuredBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 16 },
  featuredBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  featuredService: { fontSize: 22, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  featuredDate: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: 24 },
  featuredPriceBox: { marginBottom: 24 },
  featuredPriceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  featuredPrice: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  featuredDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  featuredFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featuredStatusLabel: { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: '800', marginBottom: 2 },
  featuredStatusVal: { fontSize: 14, color: '#4ADE80', fontWeight: '900' },
  trackBtnSmall: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  trackBtnSmallText: { fontSize: 12, fontWeight: '800', color: PRIMARY },

  liveIndicator: {
    marginVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  liveIndicatorText: { fontSize: 10, color: PRIMARY, fontWeight: '700' },
});
