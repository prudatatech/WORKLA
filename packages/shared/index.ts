/**
 * @workla/shared — Barrel Export
 * 
 * Single entry point for all shared utilities and types.
 * 
 * Usage in apps:
 *   import { createApiClient, createSocketService } from '../../packages/shared';
 *   import type { Booking, User } from '../../packages/shared';
 */

export { createApiClient } from './lib/api';
export type { ApiResponse } from './lib/api';

export { SocketService, createSocketService } from './lib/socket';

export type {
    User,
    Service,
    SubService,
    Booking,
    BookingStatus,
    Address,
    Provider,
    Review,
    Notification,
    ChatMessage,
    WalletTransaction,
} from './types';
