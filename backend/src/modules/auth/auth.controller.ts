import type { FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { authService } from './auth.service.js';
import { AppError } from '../../common/errors/app-error.js';

export const authController = {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const input = registerSchema.parse(request.body);
    const result = await authService.register(input);
    return reply.status(201).send({ data: result });
  },

  async login(request: FastifyRequest, reply: FastifyReply) {
    const input = loginSchema.parse(request.body);
    const result = await authService.login(input);
    return reply.status(200).send({ data: result });
  },

  async me(request: FastifyRequest, reply: FastifyReply) {
    const authUser = request.authUser;
    if (!authUser) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
    const result = await authService.me(authUser.sub, authUser);
    return reply.status(200).send({ data: result });
  },
};
