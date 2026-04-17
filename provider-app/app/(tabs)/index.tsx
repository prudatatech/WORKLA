import * as Haptics from 'expo-haptics';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { useAudioPlayer } from 'expo-audio';
import { safeRequestPermissions, safeScheduleNotification, safeSetNotificationHandler, getPushTokenAsync, setupNotificationChannels } from '../../lib/notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, ChevronRight, MapPin } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, AppStateStatus, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProviderHero from '../../components/home/ProviderHero';
import StatsRow from '../../components/home/StatsRow';
import WeeklyChart from '../../components/home/WeeklyChart';
import LiveMap from '../../components/home/LiveMap';
import IncomingJobModal from '../../components/home/IncomingJobModal';
import VerificationSuccessModal from '../../components/VerificationSuccessModal';
import { StatCardSkeleton, EarningRowSkeleton } from '../../components/SkeletonLoader';
import { api } from '../../lib/api';
import { localCache } from '../../lib/localCache';
import { socketService } from '../../lib/socket';
import { supabase } from '../../lib/supabase';

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

export default function ProviderHomeScreen() {
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayJobs, setTodayJobs] = useState(0);
  const [rating, setRating] = useState(0);
  const [weeklyData, setWeeklyData] = useState<number[]>(new Array(7).fill(0));
  const [incomingJob, setIncomingJob] = useState<IncomingJob | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [providerName, setProviderName] = useState('Provider');
  const [incompleteProfile, setIncompleteProfile] = useState<{ type: 'kyc' | 'bank' | 'both' | null } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentCity, setCurrentCity] = useState<string>('Detecting location...');
  const [activeJob, setActiveJob] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(400)).current;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const player = useAudioPlayer(require('../../assets/sounds/job_alert.mp3')); // expo-audio player
  const jobCancelSubRef = useRef<any>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ⚡ Default to ALWAYS ON. Only turn off if the user explicitly clicked the toggle (cached === false).
  // Also auto-reconnect to backend and resume background tracking on open.
  useEffect(() => {
    localCache.get<boolean>('provider:isOnline').then(async cached => {
      if (cached !== false) {
        setIsOnline(true);
        // Auto-restore online status to backend (in case server lost it)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await api.patch('/api/v1/providers/online', { is_online: true });
            startLocationTracking(user.id);
          }
        } catch { /* silent — loadStats will retry */ }
      } else {
        setIsOnline(false);
      }
    });
  }, []);

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
      // 🛡️ Cleanup existing listener first to prevent leaks
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }

      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') { setCurrentCity('Permission Denied'); return; }
      await Location.requestBackgroundPermissionsAsync();

      // ⚡ Get fresh location immediately
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      
      setCurrentLocation({ latitude, longitude });
      api.post('/api/v1/providers/location', { latitude, longitude });

      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (address) {
        const cityStr = address.city || address.subregion || address.district || 'Location Set';
        setCurrentCity(cityStr);
        localCache.set('provider:location', { latitude, longitude, city: cityStr }, 86400);
      }

      // 📶 High-frequency background updates
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 30000,
        distanceInterval: 10,
        foregroundService: { notificationTitle: "Workla Provider Online", notificationBody: "Your location is being shared with customers", notificationColor: PRIMARY },
      });

      // 🔄 Foreground watch: fast updates while screen is on
      const lastUpdateRef = { time: 0, lat: latitude, lng: longitude };
      
      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (locUpdate) => {
          const lat = locUpdate.coords.latitude;
          const lng = locUpdate.coords.longitude;
          const now = Date.now();
          
          // 🛡️ Throttle: 10 meters OR 10 seconds
          const dist = Math.sqrt(Math.pow(lat - lastUpdateRef.lat, 2) + Math.pow(lng - lastUpdateRef.lng, 2));
          if (dist < 0.0001 && (now - lastUpdateRef.time) < 10000) return;
          
          lastUpdateRef.time = now;
          lastUpdateRef.lat = lat;
          lastUpdateRef.lng = lng;

          setCurrentLocation({ latitude: lat, longitude: lng });
          api.post('/api/v1/providers/location', { latitude: lat, longitude: lng });
        }
      );
    } catch (e) {
      console.error('Failed to start location tracking:', e);
    }
  };

  useEffect(() => {
    // ⚡ Instant load location from cache to avoid UI pop-in
    localCache.get<any>('provider:location').then(cachedLoc => {
      if (cachedLoc) {
        setCurrentCity(cachedLoc.city || '');
        if (cachedLoc.latitude && cachedLoc.longitude) {
          setCurrentLocation({ latitude: cachedLoc.latitude, longitude: cachedLoc.longitude });
        }
      }
    });

    // Request notification permissions
    (async () => {
      const { status } = await safeRequestPermissions();
      if (status !== 'granted' && status !== 'denied') {
          console.warn('Notification permissions not granted or failed');
      }
    })();

    // 🔔 Setup high-priority notification channels (job-alerts bypasses DnD)
    setupNotificationChannels();

    // Configure notification behavior
    safeSetNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });

    // 🚀 Register for Remote Push Notifications (Always On Support)
    (async () => {
        const token = await getPushTokenAsync();
        if (token) {
            try {
                await api.patch('/api/v1/users/push-token', { token });
                console.warn('[Sync] Push token registered with backend');
            } catch (err) {
                console.error('[Sync] Failed to register push token:', err);
            }
        }
    })();

    // 🔄 AppState listener: auto-refresh location + stats when app comes to foreground
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
        if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
            console.warn('[App] Foregrounded — syncing location & stats');
            const { data: { user } } = await supabase.auth.getUser();
            if (user) startLocationTracking(user.id);
        loadStats();
    }
    appStateRef.current = nextState;
});

