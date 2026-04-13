import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/app';

// Mock supabaseAdmin to avoid ECONNREFUSED in CI
vi.mock('../lib/supabase', () => {
  const mockQueryBuilder = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    // Simulate a successful thenable for the fluent API
    then: vi.fn(function (onFulfilled) {
      return Promise.resolve({ 
        data: [], 
        error: null, 
        count: 0 
      }).then(onFulfilled);
    }),
  };

  return {
    supabaseAdmin: {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
  };
});

describe('Service Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/services', () => {
    it('returns 200 with success response', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/services',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    });

    it('supports query params (limit, offset)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/services?limit=5&offset=0',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/v1/services/featured', () => {
    it('returns 200 with featured data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/services/featured',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });
  });

  describe('GET /api/v1/services/banners', () => {
    it('returns 200 with banner data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/services/banners',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('No Auth Required', () => {
    it('service routes are public (no auth header needed)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/services',
      });
      // Should NOT return 401
      expect(res.statusCode).not.toBe(401);
    });
  });
});
