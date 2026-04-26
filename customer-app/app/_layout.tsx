import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState, AppStateStatus, Dimensions, Image, InteractionManager,
  Platform, StyleSheet, View
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence,
  withRepeat, withDelay, withSpring, runOnJS, Easing,
  ReduceMotion, cancelAnimation
} from 'react-native-reanimated';
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

const { width } = Dimensions.get('window');
let hasShownAppSplash = false;

export default function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean; title: string; body: string;
    type: 'info' | 'success' | 'warning' | 'error'
  }>({
    visible: false, title: '', body: '', type: 'info'
  });
  const router = useRouter();
  const segments = useSegments();
  const notifResponseRef = useRef<any>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const channelRef = useRef<any>(null);

  // 🎬 Clean animation values
  const logoScale = useSharedValue(0.9);
  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(20);
  const overlayOpacity = useSharedValue(1);
  const [showAppSplash, setShowAppSplash] = useState(!hasShownAppSplash);
  const animationStartedRef = useRef(false);

  // 🔔 Setup push notifications
  useEffect(() => {
    const Notifs = getNotifications();
    if (!Notifs) return;

    (async () => {
      Notifs.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

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

      const { status: existing } = await Notifs.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifs.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return;

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

  useEffect(() => {
    if (!initialized) return;

    const rootSegment = segments[0] as string;
    const inAuthGroup = rootSegment === 'auth' || rootSegment === 'index' ||
      rootSegment === 'onboarding' || rootSegment === undefined;

    if (session && inAuthGroup) {
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 0);
    }
  }, [session, initialized, segments, router]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState.match(/active/) && nextState.match(/inactive|background/)) {
        console.log('[Lifecycle] App backgrounded — pausing realtime channels');
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      } else if (prevState.match(/inactive|background/) && nextState === 'active') {
        console.log('[Lifecycle] App foregrounded — resuming realtime channels');
        if (session?.user?.id) {
          subscribeToNotifications(session.user.id);
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!session) {
      socketService.disconnect();
      return;
    }

    const handler = (payload: any) => {
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

  const subscribeToNotifications = useCallback((userId: string) => {
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

  const handleSplashComplete = useCallback(() => {
    setShowAppSplash(false);
    hasShownAppSplash = true;
  }, []);

  // 🎬 Clean, minimal animation - Like top companies
  useEffect(() => {
    if (!showAppSplash || animationStartedRef.current) return;
    animationStartedRef.current = true;

    const runAnimation = () => {
      'worklet';

      // ✨ Simple entrance: Scale up + Fade in
      logoOpacity.value = withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });

      logoScale.value = withSpring(1, {
        damping: 12,
        stiffness: 100,
        mass: 0.8,
      });

      logoTranslateY.value = withSpring(0, {
        damping: 15,
        stiffness: 120,
      });

      // 🎭 Smooth exit after 1.8 seconds
      setTimeout(() => {
        overlayOpacity.value = withTiming(0, {
          duration: 350,
          easing: Easing.out(Easing.cubic),
        }, () => {
          runOnJS(handleSplashComplete)();
        });

        logoScale.value = withTiming(0.95, {
          duration: 350,
          easing: Easing.in(Easing.cubic),
        });

        logoOpacity.value = withTiming(0, {
          duration: 300,
        });
      }, 1800);
    };

    InteractionManager.runAfterInteractions(runAnimation);

    return () => {
      cancelAnimation(logoScale);
      cancelAnimation(logoOpacity);
      cancelAnimation(logoTranslateY);
      cancelAnimation(overlayOpacity);
    };
  }, [showAppSplash]);

  // 🎨 Clean animated styles
  const animatedLogoStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateY: logoTranslateY.value },
        { scale: logoScale.value },
      ],
      opacity: logoOpacity.value,
    };
  });

  const animatedOverlayStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: overlayOpacity.value,
    };
  });

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

      {/* 🎬 Clean Minimal Splash Overlay */}
      {showAppSplash && (
        <Animated.View
          style={[styles.splashOverlay, animatedOverlayStyle]}
          renderToHardwareTextureAndroid
        >
          <Animated.View style={[styles.logoContainer, animatedLogoStyle]}>
            <Image
              source={require('../assets/images/Gemini_Generated_Image_l8vitul8vitul8vi.png')}
              style={styles.splashLogo}
              resizeMode="contain"
              fadeDuration={0}
            />
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
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: width * 0.65,
    height: (width * 0.65) * 0.4,
    maxWidth: 300,
    maxHeight: 120,
  },
});