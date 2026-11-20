import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { verifyAccessToken, type JwtPayload } from '../../lib/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  }
  try {
    const payload = verifyAccessToken(token);
    request.authUser = payload;
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Token inválido o expirado');
  }
}

export function authorizeRoles(...roles: Array<'cliente' | 'comercio'>) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = request.authUser;
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
    if (!roles.includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'No tienes permisos para realizar esta acción');
    }
  };
}
