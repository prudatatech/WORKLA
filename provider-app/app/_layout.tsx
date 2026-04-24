import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as TaskManager from 'expo-task-manager';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import 'react-native-reanimated';
import { supabase } from '../lib/supabase';
import { socketService } from '../lib/socket';
import NetworkBanner from '../components/NetworkBanner';
import InAppToast from '../components/InAppToast';
import IncomingJobModal from '../components/jobs/IncomingJobModal';
import LoadingScreen from '../components/LoadingScreen';
import { api } from '../lib/api';
import { localCache } from '../lib/localCache';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { useAlertSystem } from '../hooks/useAlertSystem';
import * as Notifications from 'expo-notifications';

// Handle notifications in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

import { useColorScheme } from '@/hooks/use-color-scheme';

const LOCATION_TASK_NAME = 'BACKGROUND_LOCATION_TASK';

// Background Location Task Definition
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Location Tracking Error:', error);
    return;
  }
  if (data) {
    const { locations } = data as any;
    const loc = locations[0];
    if (loc) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: provider } = await supabase.from('provider_details').select('is_online').eq('provider_id', user.id).single();
          if (!provider?.is_online) return;

          await supabase.from('provider_locations').upsert({
            provider_id: user.id,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            heading: loc.coords.heading,
            recorded_at: new Date().toISOString(),
          }, { onConflict: 'provider_id' });

          const channel = supabase.channel('live_locations');
          await channel.send({
            type: 'broadcast',
            event: 'LOCATION_UPDATE',
            payload: {
              provider_id: user.id,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              recorded_at: new Date().toISOString(),
            }
          });
        }
      } catch (e) {
        console.error('Failed to sync location:', e);
      }
    }
  }
});

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Normalize incoming job data from ANY source (socket, realtime, trigger)
 * into a consistent shape for the IncomingJobModal.
 */
