import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { publicImageUrl } from '../catalog/catalog.service.js';
import { summarizeTenantWallet } from './wallet.summary.js';

const MOVEMENTS_DEFAULT_LIMIT = 50;

function requireUser(userId: string | undefined): string {
  if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  return userId;
}

export const walletService = {
  /**
   * Saldo del cliente en cada comercio activo. Los puntos de un comercio solo sirven en ese comercio.
   * Saldo = `remaining` de los EARN no vencidos (los canjes ya los descuentan de `remaining`).
   */
  async getWallet(userId: string | undefined) {
    const uid = requireUser(userId);
    const now = new Date();
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true, slug: { not: env.PLATFORM_TENANT_SLUG } },
      orderBy: { name: 'asc' },
      select: {
        id: true, slug: true, name: true, logoUrl: true, updatedAt: true,
        rewards: { where: { isActive: true, deletedAt: null }, select: { id: true, name: true, cost: true } },
        pointEntries: {
          where: { userId: uid, type: 'EARN', remaining: { gt: 0 } },
          select: { remaining: true, expiresAt: true },
        },
      },
    });

    const items = tenants.map((t) => {
      const summary = summarizeTenantWallet(t.pointEntries, t.rewards, now);
      return {
        tenantId: t.id,
        slug: t.slug,
        name: t.name,
        logoUrl: publicImageUrl('tenant', t.id, t.logoUrl, t.updatedAt),
        ...summary,
      };
    });

    return {
      totalPoints: items.reduce((sum, t) => sum + t.balance, 0),
      tenants: items,
      updatedAt: now,
    };
  },

  /** Movimientos del cliente (más recientes primero), de todos sus comercios o de uno. */
  async getMovements(userId: string | undefined, opts: { tenantId?: string; limit?: number } = {}) {
    const uid = requireUser(userId);
    const now = new Date();
    const where: Prisma.PointEntryWhereInput = { userId: uid };
    if (opts.tenantId) where.tenantId = opts.tenantId;

    const entries = await prisma.pointEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? MOVEMENTS_DEFAULT_LIMIT,
      select: {
        id: true, type: true, points: true, remaining: true, expiresAt: true, createdAt: true,
        tenant: { select: { id: true, slug: true, name: true } },
        claim: { select: { quantity: true, product: { select: { name: true } } } },
        reward: { select: { name: true } },
      },
    });

    return entries.map((e) => {
      let description: string;
      if (e.type === 'REDEEM') description = e.reward?.name ?? 'Canje de recompensa';
      else if (e.claim) description = e.claim.quantity > 1 ? `${e.claim.quantity} × ${e.claim.product.name}` : e.claim.product.name;
      else description = 'Puntos acumulados';

      return {
        id: e.id,
        tenantId: e.tenant.id,
        tenantSlug: e.tenant.slug,
        tenantName: e.tenant.name,
        type: e.type,
        points: e.points,
        description,
        createdAt: e.createdAt,
        expiresAt: e.expiresAt,
        // Un EARN con puntos sin usar y fecha pasada ya no cuenta en el saldo.
        expired: e.type === 'EARN' && e.remaining > 0 && !!e.expiresAt && e.expiresAt <= now,
      };
    });
  },
};
