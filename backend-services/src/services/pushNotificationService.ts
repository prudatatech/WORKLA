import fetch from 'node-fetch';

/**
 * PushNotificationService
 * 
 * Handles delivery of remote notifications to mobile devices via Expo's Push API.
 * Standardizes the "Always On" experience for providers.
 */
export class PushNotificationService {
    private static EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

    /**
     * Sends a push notification to a specific user's device.
     */
    static async sendNotification(
        expoPushToken: string,
        title: string,
        body: string,
        data: Record<string, any> = {},
        sound: string = 'default'
    ) {
        if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
            console.warn(`[PushService ⚠️] Invalid or missing Expo Push Token: ${expoPushToken}`);
            return false;
        }

        const message = {
            to: expoPushToken,
            sound,
            title,
            body,
            data,
            priority: 'high',
            channelId: 'default',
        };

        try {
            const response = await fetch(this.EXPO_PUSH_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });

            const result = await response.json();

            if (!response.ok) {
                console.error(`[PushService ❌] Expo API error:`, result);
                return false;
            }

            console.warn(`[PushService ✅] Notification sent successfully to token ${expoPushToken.substring(0, 20)}...`);
            return true;
        } catch (error: any) {
            console.error(`[PushService ❌] Failed to fetch Expo Push API:`, error.message);
            return false;
        }
    }

    /**
     * Sends the same notification to multiple tokens (batching).
     */
    static async sendBatchNotifications(
        tokens: string[],
        title: string,
        body: string,
        data: Record<string, any> = {}
    ) {
        const validTokens = tokens.filter(t => t && t.startsWith('ExponentPushToken'));
        if (validTokens.length === 0) return 0;

        const messages = validTokens.map(token => ({
            to: token,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high'
        }));

        try {
            const response = await fetch(this.EXPO_PUSH_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(messages),
            });

            if (!response.ok) {
                console.error(`[PushService ❌] Expo Batch API error:`, await response.text());
                return 0;
            }

            return validTokens.length;
        } catch (error: any) {
            console.error(`[PushService ❌] Failed to send Batch Push:`, error.message);
            return 0;
        }
    }
}
