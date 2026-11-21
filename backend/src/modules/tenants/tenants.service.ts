import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type { CreateTenantInput } from './tenants.schemas.js';

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

const tenantSelect = { id: true, name: true, slug: true, isActive: true, createdAt: true } as const;

export const tenantsService = {
  listActive() {
    return prisma.tenant.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: tenantSelect });
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