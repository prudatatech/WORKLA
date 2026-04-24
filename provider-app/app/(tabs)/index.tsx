import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProviderHero from '../../components/home/ProviderHero';
import StatsRow from '../../components/home/StatsRow';
import WeeklyChart from '../../components/home/WeeklyChart';
import LiveMap from '../../components/home/LiveMap';
import { StatCardSkeleton, EarningRowSkeleton } from '../../components/SkeletonLoader';
import { Clock, MapPin } from 'lucide-react-native';
import { api } from '../../lib/api';
import { localCache } from '../../lib/localCache';
import { supabase } from '../../lib/supabase';
import { registerForPushNotificationsAsync } from '../../lib/notifications';

const PRIMARY = '#1A3FFF';
const ONLINE_COLOR = '#059669';
const LOCATION_TASK_NAME = 'BACKGROUND_LOCATION_TASK';

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) { console.error('Location Task Error:', error); return; }
  if (data) {
    const { locations } = data;
    const location = locations[0];
    if (location) {
      try {
        await api.post('/api/v1/providers/location', { latitude: location.coords.latitude, longitude: location.coords.longitude });
      } catch (err) { console.error('Failed to sync background location:', err); }
    }
  }
});

interface IncomingJob {
  offerId: string; bookingId: string; service: string; address: string;
  distance: string; estimatedPrice: number; customerName: string; scheduledDate: string; timeSlot: string;
}

interface IncompleteProfile {
  type: 'kyc' | 'bank' | 'both' | null;
  underReview?: boolean;
}

