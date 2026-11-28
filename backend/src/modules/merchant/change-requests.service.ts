import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { merchantService } from './merchant.service.js';
import {
  createProductSchema, updateProductSchema, createRewardSchema, updateRewardSchema,
} from './merchant.schemas.js';

export type ChangeEntity = 'product' | 'reward';
export type ChangeAction = 'create' | 'update' | 'delete';

function requireIds(tenantId: string | undefined, userId: string | undefined) {
  if (!tenantId || !userId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  return { tenantId, userId };
}

const requestSelect = {
  id: true, entity: true, action: true, targetId: true, targetName: true, payload: true, status: true,
  rejectionReason: true, createdAt: true, reviewedAt: true,
  requestedBy: { select: { id: true, fullName: true, email: true } },
  reviewedBy: { select: { id: true, fullName: true } },
} as const;

/** Valida el cuerpo con el mismo esquema que el API directo, para que lo aprobado siempre sea aplicable. */
function parsePayload(entity: ChangeEntity, action: ChangeAction, body: unknown): Record<string, unknown> | null {
  if (action === 'delete') return null;
  const schema = entity === 'product'
    ? (action === 'create' ? createProductSchema : updateProductSchema)
    : (action === 'create' ? createRewardSchema : updateRewardSchema);
  return schema.parse(body) as Record<string, unknown>;
}

async function targetName(entity: ChangeEntity, tenantId: string, targetId: string): Promise<string> {
  const row = entity === 'product'
    ? await prisma.product.findFirst({ where: { id: targetId, tenantId, deletedAt: null }, select: { name: true } })
    : await prisma.reward.findFirst({ where: { id: targetId, tenantId, deletedAt: null }, select: { name: true } });
  if (!row) throw new AppError(404, 'NOT_FOUND', entity === 'product' ? 'Producto no encontrado' : 'Recompensa no encontrada');
  return row.name;
}

export const changeRequestsService = {
  /** Un asistente propone un cambio; queda pendiente hasta que un titular lo apruebe. */
  async submit(
    tenantId: string | undefined, userId: string | undefined,
    input: { entity: ChangeEntity; action: ChangeAction; targetId?: string; body?: unknown },
  ) {
    const ids = requireIds(tenantId, userId);
    const payload = parsePayload(input.entity, input.action, input.body ?? {});
    let name: string | null = null;
    if (input.action !== 'create') {
      if (!input.targetId) throw new AppError(400, 'VALIDATION_ERROR', 'Falta el elemento a modificar');
      name = await targetName(input.entity, ids.tenantId, input.targetId);
    } else {
      name = typeof payload?.name === 'string' ? payload.name.trim() : null;
    }
    return prisma.changeRequest.create({
      data: {
        tenantId: ids.tenantId, requestedById: ids.userId,
        entity: input.entity, action: input.action,
        targetId: input.targetId ?? null, targetName: name, payload: (payload ?? undefined) as any,
      },
      select: requestSelect,
    });
  },

  /** Titulares: todas las solicitudes del local. Asistentes: solo las suyas. */
  async list(tenantId: string | undefined, userId: string | undefined, staffRole: 'owner' | 'assistant', status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const ids = requireIds(tenantId, userId);
    return prisma.changeRequest.findMany({
      where: {
        tenantId: ids.tenantId,
        ...(staffRole === 'assistant' ? { requestedById: ids.userId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: requestSelect,
    });
  },

  async countPending(tenantId: string | undefined) {
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
    return prisma.changeRequest.count({ where: { tenantId, status: 'PENDING' } });
  },

  /** Aprueba y aplica el cambio. El estado se reclama de forma atómica para que dos titulares no lo apliquen dos veces. */
  async approve(tenantId: string | undefined, reviewerId: string | undefined, requestId: string) {
    const ids = requireIds(tenantId, reviewerId);
    const req = await prisma.changeRequest.findFirst({ where: { id: requestId, tenantId: ids.tenantId } });
    if (!req) throw new AppError(404, 'NOT_FOUND', 'Solicitud no encontrada');

    const claimed = await prisma.changeRequest.updateMany({
      where: { id: requestId, tenantId: ids.tenantId, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedById: ids.userId, reviewedAt: new Date() },
    });
    if (claimed.count === 0) throw new AppError(409, 'REQUEST_ALREADY_REVIEWED', 'Esta solicitud ya fue revisada');

    try {
      const payload = (req.payload ?? {}) as any;
      const t = ids.tenantId;
      if (req.entity === 'product') {
        if (req.action === 'create') await merchantService.createProduct(t, payload);
        else if (req.action === 'update') await merchantService.updateProduct(t, req.targetId!, payload);
        else await merchantService.deleteProduct(t, req.targetId!);
      } else {
        if (req.action === 'create') await merchantService.createReward(t, payload);
        else if (req.action === 'update') await merchantService.updateReward(t, req.targetId!, payload);
        else await merchantService.deleteReward(t, req.targetId!);
      }
    } catch (e) {
      // No se pudo aplicar (p. ej. el elemento ya fue borrado): vuelve a pendiente para que no se pierda.
      await prisma.changeRequest.updateMany({
        where: { id: requestId, status: 'APPROVED' },
        data: { status: 'PENDING', reviewedById: null, reviewedAt: null },
      });
      throw e;
    }
    return prisma.changeRequest.findUnique({ where: { id: requestId }, select: requestSelect });
  },

  async reject(tenantId: string | undefined, reviewerId: string | undefined, requestId: string, reason?: string) {
    const ids = requireIds(tenantId, reviewerId);
    const res = await prisma.changeRequest.updateMany({
      where: { id: requestId, tenantId: ids.tenantId, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedById: ids.userId, reviewedAt: new Date(), rejectionReason: reason?.trim() || null },
    });
    if (res.count === 0) {
      const exists = await prisma.changeRequest.findFirst({ where: { id: requestId, tenantId: ids.tenantId }, select: { id: true } });
      if (!exists) throw new AppError(404, 'NOT_FOUND', 'Solicitud no encontrada');
      throw new AppError(409, 'REQUEST_ALREADY_REVIEWED', 'Esta solicitud ya fue revisada');
    }
    return prisma.changeRequest.findUnique({ where: { id: requestId }, select: requestSelect });
  },
};
