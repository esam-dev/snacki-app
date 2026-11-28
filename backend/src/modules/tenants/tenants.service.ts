import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { slugify } from '../../lib/slug.js';
import type { CreateTenantInput } from './tenants.schemas.js';

const tenantSelect = { id: true, name: true, slug: true, isActive: true, createdAt: true } as const;

export const tenantsService = {
  listActive() {
    return prisma.tenant.findMany({ where: { isActive: true, slug: { not: env.PLATFORM_TENANT_SLUG } }, orderBy: { name: 'asc' }, select: tenantSelect });
  },

  async create(input: CreateTenantInput) {
    const name = input.name.trim();
    const slug = (input.slug ? slugify(input.slug) : slugify(name)).trim();
    if (!slug) throw new AppError(400, 'VALIDATION_ERROR', 'Slug inválido');
    if (await prisma.tenant.findUnique({ where: { slug } })) {
      throw new AppError(409, 'TENANT_SLUG_ALREADY_EXISTS', 'El slug ya está en uso');
    }
    return prisma.tenant.create({ data: { name, slug, isActive: true }, select: tenantSelect });
  },
};