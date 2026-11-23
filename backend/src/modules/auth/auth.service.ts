import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { signAccessToken, type UserRole } from '../../lib/jwt.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const toUser = (u: { id: string; fullName: string; email: string; isActive: boolean }) => ({
  id: u.id, fullName: u.fullName, email: u.email, isActive: u.isActive,
});

const toMembership = (m: { role: UserRole; tenant: { id: string; slug: string; name: string } }) => ({
  role: m.role, tenantId: m.tenant.id, tenantSlug: m.tenant.slug, tenantName: m.tenant.name,
});

const authToken = (payload: { sub: string; email: string; role: UserRole; tenantId: string }) => ({
  accessToken: signAccessToken(payload), tokenType: 'Bearer' as const, expiresIn: env.JWT_EXPIRES_IN,
});

async function platformTenant() {
  return prisma.tenant.upsert({
    where: { slug: env.PLATFORM_TENANT_SLUG },
    update: { name: env.PLATFORM_TENANT_NAME, isActive: true },
    create: { name: env.PLATFORM_TENANT_NAME, slug: env.PLATFORM_TENANT_SLUG, isActive: true },
    select: { id: true },
  });
}

export const authService = {
  async register(input: RegisterInput) {
    const email = input.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'El correo ya está registrado');
    }

    let tenant;
    if (input.accountType === 'comercio') {
      tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId! }, select: { id: true, isActive: true } });
      if (!tenant?.isActive) throw new AppError(404, 'TENANT_NOT_FOUND', 'Comercio no encontrado');
    } else {
      tenant = await platformTenant();
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const { user, membership } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, fullName: input.fullName.trim(), passwordHash, isActive: true },
      });
      const membership = await tx.userTenantRoleMap.create({
        data: { userId: user.id, tenantId: tenant!.id, role: input.accountType },
        select: { role: true, tenantId: true, tenant: { select: { id: true, slug: true, name: true } } },
      });
      return { user, membership };
    });

    const role = membership.role as UserRole;
    return {
      user: toUser(user),
      membership: toMembership({ role, tenant: membership.tenant }),
      auth: authToken({ sub: user.id, email: user.email, role, tenantId: membership.tenantId }),
    };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.identifier.trim().toLowerCase() },
      select: {
        id: true, fullName: true, email: true, isActive: true, passwordHash: true,
        memberships: {
          select: { role: true, tenantId: true, tenant: { select: { id: true, slug: true, name: true, isActive: true } } },
        },
      },
    });
    const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
    if (!user?.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) throw invalid();

    const membership = user.memberships.find((m) => m.role === input.accountType && m.tenant.isActive);
    if (!membership) throw new AppError(403, 'ROLE_MISMATCH', 'No tienes acceso con el tipo de cuenta seleccionado');

    const role = membership.role as UserRole;
    return {
      user: toUser(user),
      membership: toMembership({ role, tenant: membership.tenant }),
      auth: authToken({ sub: user.id, email: user.email, role, tenantId: membership.tenantId }),
    };
  },

  async me(userId: string, token: { role: UserRole; tenantId: string; iat?: number; exp?: number }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, fullName: true, email: true, isActive: true,
        memberships: {
          select: { role: true, tenantId: true, tenant: { select: { id: true, slug: true, name: true, isActive: true } } },
        },
      },
    });
    if (!user?.isActive) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');

    const membership = user.memberships.find((m) => m.tenantId === token.tenantId && m.role === token.role) || user.memberships[0];
    if (!membership?.tenant.isActive) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');

    const role = membership.role as UserRole;
    return {
      user: toUser(user),
      membership: toMembership({ role, tenant: membership.tenant }),
      session: {
        issuedAt: token.iat ? new Date(token.iat * 1000).toISOString() : undefined,
        expiresAt: token.exp ? new Date(token.exp * 1000).toISOString() : undefined,
      },
    };
  },
};