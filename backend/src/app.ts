import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { errorHandler } from './common/errors/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { tenantsRoutes } from './modules/tenants/tenants.routes.js';
import { merchantRoutes } from './modules/merchant/merchant.routes.js';
import { claimsRoutes } from './modules/claims/claims.routes.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { walletRoutes } from './modules/wallet/wallet.routes.js';
import { redemptionsRoutes } from './modules/redemptions/redemptions.routes.js';
import { referralsRoutes } from './modules/referrals/referrals.routes.js';

export async function buildApp() {
  // 2 MB: deja margen para logos enviados como data URL (ver imageRefSchema).
  const app = Fastify({ logger: env.NODE_ENV !== 'test', bodyLimit: 2 * 1024 * 1024 });

  // El APK de Capacitor (Android) carga la app desde https://localhost.
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || env.corsOrigins.includes(origin) || /^(capacitor|ionic):\/\//.test(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
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
    api.register(merchantRoutes, { prefix: '/merchant' });
    api.register(claimsRoutes, { prefix: '/claims' });
    api.register(catalogRoutes, { prefix: '/catalog' });
    api.register(walletRoutes, { prefix: '/wallet' });
    api.register(redemptionsRoutes, { prefix: '/redemptions' });
    api.register(referralsRoutes, { prefix: '/referrals' });
  }, { prefix: '/api' });

  return app;
}