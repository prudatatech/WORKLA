import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as TaskManager from 'expo-task-manager';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';

// Fix for react-native-svg / lucide-react-native buffer dependency
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
import 'react-native-reanimated';
import { supabase } from '../lib/supabase';
import { socketService } from '../lib/socket';
import NetworkBanner from '../components/NetworkBanner';
import InAppToast from '../components/InAppToast';
import IncomingJobModal from '../components/jobs/IncomingJobModal';
import LoadingScreen from '../components/LoadingScreen';
import { api } from '../lib/api';

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

  const showToast = useCallback((title: string, body: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ visible: true, title, body, type });
  }, []);

  // 1. Session & Auth Monitoring
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
      SplashScreen.hideAsync();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
          const { data } = await supabase
            .from('provider_details')
            .select('onboarding_completed')
            .eq('provider_id', session.user.id)
            .single();

          if (data?.onboarding_completed) {
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
    }
  }, [session, initialized, segments]);

  // 3. Socket.io Notification Handler
  useEffect(() => {
    if (!session) {
      socketService.disconnect();
      return;
    }

    const setupSocket = async () => {
      const socket = await socketService.getSocket();
      
      socket.on('notification:alert', (payload: any) => {
        console.log('🔔 Received Socket Alert:', payload);
        if (payload.type === 'NEW_JOB' || payload.type === 'new_job') {
          setIncomingJob(payload.data);
        } else {
          showToast(payload.title || 'Notification', payload.body, 'info');
        }
      });
    };

    setupSocket();
  }, [session, showToast]);

  // 4. Supabase Realtime: listen for new notification rows
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel('provider-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload: any) => {
        const notif = payload.new;
        if (notif) {
          if (notif.type === 'new_job') {
            setIncomingJob(notif.data);
          } else {
            showToast(notif.title, notif.body, 'success');
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session, showToast]);



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
        onClose={() => setIncomingJob(null)} 
        onAccept={async (bookingId) => {
          try {
            const res = await api.post(`/api/v1/job-offers/${incomingJob.offerId}/accept`, {});
            if (res.error) throw new Error(res.error);
            setIncomingJob(null);
            router.push('/(tabs)/jobs');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }}
      />

      <InAppToast
        visible={toast.visible}
        title={toast.title}
        body={toast.body}
        type={toast.type}
        onDismiss={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </ThemeProvider>
  );
}
