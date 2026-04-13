import { supabaseAdmin } from '../../lib/supabase';
import { getIO } from '../../socket';
import { EventBus } from '../bus';
import { ACTIVE_BOOKING_STATUSES } from '../../lib/constants';

/**
 * LocationWorker: Listens for 'provider.location_updated' events 
 * and broadcasts them via Socket.io to the relevant booking rooms.
 */
export async function startLocationWorker() {
    console.warn('🌍 Location Worker: Listening for GPS updates...');

    await EventBus.subscribe('provider.location_updated', async (payload: { providerId: string, latitude: number, longitude: number }, _headers, _topic) => {
        const io = getIO();
        if (!io) return;

        // 1. Identify active bookings for this provider
        // We only broadcast if the provider is currently "en_route" or "in_progress"
        const { data: activeBookings } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('provider_id', payload.providerId)
            .in('status', ACTIVE_BOOKING_STATUSES);

        if (!activeBookings || activeBookings.length === 0) return;

        // 2. Broadcast to each relevant booking room
        activeBookings.forEach(booking => {
            const roomName = `booking:${booking.id}`;
            io.to(roomName).emit('location:update', {
                provider_id: payload.providerId,
                latitude: payload.latitude,
                longitude: payload.longitude,
                recorded_at: new Date().toISOString()
            });
        });
    }, 'workla-location-worker');
}
