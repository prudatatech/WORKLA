/**
 * Shared booking status constants to ensure consistency across routes and workers.
 */

export const ACTIVE_BOOKING_STATUSES = [
    'requested',
    'searching',
    'confirmed',
    'en_route',
    'arrived',
    'in_progress',
    'disputed'
];

/**
 * Strict state machine for booking status transitions.
 * Ensures data integrity by only allowing logical flow.
 */
export const BOOKING_STATUS_FLOW: Record<string, string[]> = {
    'requested': ['searching', 'confirmed', 'cancelled'],
    'searching': ['confirmed', 'cancelled'],
    'confirmed': ['en_route', 'cancelled'],
    'en_route': ['arrived', 'cancelled'],
    'arrived': ['in_progress', 'cancelled'],
    'in_progress': ['completed', 'disputed'],
    'completed': [],
    'cancelled': [],
    'disputed': ['completed', 'cancelled']
};
