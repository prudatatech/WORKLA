import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Utility for consistent haptic feedback across the app.
 * Fails gracefully on web and disabled devices.
 */
export const haptic = {
    light: () => {
        if (Platform.OS === 'web') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    medium: () => {
        if (Platform.OS === 'web') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    heavy: () => {
        if (Platform.OS === 'web') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    },
    selection: () => {
        if (Platform.OS === 'web') return;
        Haptics.selectionAsync();
    },
    success: () => {
        if (Platform.OS === 'web') return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    warning: () => {
        if (Platform.OS === 'web') return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
    error: () => {
        if (Platform.OS === 'web') return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
};
