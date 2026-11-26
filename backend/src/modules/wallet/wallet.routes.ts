import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, authorizeRoles } from '../../common/middleware/authenticate.js';
import { walletService } from './wallet.service.js';

const movementsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });
const tenantParamsSchema = z.object({ tenantId: z.string().uuid() });

export async function walletRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', authorizeRoles('cliente'));

  app.get('/', async (request, reply) => {
    const wallet = await walletService.getWallet(request.authUser?.sub);
    return reply.header('Cache-Control', 'no-store').send({ data: wallet });
  });

  app.get('/movements', async (request, reply) => {
    const { limit } = movementsQuerySchema.parse(request.query);
    const movements = await walletService.getMovements(request.authUser?.sub, { limit });
    return reply.header('Cache-Control', 'no-store').send({ data: { movements } });
  });

  app.get('/:tenantId/movements', async (request, reply) => {
    const { tenantId } = tenantParamsSchema.parse(request.params);
    const { limit } = movementsQuerySchema.parse(request.query);
    const movements = await walletService.getMovements(request.authUser?.sub, { tenantId, limit });
    return reply.header('Cache-Control', 'no-store').send({ data: { movements } });
  });
}
