import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = '@workla:offline_queue';

interface QueuedAction {
    id: string;
    type: 'UPDATE_BOOKING_STATUS';
    payload: any;
    timestamp: number;
}

/**
 * Adds an action to the local sync queue to be processed later
 */
export async function enqueueAction(type: QueuedAction['type'], payload: any) {
    try {
        const stored = await AsyncStorage.getItem(QUEUE_KEY);
        const queue: QueuedAction[] = stored ? JSON.parse(stored) : [];
        
        queue.push({
            id: `action_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type,
            payload,
            timestamp: Date.now(),
        });

        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        console.log(`[SyncQueue] Added action offline: ${type}`);
    } catch (e) {
        console.error('[SyncQueue] Failed to enqueue action', e);
    }
}

/**
 * Processes all actions in the local sync queue sequentially
 */
export async function processSyncQueue() {
    try {
        const stored = await AsyncStorage.getItem(QUEUE_KEY);
        if (!stored) return;

        let queue: QueuedAction[] = JSON.parse(stored);
        if (queue.length === 0) return;

        console.log(`[SyncQueue] Processing ${queue.length} queued offline actions...`);

        const failedQueue: QueuedAction[] = [];

        for (const action of queue) {
            let success = false;
            try {
                if (action.type === 'UPDATE_BOOKING_STATUS') {
                    const { bookingId, status } = action.payload;
                    const { error } = await supabase
                        .from('bookings')
                        .update({ status })
                        .eq('id', bookingId);
                    
                    if (!error) success = true;
                }
            } catch (err) {
                console.error(`[SyncQueue] Action ${action.id} failed during sync`, err);
            }

            if (!success) {
                // Put it back in the queue to try later
                failedQueue.push(action);
            }
        }

        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedQueue));

        if (failedQueue.length === 0) {
            console.log('[SyncQueue] All offline actions synced successfully!');
        } else {
            console.log(`[SyncQueue] ${failedQueue.length} actions failed to sync, kept in queue.`);
        }
    } catch (e) {
        console.error('[SyncQueue] Error processing sync queue', e);
    }
}
