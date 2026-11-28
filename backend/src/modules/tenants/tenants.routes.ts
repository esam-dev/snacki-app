import type { FastifyInstance } from 'fastify';
import { authenticate, authorizeRoles } from '../../common/middleware/authenticate.js';
import { createTenantSchema } from './tenants.schemas.js';
import { tenantsService } from './tenants.service.js';

export async function tenantsRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    return reply.status(200).send({ data: { tenants: await tenantsService.listActive() } });
  });

  app.post('/', { preHandler: [authenticate, authorizeRoles('comercio')] }, async (request, reply) => {
    const tenant = await tenantsService.create(createTenantSchema.parse(request.body));
    return reply.status(201).send({ data: { tenant } });
  });
}