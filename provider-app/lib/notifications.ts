import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

const IS_EXPO_GO_ANDROID = () => {
    try {
        const { ExecutionEnvironment } = require('expo-constants');
        const { Platform } = require('react-native');
        return Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android';
    } catch { return false; }
};

const getNotifications = () => {
    // 🛡️ Never load expo-notifications in Expo Go on Android — it throws
    if (IS_EXPO_GO_ANDROID()) return null;
    try {
        return require('expo-notifications');
    } catch {
        return null;
    }
};

/**
 * 🛠️ Safe Notifications Utility
 * 
 * As of Expo SDK 53/54, Push Notifications (remote) are removed from Expo Go on Android.
 * This utility checks the environment to prevent the "Android Push notifications removed" 
 * error from crashing the app while allowing local notifications to function where possible.
 */

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const isAndroid = Platform.OS === 'android';

// 🛡️ Determine if it's safe to use Notification features that might trigger push-related checks
export const IS_NOTIFICATIONS_SAFE = !(isExpoGo && isAndroid);

/**
 * 🔔 Setup Android Notification Channels
 * Must be called once on app launch. Creates the high-priority
 * 'job-alerts' channel used for incoming job ringtone alerts.
 */
export const setupNotificationChannels = async () => {
    if (Platform.OS !== 'android') return;
    const Notifications = getNotifications();
    if (!Notifications) return;

    try {
        // HIGH PRIORITY channel for incoming job alerts — bypasses DnD
        await Notifications.setNotificationChannelAsync('job-alerts', {
            name: 'Incoming Job Alerts',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'job_alert.mp3',
            vibrationPattern: [0, 500, 300, 500, 300, 500],
            lightColor: '#1A3FFF',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: true,
            showBadge: true,
            enableLights: true,
            enableVibrate: true,
        });

        // Lower priority channel for informational alerts
        await Notifications.setNotificationChannelAsync('default', {
            name: 'General Notifications',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: 'default',
        });

        console.warn('[Notifications] ✅ Notification channels configured');
    } catch (e) {
        console.error('[Notifications] Failed to set up channels:', e);
    }
};

export const safeRequestPermissions = async () => {
    if (!IS_NOTIFICATIONS_SAFE) {
        console.warn('[Notifications] 🚫 Skipping permission request in Expo Go (Android). Push is unsupported here.');
        return { status: 'denied' };
    }
    const Notifications = getNotifications();
    if (!Notifications) return { status: 'error' };
    try {
        return await Notifications.requestPermissionsAsync();
    } catch (e) {
        console.error('[Notifications] Failed to request permissions:', e);
        return { status: 'error' };
    }
};

export const safeSetNotificationHandler = (config: any) => {
    if (!IS_NOTIFICATIONS_SAFE) return;
    const Notifications = getNotifications();
    if (!Notifications) return;
    try {
        Notifications.setNotificationHandler(config);
    } catch (e) {
        console.warn('[Notifications] Failed to set handler:', e);
    }
};

export const safeScheduleNotification = async (request: any) => {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    if (isExpoGo && isAndroid) {
        try {
            return await Notifications.scheduleNotificationAsync(request);
        } catch (e) {
            console.warn('[Notifications] 🚫 scheduleNotification failed in Expo Go:', e);
            return null;
        }
    }
    return await Notifications.scheduleNotificationAsync(request);
};

/**
 * 🚀 Get Expo Push Token
 * Fetches the unique token needed to send remote push notifications.
 */
export const getPushTokenAsync = async () => {
    if (!IS_NOTIFICATIONS_SAFE) {
        console.warn('[Notifications] 🚫 Push tokens are not supported in Expo Go (Android).');
        return null;
    }

    const Notifications = getNotifications();
    if (!Notifications) return null;

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.warn('[Notifications] Failed to get push token: Permission not granted');
            return null;
        }

        const token = (await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId || Constants.expoConfig?.owner // Use project ID from config
        })).data;

        console.warn('[Notifications] ✅ Expo Push Token retrieved:', token.substring(0, 15) + '...');
        return token;
    } catch (error: any) {
        console.error('[Notifications] Error getting push token:', error.message);
        return null;
    }
};
