import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type {
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

export const merchantService = {
  // Products (promos)
  async listProducts(tenantId?: string) {
    const tid = requireTenantId(tenantId);
    return prisma.product.findMany({
      where: { tenantId: tid },
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
    const existing = await prisma.product.findFirst({ where: { id: productId, tenantId: tid } });
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
    const existing = await prisma.product.findFirst({ where: { id: productId, tenantId: tid } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Producto no encontrado');
    await prisma.product.delete({ where: { id: productId } });
    return { ok: true };
  },

  // Rewards
  async listRewards(tenantId?: string) {
    const tid = requireTenantId(tenantId);
    return prisma.reward.findMany({
      where: { tenantId: tid },
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
    const existing = await prisma.reward.findFirst({ where: { id: rewardId, tenantId: tid } });
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
    const existing = await prisma.reward.findFirst({ where: { id: rewardId, tenantId: tid } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Recompensa no encontrada');
    await prisma.reward.delete({ where: { id: rewardId } });
    return { ok: true };
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
