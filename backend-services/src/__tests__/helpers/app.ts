/**
 * Test helper — builds a Fastify app with all routes registered.
 * Uses Fastify's built-in `inject()` for HTTP testing (no Supertest needed).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

// Route imports
import addressRoutes from '../../routes/address';
import adminRoutes from '../../routes/admin';
import bookingRoutes from '../../routes/booking';
import couponRoutes from '../../routes/coupon';
import earningsRoutes from '../../routes/earnings';
import jobOfferRoutes from '../../routes/jobOffer';
import notificationRoutes from '../../routes/notification';
import providerRoutes from '../../routes/provider';
import reviewRoutes from '../../routes/review';
import scheduleRoutes from '../../routes/schedule';
import searchRoutes from '../../routes/search';
import serviceRoutes from '../../routes/service';
import userRoutes from '../../routes/user';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  // Health
  app.get('/', async () => ({
    status: 'OK',
    service: 'Workla API Gateway',
    version: '1.0.0',
    docs: '/docs',
  }));

  app.get('/health', async () => ({
    status: 'healthy',
    service: 'Workla API Gateway',
    version: '1.0.0',
  }));

  // Register all routes
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(addressRoutes, { prefix: '/api/v1/addresses' });
  await app.register(bookingRoutes, { prefix: '/api/v1/bookings' });
  await app.register(couponRoutes, { prefix: '/api/v1/coupons' });
  await app.register(earningsRoutes, { prefix: '/api/v1/earnings' });
  await app.register(jobOfferRoutes, { prefix: '/api/v1/job-offers' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(providerRoutes, { prefix: '/api/v1/providers' });
  await app.register(reviewRoutes, { prefix: '/api/v1/reviews' });
  await app.register(scheduleRoutes, { prefix: '/api/v1/schedule' });
  await app.register(searchRoutes, { prefix: '/api/v1/search' });
  await app.register(serviceRoutes, { prefix: '/api/v1/services' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });

  await app.ready();
  return app;
}
