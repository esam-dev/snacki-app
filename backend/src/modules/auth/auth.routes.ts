import type { FastifyInstance } from 'fastify';
import { authController } from './auth.controller.js';
import { authenticate } from '../../common/middleware/authenticate.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', authController.register);
  app.post('/login', authController.login);
  app.get('/me', { preHandler: [authenticate] }, authController.me);
}
