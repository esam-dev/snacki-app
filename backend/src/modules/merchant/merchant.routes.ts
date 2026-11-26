import type { FastifyInstance } from 'fastify';
import { authenticate, authorizeRoles } from '../../common/middleware/authenticate.js';
import {
  createProductSchema,
  updateProductSchema,
  createRewardSchema,
  updateRewardSchema,
  updateMerchantSettingsSchema,
  createQrSchema,
  createRedeemQrSchema,
} from './merchant.schemas.js';
import { merchantService } from './merchant.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function merchantRoutes(app: FastifyInstance) {
  // All merchant routes require auth + comercio role
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', authorizeRoles('comercio'));

  // Products
  app.get('/products', async (request, reply) => {
    const products = await merchantService.listProducts(request.authUser?.tenantId);
    return reply.send({ data: { products } });
  });

  app.post('/products', async (request, reply) => {
    const product = await merchantService.createProduct(request.authUser?.tenantId, createProductSchema.parse(request.body));
    return reply.status(201).send({ data: { product } });
  });

  app.patch('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await merchantService.updateProduct(request.authUser?.tenantId, id, updateProductSchema.parse(request.body));
    return reply.send({ data: { product } });
  });

  app.delete('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await merchantService.deleteProduct(request.authUser?.tenantId, id);
    return reply.send({ data: result });
  });

  // Rewards
  app.get('/rewards', async (request, reply) => {
    const rewards = await merchantService.listRewards(request.authUser?.tenantId);
    return reply.send({ data: { rewards } });
  });

  app.post('/rewards', async (request, reply) => {
    const reward = await merchantService.createReward(request.authUser?.tenantId, createRewardSchema.parse(request.body));
    return reply.status(201).send({ data: { reward } });
  });

  app.patch('/rewards/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const reward = await merchantService.updateReward(request.authUser?.tenantId, id, updateRewardSchema.parse(request.body));
    return reply.send({ data: { reward } });
  });

  app.delete('/rewards/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await merchantService.deleteReward(request.authUser?.tenantId, id);
    return reply.send({ data: result });
  });

  // QR de compra
  app.post('/qr', async (request, reply) => {
    const qr = await merchantService.createQr(request.authUser?.tenantId, request.authUser?.sub, createQrSchema.parse(request.body));
    return reply.status(201).send({ data: qr });
  });

  app.get('/qr/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'QR no encontrado' } });
    const status = await merchantService.getQrStatus(request.authUser?.tenantId, id);
    return reply.send({ data: status });
  });

  app.post('/qr/:id/void', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'QR no encontrado' } });
    return reply.send({ data: await merchantService.voidQr(request.authUser?.tenantId, id) });
  });

  // QR de canje: el cliente lo escanea en el local para gastar sus puntos en una recompensa.
  app.post('/redeem-qr', async (request, reply) => {
    const qr = await merchantService.createRedeemQr(request.authUser?.tenantId, request.authUser?.sub, createRedeemQrSchema.parse(request.body));
    return reply.status(201).send({ data: qr });
  });

  app.get('/redeem-qr/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'QR no encontrado' } });
    return reply.send({ data: await merchantService.getRedeemQrStatus(request.authUser?.tenantId, id) });
  });

  app.post('/redeem-qr/:id/void', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'QR no encontrado' } });
    return reply.send({ data: await merchantService.voidRedeemQr(request.authUser?.tenantId, id) });
  });

  // Settings
  app.get('/settings', async (request, reply) => {
    const settings = await merchantService.getSettings(request.authUser?.tenantId);
    return reply.send({ data: { settings } });
  });

  app.patch('/settings', async (request, reply) => {
    const settings = await merchantService.updateSettings(request.authUser?.tenantId, updateMerchantSettingsSchema.parse(request.body));
    return reply.send({ data: { settings } });
  });
}
