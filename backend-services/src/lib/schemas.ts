/**
 * Centralized JSON Schema Registry for Workla API
 * Ensures consistency across pagination, UUIDs, and common entity structures.
 */

export const CommonSchemas = {
    // ─── Base Types ───
    UUID: { type: 'string', format: 'uuid' } as const,

    // ─── Pagination ───
    Pagination: {
        type: 'object',
        properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 }
        }
    } as const,

    // ─── Common Responses ───
    SuccessResponse: (dataSchema: any) => ({
        type: 'object',
        required: ['success'],
        properties: {
            success: { type: 'boolean', const: true },
            message: { type: 'string' },
            data: dataSchema
        },
        additionalProperties: false
    } as const),

    PaginatedResponse: (itemSchema: any) => ({
        type: 'object',
        required: ['success', 'count', 'data'],
        properties: {
            success: { type: 'boolean', const: true },
            message: { type: 'string' },
            count: { type: 'integer', minimum: 0 },
            unreadCount: { type: 'integer', minimum: 0 },
            data: { type: 'array', items: itemSchema }
        },
        additionalProperties: false
    } as const),

    ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'string' },
            details: { type: 'string' }
        },
        additionalProperties: false
    } as const,
    GatewayTimeout: {
        type: 'object',
        required: ['error'],
        properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'string', const: 'DATABASE_TIMEOUT' },
            details: { type: 'string' }
        },
        additionalProperties: false
    } as const,

    // ─── Entity Definitions (Data Masking) ───
    ProfileMask: {
        type: 'object',
        properties: {
            id: { type: 'string', format: 'uuid' },
            full_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            avatar_url: { type: 'string', format: 'uri', nullable: true },
            role: { type: 'string', enum: ['CUSTOMER', 'PROVIDER', 'ADMIN'] },
            average_rating: { type: 'number' },
            is_verified: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' }
        },
        additionalProperties: false
    } as const,

    BookingMask: {
        type: 'object',
        properties: {
            id: { type: 'string', format: 'uuid' },
            booking_number: { type: 'string' },
            status: { type: 'string' },
            total_amount: { type: 'number' },
            scheduled_date: { type: 'string' },
            scheduled_time_slot: { type: 'string' },
            customer_address: { type: 'string' },
            service_name_snapshot: { type: 'string' },
            provider_id: { type: 'string', format: 'uuid', nullable: true },
            customer_id: { type: 'string', format: 'uuid', nullable: true },
            created_at: { type: 'string', format: 'date-time' }
        },
        additionalProperties: false
    } as const
};
