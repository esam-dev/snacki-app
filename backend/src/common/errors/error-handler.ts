import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isAppError } from './app-error.js';

export function errorHandler(error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (isAppError(error)) {
    const body: any = { error: { code: error.code, message: error.message } };
    if (error.details) body.error.details = error.details;
    return reply.status(error.statusCode).send(body);
  }

  const statusCode = (error as FastifyError).statusCode && (error as FastifyError).statusCode! >= 400
    ? (error as FastifyError).statusCode!
    : 500;

  if (statusCode === 401) {
    return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } });
  }

  // Avoid leaking internal details
  const message = statusCode >= 500 ? 'Error interno del servidor' : (error.message || 'Error');
  const code = statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  return reply.status(statusCode).send({ error: { code, message } });
}
