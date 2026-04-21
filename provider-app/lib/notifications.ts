import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Handles Push Notification registration and persistence
 */
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });

    // High importance channel for Job Alerts
    await Notifications.setNotificationChannelAsync('job-alerts', {
      name: 'Job Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#1A3FFF',
      lockscreenVisibility: 1, // PUBLIC
      showBadge: true,
      enableVibration: true,
      sound: 'default' 
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Permission NOT granted');
      return;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) {
        console.warn('[Notifications] No EAS Project ID found. Push initialization may fail.');
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId
      })).data;
    } catch (e: any) {
      console.error('[Notifications] Error getting token:', e.message);
    }

  } else {
    console.log('[Notifications] Physical device required for Push');
  }

  if (token) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('profiles')
          .update({ expo_push_token: token })
          .eq('id', user.id);

        if (error) throw error;
        console.log('[Notifications] Token saved to profile.');
      }
    } catch (err: any) {
      console.error('[Notifications] Failed to sync token with backend:', err.message);
    }
  }

  return token;
}