export default function ProviderHomeScreen() {
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayJobs, setTodayJobs] = useState(0);
  const [rating, setRating] = useState(0);
  const [weeklyData, setWeeklyData] = useState<number[]>(new Array(7).fill(0));
  const [providerName, setProviderName] = useState('Provider');
  const [activeJob, setActiveJob] = useState<any>(null);
  const [incompleteProfile, setIncompleteProfile] = useState<IncompleteProfile | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentCity, setCurrentCity] = useState<string>('Detecting location...');


  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (isOnline) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isOnline, pulseAnim]);

  const stopLocationTracking = async () => {
    if (locationSubRef.current) { locationSubRef.current.remove(); locationSubRef.current = null; }
    try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch { }
  };

  const startLocationTracking = async (userId: string) => {
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') { setCurrentCity('Permission Denied'); return; }
      await Location.requestBackgroundPermissionsAsync();

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCurrentLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      await api.post('/api/v1/providers/location', { latitude: loc.coords.latitude, longitude: loc.coords.longitude });

      const [address] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (address) setCurrentCity(address.city || address.subregion || address.district || 'Location Set');

      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced, timeInterval: 60000, distanceInterval: 50,
        foregroundService: { notificationTitle: "Workla Provider Online", notificationBody: "Your location is being shared with customers", notificationColor: PRIMARY },
      });

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (locUpdate) => {
          setCurrentLocation({ latitude: locUpdate.coords.latitude, longitude: locUpdate.coords.longitude });
          api.post('/api/v1/providers/location', { latitude: locUpdate.coords.latitude, longitude: locUpdate.coords.longitude });
        }
      );
    } catch { }
  };

  const loadStats = useCallback(async () => {
    // ── Instant: Show cached stats while refreshing ──
    const cached = await localCache.get<any>('provider:stats');
    if (cached) {
      setTodayEarnings(cached.todayEarnings || 0);
      setTodayJobs(cached.todayJobs || 0);
      setRating(cached.rating || 0);
      setWeeklyData(cached.weeklyData || [0,0,0,0,0,0,0]);
      setProviderName(cached.providerName || 'Provider');
      if (cached.isOnline !== undefined) setIsOnline(cached.isOnline);
      setLoading(false); // Show content immediately from cache
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: sp } = await supabase.from('provider_details').select('is_online, avg_rating, business_name').eq('provider_id', user.id).maybeSingle();
    if (sp) {
      setIsOnline(sp.is_online ?? false);
      setRating(sp.avg_rating ?? 0);
      setProviderName(sp.business_name ?? 'Provider');
      if (sp.is_online) startLocationTracking(user.id);
    }

    const { data: docs } = await supabase.from('provider_documents').select('id, verified_status').eq('provider_id', user.id);
    const hasDocuments = docs && docs.length > 0;
    const allVerified = hasDocuments && docs.every(d => d.verified_status === 'verified');
    const hasPending = hasDocuments && docs.some(d => d.verified_status === 'pending');
    
    const { data: bank } = await supabase.from('provider_bank_accounts').select('id').eq('provider_id', user.id).maybeSingle();
    
    // If documents are pending review, we'll store that state to change UI color
    const isUnderReview = hasPending && !allVerified;
    
    if (!hasDocuments && !bank) setIncompleteProfile({ type: 'both', underReview: !!isUnderReview });
    else if (!hasDocuments) setIncompleteProfile({ type: 'kyc', underReview: !!isUnderReview });
    else if (!bank) setIncompleteProfile({ type: 'bank', underReview: !!isUnderReview });
    else if (!allVerified) setIncompleteProfile({ type: 'kyc', underReview: !!isUnderReview });
    else setIncompleteProfile(null);

    try {
      const res = await api.get('/api/v1/providers/analytics');
      if (res.data) {
        setTodayEarnings(res.data.todayEarnings || 0);
        setTodayJobs(res.data.todayJobs || 0);
        setWeeklyData(res.data.weeklyData || [0, 0, 0, 0, 0, 0, 0]);
        if (res.data.rating) setRating(res.data.rating);

        // Cache the stats for instant loading next time
        localCache.set('provider:stats', {
          todayEarnings: res.data.todayEarnings || 0,
          todayJobs: res.data.todayJobs || 0,
          rating: res.data.rating || sp?.avg_rating || 0,
          weeklyData: res.data.weeklyData || [0,0,0,0,0,0,0],
          providerName: sp?.business_name || 'Provider',
          isOnline: sp?.is_online ?? false,
        }, 300); // 5-min TTL
      }

      // Fetch active job for UI
      try {
          const activeRes = await api.get('/api/v1/bookings?role=provider&status=confirmed,en_route,arrived,in_progress');
          if (activeRes.data && activeRes.data.length > 0) {
              setActiveJob(activeRes.data[0]);
          } else {
              setActiveJob(null);
          }
      } catch (err) { console.error('Failed to fetch active job', err); }

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    loadStats(); 
    
    // Register for push notifications for "Always On" reliability
    registerForPushNotificationsAsync();
  }, [loadStats]);

  // Silent refresh when tab is re-focused (e.g. after accepting a job)
  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);







  const toggleOnline = async () => {
    if (toggling) return; // prevent double-tap
    
    // 🛡️ KYC CHECK: Block going online if KYC is incomplete
    if (!isOnline && (incompleteProfile?.type === 'kyc' || incompleteProfile?.type === 'both')) {
        Alert.alert(
            'Action Required 🛡️',
            'Please complete your identity verification (Aadhaar/PAN) before going online.',
            [
                { text: 'Later', style: 'cancel' },
                { text: 'Complete KYC', onPress: () => router.push('/onboarding' as any) }
            ]
        );
        return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setToggling(true);
    const newVal = !isOnline;

    // ⚡ Optimistic: flip toggle INSTANTLY — feels responsive on first press
    setIsOnline(newVal);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsOnline(!newVal); return; } // rollback if no user

      const res = await api.patch('/api/v1/providers/online', { is_online: newVal });
      if (!res.data?.success) {
        setIsOnline(!newVal); // rollback on failure
        throw new Error(res.data?.error || 'Failed to update status. Please try again.');
      }

      if (newVal) startLocationTracking(user.id); else stopLocationTracking();
    } catch (e: any) { Alert.alert('Status Error', e.message); }
    finally { setToggling(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={isOnline ? ONLINE_COLOR : '#374151'} />

      <ProviderHero
        isOnline={isOnline} toggling={toggling} providerName={providerName}
        pulseAnim={pulseAnim} onToggle={toggleOnline} onBellPress={() => router.push('/explore' as any)}
      />

      <ScrollView 
        contentContainerStyle={styles.scroll} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
      >
        {loading && !refreshing ? (
          <View style={{ gap: 20 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ width: 120, height: 18, backgroundColor: '#F3F4F6', borderRadius: 4, marginBottom: 10 }} />
              {[1, 2, 3].map(i => <EarningRowSkeleton key={i} />)}
            </View>
          </View>
        ) : (
          <View>
            <StatsRow todayEarnings={todayEarnings} todayJobs={todayJobs} rating={rating} />

            {!isOnline && incompleteProfile && (
              <TouchableOpacity 
                style={[styles.kycCard, (incompleteProfile as any).underReview && { backgroundColor: '#3B82F6', shadowColor: '#3B82F6' }]} 
                onPress={() => router.push('/onboarding' as any)} 
                activeOpacity={0.9}
              >
                <View style={styles.kycIconWrap}>
                    {(incompleteProfile as any).underReview ? <Clock size={20} color="#FFF" /> : <AlertTriangle size={20} color="#FFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kycTitle}>{(incompleteProfile as any).underReview ? 'Verification Under Review' : 'Action Required'}</Text>
                  <Text style={styles.kycSub}>
                    {(incompleteProfile as any).underReview ? 'Our team is reviewing your documents. This takes 24-48h.' :
                      incompleteProfile.type === 'both' ? 'Complete KYC & add bank details' :
                      incompleteProfile.type === 'kyc' ? 'Upload identity documents (Aadhaar)' : 'Add your bank account for payouts'}
                  </Text>
                </View>
                <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}

            {!isOnline && (
              <View style={styles.offlineTip}>
                <AlertTriangle size={18} color="#D97706" />
                <Text style={styles.offlineTipText}>Go online to start receiving work requests in your area.</Text>
              </View>
            )}

            {isOnline && (
              <View style={styles.locationBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationTitle}>Live Location</Text>
                  <Text style={styles.locationText} numberOfLines={1}>{currentCity}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.syncBtn} 
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const { data } = await supabase.auth.getUser();
                    if (data.user) startLocationTracking(data.user.id);
                  }}
                >
                  <Text style={styles.syncBtnText}>Sync Now</Text>
                </TouchableOpacity>
              </View>
            )}

            {isOnline && activeJob && (
                <View style={[styles.activeJobWidget, {marginHorizontal: 20, marginTop: 16, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE'}]}>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
                        <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY, marginRight: 8, elevation: 4}} />
                        <Text style={{fontSize: 14, fontWeight: '800', color: '#1E3A8A', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5}}>Current Job Active</Text>
                        <Text style={{fontSize: 12, fontWeight: '800', color: '#3B82F6'}}>{activeJob.status.replace('_', ' ').toUpperCase()}</Text>
                    </View>
                    <Text style={{fontSize: 18, fontWeight: '900', color: '#1E3A8A', marginBottom: 6}}>{activeJob.service_subcategories?.name || 'Service Appointment'}</Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 16}}>
                        <MapPin size={14} color="#60A5FA" style={{marginRight: 6}} />
                        <Text style={{fontSize: 13, color: '#3B82F6', fontWeight: '500'}} numberOfLines={1}>{activeJob.customer_address || 'Customer Location'}</Text>
                    </View>
                    <TouchableOpacity 
                        style={{backgroundColor: PRIMARY, paddingVertical: 12, borderRadius: 12, alignItems: 'center'}}
                        onPress={() => router.push('/(tabs)/jobs' as any)}
                        activeOpacity={0.8}
                    >
                        <Text style={{color: '#FFF', fontSize: 14, fontWeight: '800'}}>Manage Job</Text>
                    </TouchableOpacity>
                </View>
            )}

            {isOnline && currentLocation && !activeJob && <LiveMap currentLocation={currentLocation} currentCity={currentCity} />}

            <WeeklyChart weeklyData={weeklyData} />

            <View style={styles.howCard}>
              <Text style={styles.howTitle}>How it works</Text>
              {[
                { n: '1', t: 'Go Online', d: 'Toggle availability to see requests.' },
                { n: '2', t: 'Accept Job', d: 'New job alerts will pop up instantly.' },
                { n: '3', t: 'Navigate', d: 'Use build-in maps to reach customer.' },
                { n: '4', t: 'Earn & Withdraw', d: 'Money is added to wallet instantly.' },
              ].map(step => (
                <View key={step.n} style={styles.howRow}>
                  <View style={styles.howNum}><Text style={styles.howNumText}>{step.n}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.howStepTitle}>{step.t}</Text>
                    <Text style={styles.howStepDesc}>{step.d}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ height: 100 }} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF' },
  scroll: { padding: 20 },
  kycCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#EF4444', borderRadius: 20, padding: 16, marginBottom: 20,
    elevation: 4, shadowColor: '#EF4444', shadowOpacity: 0.3, shadowRadius: 10
  },
  kycIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  kycTitle: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  kycSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  offlineTip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FEF3C7' },
  offlineTipText: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '500' },
  howCard: { backgroundColor: '#F8FAFC', borderRadius: 24, padding: 20, marginBottom: 20 },
  howTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 20 },
  howRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  howNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  howNumText: { color: PRIMARY, fontSize: 14, fontWeight: '800' },
  howStepTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  howStepDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  activeJobWidget: {},
  locationBanner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFF', 
    marginHorizontal: 20, 
    marginTop: 20, 
    padding: 16, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#F3F4F6',
    gap: 12
  },
  locationTitle: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  locationText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  syncBtn: { backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  syncBtnText: { color: PRIMARY, fontSize: 13, fontWeight: '700' },
});
