import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { catalogService } from './catalog.service.js';

const imageParamsSchema = z.object({
  kind: z.enum(['tenant', 'product', 'reward']),
  id: z.string().uuid(),
});

export async function catalogRoutes(app: FastifyInstance) {
  // Catálogo para la app del cliente (cualquier usuario autenticado).
  app.get('/tenants', { preHandler: [authenticate] }, async (_request, reply) => {
    const tenants = await catalogService.listTenants();
    return reply.header('Cache-Control', 'no-store').send({ data: { tenants } });
  });

  // Imágenes del catálogo: públicas, para poder usarlas en <img src>. Solo sirven fotos de
  // comercios, promos y recompensas, que ya son visibles para cualquier cliente.
  app.get('/images/:kind/:id', async (request, reply) => {
    const { kind, id } = imageParamsSchema.parse(request.params);
    const image = await catalogService.getImage(kind, id);
    if (!image) throw new AppError(404, 'NOT_FOUND', 'Imagen no encontrada');
    if ('redirect' in image) return reply.redirect(image.redirect);
    return reply
      .header('Content-Type', image.mime)
      .header('Cache-Control', 'public, max-age=86400')
      .send(image.buffer);
  });
}
