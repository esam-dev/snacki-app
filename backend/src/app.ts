import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { errorHandler } from './common/errors/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { tenantsRoutes } from './modules/tenants/tenants.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || env.corsOrigins.includes(origin) || /^(capacitor|ionic):\/\//.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setErrorHandler(errorHandler);
  app.get('/health', async () => ({ status: 'ok' }));
  app.register(async (api) => {
    api.register(authRoutes, { prefix: '/auth' });
    api.register(tenantsRoutes, { prefix: '/tenants' });
  }, { prefix: '/api' });

  return app;
}