return () => subscription.remove();
}, [loadStats]);

  const loadStats = useCallback(async (force = false) => {
    // ── Instant: Show cached stats while refreshing in background ──
    const cached = await localCache.get<any>('provider:stats');
    if (cached) {
      setTodayEarnings(cached.todayEarnings || 0);
      setTodayJobs(cached.todayJobs || 0);
      setRating(cached.rating || 0);
      setWeeklyData(cached.weeklyData || [0,0,0,0,0,0,0]);
      setProviderName(cached.providerName || 'Provider');
      if (cached.activeJob) setActiveJob(cached.activeJob);
      // isOnline is NOT read from stats cache — it has its own persistent key.
      setLoading(false); // Show content immediately from cache
      if (!force) {
        // Still fetch live in background — do NOT return early.
        // The live fetch below will correct any stale verification_status.
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      setLoading(true);
      const [providerRes, analyticsRes, activeJobRes] = await Promise.all([
        supabase
          .from('provider_details')
          .select(`
            is_online, 
            avg_rating, 
            business_name, 
            verification_status,
            provider_documents(id),
            provider_bank_accounts(id)
          `)
          .eq('provider_id', user.id)
          .maybeSingle(),
        api.get('/api/v1/providers/analytics'),
        api.get('/api/v1/bookings?role=provider&status=confirmed,en_route,arrived,in_progress')
      ]);

      if (providerRes.data) {
        const sp = providerRes.data;
        // Do NOT overwrite local isOnline state! It causes false "offline" flips during background syncs.
        setRating(sp.avg_rating ?? 0);
        setProviderName(sp.business_name ?? 'Provider');
        
        const hasDocs = sp.provider_documents && sp.provider_documents.length > 0;
        const hasBank = sp.provider_bank_accounts && sp.provider_bank_accounts.length > 0;
        const isUnderReviewOrVerified = sp.verification_status === 'pending' || sp.verification_status === 'verified';

        if (isUnderReviewOrVerified) {
          setIncompleteProfile(null);
        } else if (!hasDocs && !hasBank) {
          setIncompleteProfile({ type: 'both' });
        } else if (!hasDocs) {
          setIncompleteProfile({ type: 'kyc' });
        } else if (!hasBank) {
          setIncompleteProfile({ type: 'bank' });
        } else {
          setIncompleteProfile(null);
        }

        const currentCache = await localCache.get<any>('provider:stats') || {};
        localCache.set('provider:stats', { ...currentCache, verificationStatus: sp.verification_status }, 60);
      }

      let currentActiveJob = null;
      if (activeJobRes.data && activeJobRes.data.length > 0) {
        currentActiveJob = activeJobRes.data[0];
        setActiveJob(currentActiveJob);
      } else {
        setActiveJob(null);
      }

      if (analyticsRes.data) {
        const d = analyticsRes.data;
        setTodayEarnings(d.todayEarnings || 0);
        setTodayJobs(d.todayJobs || 0);
        setWeeklyData(d.weeklyData || [0, 0, 0, 0, 0, 0, 0]);
        if (d.rating) setRating(d.rating);

        localCache.set('provider:stats', {
          todayEarnings: d.todayEarnings || 0,
          todayJobs: d.todayJobs || 0,
          rating: d.rating || providerRes.data?.avg_rating || 0,
          weeklyData: d.weeklyData || [0,0,0,0,0,0,0],
          providerName: providerRes.data?.business_name || 'Provider',
          verificationStatus: providerRes.data?.verification_status || 'unverified',
          activeJob: currentActiveJob
        }, 300); // 5min TTL for analytics
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 🔔 Sound helper: play looping ringtone (expo-audio)
  const playJobAlertSound = useCallback(async () => {
    try {
      player.loop = true;
      player.volume = 1.0;
      player.play();
    } catch (e) {
      console.warn('[Sound] Failed to play job alert sound:', e);
    }
  }, [player]);

  const stopJobAlertSound = useCallback(async () => {
    try {
      player.pause();
      player.seekTo(0);
    } catch { }
  }, [player]);

  const handleReject = useCallback(async (offerId: string) => {
    stopJobAlertSound();
    if (countdownRef.current) clearInterval(countdownRef.current);
    // Remove booking cancellation listener
    if (jobCancelSubRef.current) { supabase.removeChannel(jobCancelSubRef.current); jobCancelSubRef.current = null; }
    Animated.timing(slideAnim, { toValue: 500, duration: 300, useNativeDriver: true }).start(() => setIncomingJob(null));
    await supabase.from('job_offers').update({ status: 'rejected' }).eq('id', offerId);
  }, [slideAnim, stopJobAlertSound]);

  const handleAccept = useCallback(async (offerId: string) => {
    // 🚀 Optimistic UI: Dismiss modal INSTANTLY with success feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopJobAlertSound();
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (jobCancelSubRef.current) { supabase.removeChannel(jobCancelSubRef.current); jobCancelSubRef.current = null; }
    Animated.timing(slideAnim, { toValue: 500, duration: 300, useNativeDriver: true }).start(() => setIncomingJob(null));
    
    // API call runs in background while user already sees success
    try {
      const res = await api.post(`/api/v1/job-offers/${offerId}/accept`, {});
      if (res.data?.success) {
        await loadStats(); // Refresh stats silently to fetch active job
        
        // Push user to Jobs screen so they can see full details and map
        setTimeout(() => {
            router.push('/(tabs)/jobs' as any);
        }, 600);
      } else { 
        // Only alert if the accept actually failed (rare)
        Alert.alert('Job Unavailable', res.data?.error || res.data?.message || 'This job has already been taken.'); 
      }
    } catch (e: any) { 
        const msg = e.response?.data?.error || e.response?.data?.message || e.message;
        Alert.alert('Error', msg || 'Failed to accept job'); 
    }
  }, [slideAnim, loadStats, stopJobAlertSound, router]);

  const showIncomingJob = useCallback(async (offer: any) => {
    let bookingData: any = null;
    try {
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('*, service_subcategories(name), profiles!bookings_customer_id_fkey(full_name)')
        .eq('id', offer.booking_id)
        .single();
      
      if (error) throw error;
      bookingData = booking;
    } catch (err) {
      console.warn('Failed to fetch booking details for popup, using fallback labels:', err);
    }

    setIncomingJob({
      offerId: offer.id, 
      bookingId: offer.booking_id,
      service: bookingData?.service_subcategories?.name ?? 'New Work Request',
      address: bookingData?.customer_address ?? 'Tap to see location',
      distance: offer.distance_km ? `${offer.distance_km.toFixed(1)} km away` : 'Nearby',
      estimatedPrice: bookingData?.total_amount ?? 0,
      customerName: (bookingData?.profiles as any)?.full_name ?? 'Customer',
      scheduledDate: bookingData?.scheduled_date ?? '', 
      timeSlot: bookingData?.scheduled_time_slot ?? '',
    });
    setCountdown(30);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Vibration.vibrate([0, 500, 200, 500]);
    playJobAlertSound(); // 🔔 Start ringing
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => { 
        if (prev <= 1) { 
          clearInterval(countdownRef.current!); 
          stopJobAlertSound(); // Stop ringing on timeout
          handleReject(offer.id); 
          return 0; 
        } 
        return prev - 1; 
      });
    }, 1000);

    // 📶 Listen for customer cancellation: if booking is cancelled, dismiss modal
    if (jobCancelSubRef.current) supabase.removeChannel(jobCancelSubRef.current);
    const channel = supabase.channel(`booking-cancel-${offer.booking_id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${offer.booking_id}`,
      }, (payload) => {
        const newStatus = (payload.new as any).status;
        if (newStatus === 'cancelled') {
          // Customer cancelled — dismiss modal silently
          stopJobAlertSound();
          if (countdownRef.current) clearInterval(countdownRef.current);
          Animated.timing(slideAnim, { toValue: 500, duration: 300, useNativeDriver: true }).start(() => setIncomingJob(null));
          supabase.removeChannel(channel);
          jobCancelSubRef.current = null;
        }
      })
      .subscribe();
    jobCancelSubRef.current = channel;
  }, [slideAnim, handleReject, playJobAlertSound, stopJobAlertSound]);

  const subscribeToOffers = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return () => {};

    const channels: any[] = [];

    // 1. Listen for Job Offers via Supabase Realtime
    const offerChannel = supabase.channel(`provider-offers-${user.id}`).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'job_offers', filter: `provider_id=eq.${user.id}`,
    }, (payload) => {
      const offer = payload.new as any;
      if (offer.status === 'pending') showIncomingJob(offer);
    }).subscribe();
    channels.push(offerChannel);

    // 2. High-speed WebSocket backup for instant popups
    let socket: any = null;
    socketService.getSocket().then(s => {
      socket = s;
      socket.on('job:new_offer', (data: any) => {
        if (data.offer) showIncomingJob(data.offer);
      });
    }).catch(err => console.warn('Socket connection failed, relying on Realtime backup'));

    // 3. Listen for Verification Status Changes
    const verifyChannel = supabase.channel(`verification-status-${user.id}`).on('postgres_changes', {
        event: 'UPDATE', 
        schema: 'public', 
        table: 'provider_details', 
        filter: `provider_id=eq.${user.id}`
    }, (payload) => {
        const oldStatus = (payload.old as any)?.verification_status;
        const newStatus = (payload.new as any).verification_status;

        if (oldStatus !== 'verified' && newStatus === 'verified') {
            setShowSuccessModal(true);
            localCache.get<any>('provider:stats').then(cached => {
                if (cached) {
                    localCache.set('provider:stats', { ...cached, verificationStatus: 'verified' }, 300);
                }
            });
            loadStats();
            safeScheduleNotification({
                content: {
                    title: "Status Approved! 🎉",
                    body: "Your Workla profile is verified. You can now go online to take jobs!",
                    sound: true,
                },
                trigger: null,
            });
        }
    }).subscribe();
    channels.push(verifyChannel);

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
      if (socket) socket.off('job:new_offer');
    };
  }, [showIncomingJob, loadStats]);

  useEffect(() => { 
    loadStats(); 
    let cleanup: any = null;
    subscribeToOffers().then(c => cleanup = c); 
    return () => { if (cleanup) cleanup(); };
  }, [loadStats, subscribeToOffers]);

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
    if (toggling) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setToggling(true);

    // ── Optimized: Silent fresh check if cache says unverified ──
    let status = (await localCache.get<any>('provider:stats'))?.verificationStatus;
    
    if (status === 'unverified' || !status) {
        // Force a fresh check from server to bypass stale 5-min cache
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
            const { data: sp } = await supabase.from('provider_details').select('verification_status').eq('provider_id', userData.user.id).single();
            status = sp?.verification_status;
            // Update cache immediately if it was stale
            if (status) {
                const cur = await localCache.get<any>('provider:stats') || {};
                localCache.set('provider:stats', { ...cur, verificationStatus: status }, 300);
            }
        }
    }

    if (status === 'unverified') {
        Alert.alert('Action Required', 'Please complete your KYC and bank details to go online.', [
            { text: 'Cancel', style: 'cancel', onPress: () => setToggling(false) },
            { text: 'Complete KYC', onPress: () => { setToggling(false); router.push('/kyc' as any); } }
        ]);
        return;
    }

    if (status === 'pending') {
        Alert.alert('Under Review', 'Your KYC documents are currently being reviewed by our Admin team. You will be able to go online once approved.');
        setToggling(false);
        return;
    }

    if (status === 'rejected' || status === 'suspended' || status === 'reverify') {
        Alert.alert('Action Required', 'Your profile is currently suspended or rejected. Please contact support.');
        setToggling(false);
        return;
    }

    const newVal = !isOnline;

    // ⚡ Optimistic: flip toggle INSTANTLY — feels responsive on first press
    setIsOnline(newVal);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsOnline(!newVal); return; } // rollback if no user

      const res = await api.patch('/api/v1/providers/online', { is_online: newVal });
      if (!res.data?.success) {
        setIsOnline(!newVal); // rollback on failure
        throw new Error('Failed to update status. Please try again.');
      }

      // ✅ Persist new status permanently so next cold-start shows correct state
      await localCache.set('provider:isOnline', newVal, 86400); // 24h TTL

      if (newVal) startLocationTracking(user.id); else stopLocationTracking();
    } catch (e: any) { Alert.alert('Error', e.message); }
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
            <VerificationSuccessModal 
                visible={showSuccessModal} 
                onClose={() => setShowSuccessModal(false)} 
            />
            <StatsRow todayEarnings={todayEarnings} todayJobs={todayJobs} rating={rating} />

            {incompleteProfile && (
              <TouchableOpacity style={styles.kycCard} onPress={() => router.push('/kyc' as any)} activeOpacity={0.9}>
                <View style={styles.kycIconWrap}><AlertTriangle size={20} color="#FFF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kycTitle}>Action Required</Text>
                  <Text style={styles.kycSub}>
                    {incompleteProfile.type === 'both' ? 'Complete KYC & add bank details' :
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

      <IncomingJobModal
        incomingJob={incomingJob} countdown={countdown} slideAnim={slideAnim}
        onAccept={handleAccept} onReject={handleReject}
      />
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
  activeJobWidget: {},
});