function normalizeJobData(raw: any) {
  return {
    bookingId: raw.bookingId || raw.booking_id || raw.id,
    offerId:   raw.offerId   || raw.offer_id,
    service:   raw.service   || raw.serviceName || raw.service_name || 'Service Request',
    serviceName: raw.serviceName || raw.service || raw.service_name || 'Service Request',
    address:   raw.address   || raw.customer_address || 'Nearby Location',
    amount:    raw.amount    || raw.total_amount || raw.estimatedPrice || 0,
    customerName: raw.customerName || raw.customer_name || '',
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<any>(null);
  const segments = useSegments();
  const router = useRouter();
  const [incomingJob, setIncomingJob] = useState<any>(null);
  const [toast, setToast] = useState<{ visible: boolean; title: string; body: string; type: 'info' | 'success' | 'warning' | 'error' }>({
    visible: false, title: '', body: '', type: 'info'
  });

  const { startAlert, stopAlert } = useAlertSystem();
  // Ref to prevent duplicate processing of same event
  const processingJobRef = useRef<string | null>(null);

  const showToast = useCallback((title: string, body: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ visible: true, title, body, type });
  }, []);

  const handleDismissToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  /**
   * Central handler for incoming job — prevents duplicate triggers
   * and fires all alerts atomically.
   */
  const triggerIncomingJob = useCallback((rawData: any, source: string) => {
    const jobData = normalizeJobData(rawData);
    const dedupeKey = jobData.bookingId || jobData.offerId;

    if (!dedupeKey) {
      console.warn(`[IncomingJob][${source}] Skipped — no bookingId/offerId in payload`, rawData);
      return;
    }
    if (processingJobRef.current === dedupeKey) {
      console.log(`[IncomingJob][${source}] Deduplicated — already showing ${dedupeKey}`);
      return;
    }

    console.log(`[IncomingJob][${source}] ✅ Triggering popup for booking ${dedupeKey}`);
    processingJobRef.current = dedupeKey;

    // 1. Schedule system push notification
    Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 New Job Alert!',
        body: `${jobData.serviceName} — ₹${jobData.amount}`,
        data: jobData,
        sound: 'default',
      },
      trigger: null,
    }).catch(e => console.error('[Notifications] Failed to schedule:', e));

    // 2. Start vibration + sound
    startAlert();

    // 3. Show modal
    setIncomingJob(jobData);
  }, [startAlert]);

  // 1. Session & Auth Monitoring
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('[AUTH] Initializing session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[AUTH ERROR] Session fetch failed:', error.message);
          if (error.message?.includes('Refresh Token') || (error as any).status === 400) {
            console.warn('[AUTH] Corrupted session detected, signing out...');
            await supabase.auth.signOut();
            setSession(null);
          }
        } else {
          setSession(session);
        }
      } catch (err: any) {
        console.error('[AUTH CRITICAL] Uncaught session error:', err);
        await supabase.auth.signOut();
      } finally {
        setInitialized(true);
        SplashScreen.hideAsync();
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log(`[AUTH STATE CHANGE] ${_event}`);
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Navigation & Onboarding Control
  useEffect(() => {
    if (!initialized) return;

    const inOnboarding = segments[0] === 'onboarding';
    const isResetting = (segments[0] as string) === 'reset-password';
    const isIndex = !segments[0];

    if (!session) {
      if (!isIndex && !isResetting) router.replace('/');
    } else {
      const checkOnboarding = async () => {
        try {
          const cacheKey = `onboarding:${session.user.id}`;
          const cachedOnboarding = await localCache.get<boolean>(cacheKey);
          
          if (cachedOnboarding) {
            if (isIndex || inOnboarding) router.replace('/(tabs)');
          }

          const { data } = await supabase
            .from('provider_details')
            .select('onboarding_completed')
            .eq('provider_id', session.user.id)
            .single();

          if (data?.onboarding_completed) {
            await localCache.set(cacheKey, true, 86400);
            if (isIndex || inOnboarding) router.replace('/(tabs)');
          } else {
            if (!inOnboarding) router.replace('/onboarding');
          }
        } catch (e) {
          console.error('Onboarding check failed:', e);
          if (!inOnboarding) router.replace('/onboarding');
        }
      };
      
      checkOnboarding();
      registerForPushNotificationsAsync();
    }
  }, [session, initialized, segments]);

  // 3. Socket.io Notification Handler
  // Uses a cleanup function to remove listener and prevent duplicates.
  useEffect(() => {
    if (!session) {
      socketService.disconnect();
      return;
    }

    let mounted = true;
    let socket: any = null;

    const handler = (payload: any) => {
      if (!mounted) return;
      console.log('[Socket] 🔔 notification:alert received:', JSON.stringify(payload));
      const type = (payload.type || '').toLowerCase();
      if (type === 'new_job') {
        triggerIncomingJob(payload.data, 'socket');
      } else {
        showToast(payload.title || 'Notification', payload.body || '', 'info');
      }
    };

    const setupSocket = async () => {
      try {
        socket = await socketService.getSocket();
        // Remove any stale listener before adding fresh one
        socket.off('notification:alert', handler);
        socket.on('notification:alert', handler);
        console.log('[Socket] ✅ notification:alert listener registered');
      } catch (e) {
        console.error('[Socket] Setup failed:', e);
      }
    };

    setupSocket();

    return () => {
      mounted = false;
      if (socket) {
        socket.off('notification:alert', handler);
        console.log('[Socket] 🔌 notification:alert listener removed');
      }
    };
  }, [session, triggerIncomingJob, showToast]);

  // 4. Supabase Realtime: listen for new notification rows
  // Handles BOTH 'new_job' (from booking.ts insert) AND 'job_offer' (from DB trigger).
  useEffect(() => {
    if (!session?.user?.id) return;

    console.log('[Realtime] Subscribing to notifications for user:', session.user.id);

    const channel = supabase
      .channel(`provider-notifications-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload: any) => {
        console.log('[Realtime] 📩 New notification row:', JSON.stringify(payload.new));
        const notif = payload.new;
        if (!notif) return;

        // Parse data JSONB — may arrive as string or object
        const jobData = typeof notif.data === 'string'
          ? (() => { try { return JSON.parse(notif.data); } catch { return {}; } })()
          : (notif.data || {});

        // Accept both 'new_job' and 'job_offer' types from any source
        const notifType = (notif.type || '').toLowerCase();
        const dataType  = (jobData.type || '').toLowerCase();

        if (notifType === 'new_job' || dataType === 'new_job' || notifType === 'job_offer') {
          console.log('[Realtime] ✅ Job notification detected — triggering popup');
          triggerIncomingJob(jobData, 'realtime');
        } else {
          showToast(notif.title || 'Notification', notif.body || '', 'info');
        }
      })
      .subscribe((status) => {
        console.log('[Realtime:notifications] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, triggerIncomingJob, showToast]);

  // 5. BACKUP: Listen directly on job_offers INSERT (most reliable popup trigger)
  // This fires even if notifications table realtime publication is not enabled.
  useEffect(() => {
    if (!session?.user?.id) return;

    const offersChannel = supabase
      .channel(`provider-offers-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_offers',
        filter: `provider_id=eq.${session.user.id}`,
      }, async (payload: any) => {
        console.log('[Realtime:offers] 🆕 New job offer:', JSON.stringify(payload.new));
        const offer = payload.new;
        if (!offer || offer.status !== 'pending') return;

        // Fetch booking details for rich popup
        try {
          const { data: booking } = await supabase
            .from('bookings')
            .select('id, service_name_snapshot, customer_address, total_amount')
            .eq('id', offer.booking_id)
            .single();

          triggerIncomingJob({
            bookingId: offer.booking_id,
            offerId:   offer.id,
            serviceName: booking?.service_name_snapshot || 'Service Request',
            service:     booking?.service_name_snapshot || 'Service Request',
            address:     booking?.customer_address || 'Nearby Location',
            amount:      booking?.total_amount || 0,
            type:        'new_job',
          }, 'offers-realtime');
        } catch (e) {
          // Fallback: trigger with basic data
          triggerIncomingJob({
            bookingId: offer.booking_id,
            offerId:   offer.id,
            type:      'new_job',
          }, 'offers-realtime-fallback');
        }
      })
      .subscribe((status) => {
        console.log('[Realtime:offers] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(offersChannel);
    };
  }, [session?.user?.id, triggerIncomingJob]);

  if (!initialized) return <LoadingScreen />;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <NetworkBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="reset-password" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="payouts" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="services" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="auto" />

      <IncomingJobModal 
        visible={!!incomingJob} 
        jobData={incomingJob} 
        onClose={() => {
          stopAlert();
          setIncomingJob(null);
          processingJobRef.current = null;
        }} 
        onAccept={async (bookingId) => {
          try {
            const offerId = incomingJob?.offerId;
            if (!offerId) throw new Error('No offer ID found. Cannot accept.');
            const res = await api.post(`/api/v1/job-offers/${offerId}/accept`, {});
            if (res.error) throw new Error(res.error);
            stopAlert();
            setIncomingJob(null);
            processingJobRef.current = null;
            router.push('/(tabs)/jobs');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }}
        onReject={() => {
            stopAlert();
            setIncomingJob(null);
            processingJobRef.current = null;
        }}
      />

      <InAppToast
        visible={toast.visible}
        title={toast.title}
        body={toast.body}
        type={toast.type}
        onDismiss={handleDismissToast}
      />
    </ThemeProvider>
  );
}
