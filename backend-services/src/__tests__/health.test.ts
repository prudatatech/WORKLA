import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/app';

describe('Health & Root Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / — returns service info', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('OK');
    expect(body.service).toBe('Workla API Gateway');
    expect(body.version).toBe('1.0.0');
  });

  it('GET /health — returns healthy status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('healthy');
  });
});
