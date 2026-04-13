import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Buffer } from 'buffer';

// Fix for react-native-svg / lucide-react-native buffer dependency
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
import NetworkBanner from '../components/NetworkBanner';
import InAppToast from '../components/InAppToast';
import LoadingScreen from '../components/LoadingScreen';
import { supabase } from '../lib/supabase';
import { socketService } from '../lib/socket';

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
export default function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; title: string; body: string; type: 'info' | 'success' | 'warning' | 'error' }>({
    visible: false, title: '', body: '', type: 'info'
  });
  const router = useRouter();
  const segments = useSegments();
  
  // 🛡️ Track app state and realtime channel reference
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const channelRef = useRef<any>(null);

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

    const inAuthGroup = segments[0] === 'auth' || segments[0] === 'index' || segments[0] === 'onboarding' || segments[0] === undefined;

    if (session && inAuthGroup) {
      // User is logged in but on a non-authenticated screen — redirect to home
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

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
  }, [session]);

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
  const subscribeToNotifications = (userId: string) => {
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
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    
    subscribeToNotifications(session.user.id);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [session]);

  const showToast = (title: string, body: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ visible: true, title, body, type });
  };

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
        onDismiss={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </>
  );
}
