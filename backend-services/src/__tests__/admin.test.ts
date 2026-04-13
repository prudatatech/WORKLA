import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/app';

describe('Admin Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication Guard', () => {
    it('GET /api/v1/admin/dashboard — rejects without auth token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard',
      });
      // Admin endpoints require auth first
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toMatch(/[Uu]nauthorized/);
    });

    it('GET /api/v1/admin/stats — rejects without auth token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/stats',
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/v1/admin/users — rejects without auth token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
      });
      expect(res.statusCode).toBe(401);
    });

    it('Rejects admin route with malformed Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/dashboard',
        headers: { authorization: 'Bearer invalid-admin-token' },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error).toMatch(/[Uu]nauthorized|[Ii]nvalid/);
    });
  });
});
