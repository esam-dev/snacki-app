import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, authorizeRoles } from '../../common/middleware/authenticate.js';
import { redemptionsService } from './redemptions.service.js';

const tokenSchema = z.object({ token: z.string().min(1).max(512) });

export async function redemptionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  // Solo clientes gastan puntos, y solo escaneando el QR de canje del comercio.
  app.addHook('preHandler', authorizeRoles('cliente'));

  app.post('/preview', async (request, reply) => {
    const { token } = tokenSchema.parse(request.body);
    return reply.send({ data: await redemptionsService.preview(request.authUser?.sub, token) });
  });

  app.post('/', async (request, reply) => {
    const { token } = tokenSchema.parse(request.body);
    const result = await redemptionsService.redeem(request.authUser?.sub, token);
    return reply.status(201).send({ data: result });
  });
}
