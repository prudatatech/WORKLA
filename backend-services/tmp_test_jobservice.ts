
import { JobService } from './src/services/jobService';
import { pino } from 'pino';
import * as dotenv from 'dotenv';
dotenv.config();

const logger = pino();

async function testJobService() {
    const bookingId = 'bc7c2350-16ad-4aa0-8f7d-1c0a258796cd';
    const userId = '14900651-067f-4b5c-82a7-f63c3932c4a9'; // Assigned provider
    const newStatus = 'completed';

    console.log(`[Test] Calling JobService.updateBookingStatus for ${bookingId} to ${newStatus}`);
    
    try {
        const result = await JobService.updateBookingStatus(
            bookingId,
            newStatus,
            userId,
            logger as any
        );
        console.log('[Test] Success:', JSON.stringify(result, null, 2));
    } catch (err: any) {
        console.error('[Test] Caught Error:', JSON.stringify(err, null, 2));
    }
}

testJobService();
