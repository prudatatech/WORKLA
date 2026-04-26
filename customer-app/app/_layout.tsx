import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, AppStateStatus, Dimensions, Image, Platform, StyleSheet, View } from 'react-native';
import { Svg, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import NetworkBanner from '../components/NetworkBanner';
import InAppToast from '../components/InAppToast';
import LoadingScreen from '../components/LoadingScreen';
import { supabase } from '../lib/supabase';
import { socketService } from '../lib/socket';
import { api } from '../lib/api';

// 🛡️ Safe notification loader — never loads in Expo Go on Android (SDK 53+)
const IS_EXPO_GO_ANDROID =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android';

const getNotifications = () => {
  if (IS_EXPO_GO_ANDROID) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch { return null; }
};

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

/**
 * Root Layout for Customer App
 * Features:
 * 1. Session management with auto-redirect for logged-in users.
 * 2. Supabase Realtime notification listener (replaces Expo Push).
 * 3. Socket.io real-time alerts with in-app toast.
 * 4. Network status monitoring.
 * 5. 🛡️ AppState-aware lifecycle — pauses realtime/socket in background
 *    to prevent Android OOM kills (like Zomato/Uber pattern).
 */

const { width } = Dimensions.get('window');
let hasShownAppSplash = false;

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export default function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; title: string; body: string; type: 'info' | 'success' | 'warning' | 'error' }>({
    visible: false, title: '', body: '', type: 'info'
  });
  const router = useRouter();
  const segments = useSegments();
  const notifResponseRef = useRef<any>(null);

  // 🛡️ Track app state and realtime channel reference
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const channelRef = useRef<any>(null);

  // 🎬 Animated Splash State
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashScale = useRef(new Animated.Value(0.9)).current;
  const splashRotateY = useRef(new Animated.Value(0)).current;
  const splashShimmer = useRef(new Animated.Value(-1)).current;
  const splashSpotlight = useRef(new Animated.Value(0.65)).current;
  const [showAppSplash, setShowAppSplash] = useState(!hasShownAppSplash);

  // 🔔 Setup push notifications on mount
  useEffect(() => {
    const Notifs = getNotifications();
    if (!Notifs) return; // Expo Go on Android — skip silently

    (async () => {
      // 1. Set notification handler
      Notifs.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // 2. Setup Android notification channel
      if (Platform.OS === 'android') {
        await Notifs.setNotificationChannelAsync('booking-updates', {
          name: 'Booking Updates',
          importance: Notifs.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1A3FFF',
          lockscreenVisibility: Notifs.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
        });
      }

      // 3. Request permissions
      const { status: existing } = await Notifs.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifs.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return;

      // 4. Register push token with backend
      try {
        const token = (await Notifs.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })).data;
        if (token) {
          await api.patch('/api/v1/users/push-token', { token });
          console.log('[Customer] ✅ Push token registered');
        }
      } catch (e) {
        console.warn('[Customer] Push token registration failed:', e);
      }
    })();

    // 5. Tap listener: navigate to booking when notification is tapped
    notifResponseRef.current = Notifs.addNotificationResponseReceivedListener((response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.bookingId) {
        router.push(`/track/${data.bookingId}` as any);
      }
    });

    return () => {
      if (notifResponseRef.current) Notifs.removeNotificationSubscription(notifResponseRef.current);
    };
  }, [router]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
      } finally {
        setInitialized(true);
        SplashScreen.hideAsync();
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-redirect: if user has a valid session and is on the landing/auth screens,
  // send them straight to the home tabs.
  useEffect(() => {
    if (!initialized) return;

    const rootSegment = segments[0] as string;
    const inAuthGroup = rootSegment === 'auth' || rootSegment === 'index' || rootSegment === 'onboarding' || rootSegment === undefined;

    if (session && inAuthGroup) {
      // User is logged in but on a non-authenticated screen — redirect to home
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments, router]);

  // 🛡️ AppState lifecycle: pause/resume realtime when app backgrounds/foregrounds
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState.match(/active/) && nextState.match(/inactive|background/)) {
        // === GOING TO BACKGROUND ===
        // Unsubscribe realtime channels to free resources
        console.log('[Lifecycle] App backgrounded — pausing realtime channels');
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      } else if (prevState.match(/inactive|background/) && nextState === 'active') {
        // === RETURNING TO FOREGROUND ===
        console.log('[Lifecycle] App foregrounded — resuming realtime channels');
        if (session?.user?.id) {
          subscribeToNotifications(session.user.id);
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket.io real-time alerts — uses the AppState-aware socketService
  useEffect(() => {
    if (!session) {
      socketService.disconnect();
      return;
    }

    const handler = (payload: any) => {
      // Only show toasts when app is in foreground
      if (appStateRef.current === 'active') {
        showToast(payload.title || 'Workla Update', payload.body, 'info');
      }
    };

    const setupSocket = async () => {
      await socketService.getSocket();
      socketService.addListener('notification:alert', handler);
    };

    setupSocket();

    return () => {
      socketService.removeListener('notification:alert', handler);
    };
  }, [session]);

  // Supabase Realtime: listen for new rows in `notifications` table
  const subscribeToNotifications = useCallback((userId: string) => {
    // Clean up any existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel('customer-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload: any) => {
        const notif = payload.new;
        if (notif && appStateRef.current === 'active') {
          const toastType = notif.type === 'booking_update' ? 'success' : 'info';
          showToast(notif.title, notif.body, toastType);
        }
      })
      .subscribe();

    channelRef.current = channel;
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    subscribeToNotifications(session.user.id);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [session, subscribeToNotifications]);

  const showToast = (title: string, body: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ visible: true, title, body, type });
  };

  const handleToastDismiss = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  // 🎬 Premium Splash Sequence
  useEffect(() => {
    if (hasShownAppSplash) {
      setShowAppSplash(false);
      return;
    }

    // Dramatic entrance + Shimmer sequence
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.spring(splashScale, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
        Animated.timing(splashOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(splashRotateY, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // 🛡️ Safety: Small delay to ensure native view is attached
      setTimeout(() => {
        // Start Breathing/Spotlight loop once entered
        Animated.loop(
          Animated.sequence([
            Animated.timing(splashSpotlight, { toValue: 1, duration: 2500, useNativeDriver: true }),
            Animated.timing(splashSpotlight, { toValue: 0, duration: 2500, useNativeDriver: true }),
          ])
        ).start();

        Animated.loop(
          Animated.sequence([
            Animated.timing(splashShimmer, { toValue: 1, duration: 1800, useNativeDriver: true }),
            Animated.delay(1200),
          ])
        ).start();
      }, 100);

      // Schedule the final exit
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(splashOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(splashScale, { toValue: 1.2, duration: 700, useNativeDriver: true }),
        ]).start(() => {
          setShowAppSplash(false);
          hasShownAppSplash = true;
        });
      }, 1800);
    });
  }, []);

  if (!initialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      <NetworkBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="location" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="auth" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="provider/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="track/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="rate/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="coupons" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="addresses" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="payment-history" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="workla-gold" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="wallet" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="referral" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      </Stack>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <InAppToast
        visible={toast.visible}
        title={toast.title}
        body={toast.body}
        type={toast.type}
        onDismiss={handleToastDismiss}
      />

      {/* 🎬 Premium Animated Splash Overlay */}
      {showAppSplash && (
        <Animated.View style={[styles.splashOverlay, { opacity: splashOpacity }]}>
          <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient
                id="grad1"
                cx="50%"
                cy="50%"
                rx="65%"
                ry="65%"
                fx="50%"
                fy="50%"
              >
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="0.6" stopColor="#F9F9FB" stopOpacity="1" />
                <Stop offset="1" stopColor="#E8E8ED" stopOpacity="1" />
              </RadialGradient>

              <RadialGradient
                id="grad2"
                cx="50%"
                cy="50%"
                rx="85%"
                ry="85%"
                fx="50%"
                fy="50%"
              >
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="0.75" stopColor="#F9F9FB" stopOpacity="1" />
                <Stop offset="1" stopColor="#E8E8ED" stopOpacity="1" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad1)" />
            <AnimatedRect x="0" y="0" width="100%" height="100%" fill="url(#grad2)" opacity={splashSpotlight as any} />
          </Svg>

          <Animated.View style={{
            transform: [
              { scale: splashScale },
              { rotateY: splashRotateY.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) },
            ],
            alignItems: 'center'
          }}>
            <Image
              source={require('../assets/images/Gemini_Generated_Image_l8vitul8vitul8vi.png')}
              style={styles.splashLogo}
              resizeMode="contain"
            />

            {/* Shimmer Sweep Layer */}
            <Animated.View style={[styles.shimmerOverlay, {
              transform: [{ translateX: splashShimmer.interpolate({ inputRange: [-1, 1], outputRange: [-200, 200] }) }]
            }]} />
          </Animated.View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogo: {
    width: width * 0.8,
    height: (width * 0.8) * 0.4,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ rotate: '25deg' }],
  },
});
