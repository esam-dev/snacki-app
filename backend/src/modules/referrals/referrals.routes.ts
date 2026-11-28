import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, authorizeRoles } from '../../common/middleware/authenticate.js';
import { referralsService } from './referrals.service.js';

const applySchema = z.object({ code: z.string().trim().min(4, 'Código inválido').max(20, 'Código inválido') });

export async function referralsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  // Invitar y ser invitado es cosa de clientes; el comercio solo configura las reglas.
  app.addHook('preHandler', authorizeRoles('cliente'));

  app.get('/me', async (request, reply) => {
    const data = await referralsService.getMine(request.authUser?.sub);
    return reply.header('Cache-Control', 'no-store').send({ data });
  });

  app.post('/apply', async (request, reply) => {
    const { code } = applySchema.parse(request.body);
    const result = await referralsService.apply(request.authUser?.sub, code);
    return reply.status(201).send({ data: result });
  });
}
