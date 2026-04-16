import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

const getNotifications = () => {
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
