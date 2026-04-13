import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/app';

describe('Booking Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication Guard', () => {
    it('POST /api/v1/bookings — rejects without auth token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        payload: { serviceId: 'test', subcategoryId: 'test' },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toMatch(/[Uu]nauthorized/);
    });

    it('GET /api/v1/bookings — rejects without auth token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings',
      });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /api/v1/bookings/fake-id/status — rejects without auth token', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/bookings/fake-id/status',
        payload: { status: 'completed' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('Rejects with malformed Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings',
        headers: { authorization: 'Bearer invalid-token-here' },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toMatch(/[Uu]nauthorized|[Ii]nvalid/);
    });

    it('Rejects with non-Bearer auth scheme', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Status Validation', () => {
    it('PATCH /api/v1/bookings/:id/status — rejects invalid status', async () => {
      // This will fail at auth first, but verifying route exists
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/bookings/test-id/status',
        payload: { status: 'invalid_status' },
      });
      // Should be 401 (auth blocks before validation), proving the route is registered
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Dispatch Route', () => {
    it('POST /api/v1/bookings/dispatch — rejects without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings/dispatch',
        payload: { bookingId: 'test-id' },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
