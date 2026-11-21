import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { verifyAccessToken, type JwtPayload } from '../../lib/jwt.js';

declare module 'fastify' {
  interface FastifyRequest { authUser?: JwtPayload; }
}

export async function authenticate(request: FastifyRequest): Promise<void> {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7).trim() : '';
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  try {
    request.authUser = verifyAccessToken(token);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Token inválido o expirado');
  }
}

export function authorizeRoles(...roles: Array<'cliente' | 'comercio'>) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!request.authUser) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
    if (!roles.includes(request.authUser.role)) throw new AppError(403, 'FORBIDDEN', 'No tienes permisos para realizar esta acción');
  };
}