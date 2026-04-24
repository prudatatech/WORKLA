import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.warn('[Notifications] expo-notifications module unavailable in this environment.');
}

/**
 * Handles Push Notification registration and persistence
 */
export async function registerForPushNotificationsAsync() {
  if (!Notifications) {
    console.warn('[Notifications] Cannot register, expo-notifications is not loaded.');
    return null;
  }
  
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
      // ⚠️ Expo Go SDK 53+ does not support push tokens on Android
      if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
         console.warn('[Notifications] Push tokens are NOT supported in Expo Go on Android. Use a Development Build.');
      } else {
         console.error('[Notifications] Error getting token:', e.message);
      }
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

        if (error) {
           // Specifically detect the missing column error to provide better feedback
           if (error.message?.includes('column') && error.message?.includes('expo_push_token')) {
              console.error('[Notifications] DATABASE SCHEMA MISMATCH: The "expo_push_token" column is missing from "profiles" table.');
           } else {
              throw error;
           }
        } else {
          console.log('[Notifications] Token successfully synced with backend.');
        }
      }
    } catch (err: any) {
      console.error('[Notifications] Failed to sync token with backend:', err.message);
    }
  }

  return token;
}
