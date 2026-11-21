import type { FastifyInstance } from 'fastify';
import { AppError } from '../../common/errors/app-error.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { authService } from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const result = await authService.register(registerSchema.parse(request.body));
    return reply.status(201).send({ data: result });
  });

  app.post('/login', async (request, reply) => {
    const result = await authService.login(loginSchema.parse(request.body));
    return reply.status(200).send({ data: result });
  });

  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    if (!request.authUser) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
    const result = await authService.me(request.authUser.sub, request.authUser);
    return reply.status(200).send({ data: result });
  });
}