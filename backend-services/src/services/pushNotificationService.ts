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
     * 🔔 Send high-priority job alert (used for incoming job requests).
     * Uses the 'job-alerts' Android channel which bypasses DnD and plays the custom ringtone.
     * This is required for "killed app" wake-up behavior.
     */
    static async sendJobAlert(
        expoPushToken: string,
        title: string,
        body: string,
        data: Record<string, any> = {}
    ) {
        if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
            console.warn(`[PushService ⚠️] Invalid or missing Expo Push Token: ${expoPushToken}`);
            return false;
        }

        const message = {
            to: expoPushToken,
            sound: 'job_alert.mp3', // Bundled custom ringtone
            title,
            body,
            data,
            priority: 'high',
            channelId: 'job-alerts', // High-priority Android channel (bypassDnd = true)
            ttl: 60,                  // Only deliver within 60 seconds (stale = useless)
            expiration: Math.floor(Date.now() / 1000) + 60,
            badge: 1,
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
                console.error(`[PushService ❌] Job Alert API error:`, result);
                return false;
            }

            console.warn(`[PushService 🔔] Job alert sent to ${expoPushToken.substring(0, 20)}...`);
            return true;
        } catch (error: any) {
            console.error(`[PushService ❌] Failed to send job alert:`, error.message);
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
