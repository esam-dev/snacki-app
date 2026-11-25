import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { QR_URI_PREFIX, signQrToken } from '../../lib/qr-token.js';
import type {
  CreateQrInput,
  CreateProductInput,
  UpdateProductInput,
  CreateRewardInput,
  UpdateRewardInput,
  UpdateMerchantSettingsInput,
} from './merchant.schemas.js';

function requireTenantId(tenantId: string | undefined): string {
  if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  return tenantId;
}

/** Vigencia del QR: 24 h para que el cliente pueda escanear sin conexión y sincronizar después. */
export const QR_TTL_MS = 24 * 60 * 60 * 1000;

export const merchantService = {
  // QR de compra
  async createQr(tenantId: string | undefined, userId: string | undefined, input: CreateQrInput) {
    const tid = requireTenantId(tenantId);
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');

    const product = await prisma.product.findFirst({ where: { id: input.productId, tenantId: tid, deletedAt: null } });
    if (!product) throw new AppError(404, 'NOT_FOUND', 'Promo no encontrada');

    const now = new Date();
    if (!product.isActive) throw new AppError(409, 'PROMO_INACTIVE', 'La promo está pausada. Actívala para generar el QR.');
    if (product.promoStartsAt > now) throw new AppError(409, 'PROMO_NOT_STARTED', 'La promo todavía no empieza.');
    if (product.promoEndsAt < now) throw new AppError(409, 'PROMO_ENDED', 'La promo ya terminó.');

    const quantity = input.quantity ?? 1;
    const expiresAt = new Date(now.getTime() + QR_TTL_MS);
    const claim = await prisma.purchaseClaim.create({
      data: {
        tenantId: tid,
        productId: product.id,
        quantity,
        points: product.points * quantity,
        expiresAt,
        createdById: userId,
      },
    });

    const token = signQrToken(claim.id, expiresAt);
    return {
      claimId: claim.id,
      token,
      qrContent: `${QR_URI_PREFIX}${token}`,
      expiresAt: claim.expiresAt,
      points: claim.points,
      quantity: claim.quantity,
      product: { id: product.id, name: product.name, points: product.points },
    };
  },

  /**
   * Anula un QR que todavía no se canjeó (venta cancelada o QR generado por error).
   * Atómico: si el cliente lo canjea al mismo tiempo, gana quien llegue primero y el otro recibe 409.
   */
  async voidQr(tenantId: string | undefined, claimId: string) {
    const tid = requireTenantId(tenantId);
    const now = new Date();
    const res = await prisma.purchaseClaim.updateMany({
      where: { id: claimId, tenantId: tid, claimedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    if (res.count === 1) return { claimId, status: 'expired' as const };
    const claim = await prisma.purchaseClaim.findFirst({ where: { id: claimId, tenantId: tid }, select: { claimedAt: true } });
    if (!claim) throw new AppError(404, 'NOT_FOUND', 'QR no encontrado');
    if (claim.claimedAt) throw new AppError(409, 'QR_ALREADY_USED', 'El cliente ya sumó los puntos de este QR.');
    return { claimId, status: 'expired' as const }; // ya estaba vencido
  },

  /** Estado de un QR emitido por este comercio (para mostrar "escaneado" en pantalla). */
  async getQrStatus(tenantId: string | undefined, claimId: string) {
    const tid = requireTenantId(tenantId);
    const claim = await prisma.purchaseClaim.findFirst({
      where: { id: claimId, tenantId: tid },
      select: { id: true, claimedAt: true, expiresAt: true },
    });
    if (!claim) throw new AppError(404, 'NOT_FOUND', 'QR no encontrado');
    const status = claim.claimedAt ? 'claimed' : claim.expiresAt < new Date() ? 'expired' : 'pending';
    return { claimId: claim.id, status, claimedAt: claim.claimedAt, expiresAt: claim.expiresAt };
  },


  // Products (promos)
  async listProducts(tenantId?: string) {
    const tid = requireTenantId(tenantId);
    return prisma.product.findMany({
      where: { tenantId: tid, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createProduct(tenantId: string | undefined, input: CreateProductInput) {
    const tid = requireTenantId(tenantId);
    const promoStartsAt = new Date(input.promoStartsAt);
    const promoEndsAt = new Date(input.promoEndsAt);
    if (promoEndsAt <= promoStartsAt) {
      throw new AppError(400, 'VALIDATION_ERROR', 'promoEndsAt debe ser mayor que promoStartsAt');
    }
    return prisma.product.create({
      data: {
        tenantId: tid,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        points: input.points,
        imageUrl: input.imageUrl || null,
        promoStartsAt,
        promoEndsAt,
        isActive: input.isActive ?? true,
      },
    });
  },

  async updateProduct(tenantId: string | undefined, productId: string, input: UpdateProductInput) {
    const tid = requireTenantId(tenantId);
    const existing = await prisma.product.findFirst({ where: { id: productId, tenantId: tid, deletedAt: null } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Producto no encontrado');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.points !== undefined) data.points = input.points;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.promoStartsAt !== undefined) data.promoStartsAt = new Date(input.promoStartsAt);
    if (input.promoEndsAt !== undefined) data.promoEndsAt = new Date(input.promoEndsAt);

    const starts = data.promoStartsAt ?? existing.promoStartsAt;
    const ends = data.promoEndsAt ?? existing.promoEndsAt;
    if (ends <= starts) {
      throw new AppError(400, 'VALIDATION_ERROR', 'promoEndsAt debe ser mayor que promoStartsAt');
    }

    return prisma.product.update({ where: { id: productId }, data });
  },

  async deleteProduct(tenantId: string | undefined, productId: string) {
    const tid = requireTenantId(tenantId);
    const existing = await prisma.product.findFirst({ where: { id: productId, tenantId: tid, deletedAt: null } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Producto no encontrado');
    const sales = await prisma.purchaseClaim.count({ where: { productId } });
    if (sales === 0) {
      await prisma.product.delete({ where: { id: productId } });
      return { ok: true, archived: false };
    }
    // Ya tiene ventas: se archiva para conservar el historial de puntos y se anulan sus QR sin canjear.
    const now = new Date();
    await prisma.$transaction([
      prisma.purchaseClaim.updateMany({
        where: { productId, claimedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
      prisma.product.update({ where: { id: productId }, data: { deletedAt: now, isActive: false } }),
    ]);
    return { ok: true, archived: true };
  },

  // Rewards
  async listRewards(tenantId?: string) {
    const tid = requireTenantId(tenantId);
    return prisma.reward.findMany({
      where: { tenantId: tid, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createReward(tenantId: string | undefined, input: CreateRewardInput) {
    const tid = requireTenantId(tenantId);
    return prisma.reward.create({
      data: {
        tenantId: tid,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        cost: input.cost,
        imageUrl: input.imageUrl || null,
        isActive: input.isActive ?? true,
      },
    });
  },

  async updateReward(tenantId: string | undefined, rewardId: string, input: UpdateRewardInput) {
    const tid = requireTenantId(tenantId);
    const existing = await prisma.reward.findFirst({ where: { id: rewardId, tenantId: tid, deletedAt: null } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Recompensa no encontrada');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.cost !== undefined) data.cost = input.cost;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return prisma.reward.update({ where: { id: rewardId }, data });
  },

  async deleteReward(tenantId: string | undefined, rewardId: string) {
    const tid = requireTenantId(tenantId);
    const existing = await prisma.reward.findFirst({ where: { id: rewardId, tenantId: tid, deletedAt: null } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Recompensa no encontrada');
    const redemptions = await prisma.redemption.count({ where: { rewardId } });
    if (redemptions === 0) {
      await prisma.reward.delete({ where: { id: rewardId } });
      return { ok: true, archived: false };
    }
    // Ya tiene canjes: se archiva para conservar el historial.
    await prisma.reward.update({ where: { id: rewardId }, data: { deletedAt: new Date(), isActive: false } });
    return { ok: true, archived: true };
  },

  // Settings
  async getSettings(tenantId?: string) {
    const tid = requireTenantId(tenantId);
    const tenant = await prisma.tenant.findUnique({ where: { id: tid } });
    if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant no encontrado');
    return tenant;
  },

  async updateSettings(tenantId: string | undefined, input: UpdateMerchantSettingsInput) {
    const tid = requireTenantId(tenantId);
    const existing = await prisma.tenant.findUnique({ where: { id: tid } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tenant no encontrado');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.category !== undefined) data.category = input.category;
    if (input.address !== undefined) data.address = input.address?.trim() || null;
    if (input.latitude !== undefined) data.latitude = input.latitude;
    if (input.longitude !== undefined) data.longitude = input.longitude;
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl || null;
    if (input.pointsExpireAt !== undefined) data.pointsExpireAt = input.pointsExpireAt ? new Date(input.pointsExpireAt) : null;

    return prisma.tenant.update({ where: { id: tid }, data });
  },
};
