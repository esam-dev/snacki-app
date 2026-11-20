import type { FastifyReply, FastifyRequest } from 'fastify';
import { createTenantSchema } from './tenants.schemas.js';
import { tenantsService } from './tenants.service.js';

export const tenantsController = {
  async list(_request: FastifyRequest, reply: FastifyReply) {
    const tenants = await tenantsService.listActive();
    return reply.status(200).send({ data: { tenants } });
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = createTenantSchema.parse(request.body);
    const tenant = await tenantsService.create(input);
    return reply.status(201).send({ data: { tenant } });
  },
};
