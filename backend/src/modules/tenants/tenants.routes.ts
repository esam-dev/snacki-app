import type { FastifyInstance } from 'fastify';
import { tenantsController } from './tenants.controller.js';
import { authenticate, authorizeRoles } from '../../common/middleware/authenticate.js';

export async function tenantsRoutes(app: FastifyInstance) {
  // Public list for registration flows (active tenants)
  app.get('/', tenantsController.list);
  // Protected creation (MVP: authenticated comercio users; can be tightened later)
  app.post('/', { preHandler: [authenticate, authorizeRoles('comercio')] }, tenantsController.create);
}
