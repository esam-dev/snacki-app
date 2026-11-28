import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, authorizeRoles } from '../../common/middleware/authenticate.js';
import { claimsService } from './claims.service.js';

const redeemSchema = z.object({ token: z.string().min(1).max(512) });

export async function claimsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  // Solo clientes suman puntos: una cuenta de comercio no puede canjear QR.
  app.addHook('preHandler', authorizeRoles('cliente'));

  app.post('/', async (request, reply) => {
    const { token } = redeemSchema.parse(request.body);
    const result = await claimsService.redeem(request.authUser?.sub, token);
    return reply.status(201).send({ data: result });
  });
}
