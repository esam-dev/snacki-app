import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { signAccessToken, type UserRole } from '../../lib/jwt.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

function toUserDto(user: { id: string; fullName: string; email: string; isActive: boolean }) {
  return { id: user.id, fullName: user.fullName, email: user.email, isActive: user.isActive };
}

function toMembershipDto(m: { role: UserRole; tenant: { id: string; slug: string; name: string } }) {
  return { role: m.role, tenantId: m.tenant.id, tenantSlug: m.tenant.slug, tenantName: m.tenant.name };
}

function buildAuth(tokenPayload: { sub: string; email: string; role: UserRole; tenantId: string }) {
  const accessToken = signAccessToken(tokenPayload);
  return { accessToken, tokenType: 'Bearer' as const, expiresIn: env.JWT_EXPIRES_IN };
}

async function ensurePlatformTenant() {
  return prisma.tenant.upsert({
    where: { slug: env.PLATFORM_TENANT_SLUG },
    update: { name: env.PLATFORM_TENANT_NAME, isActive: true },
    create: { name: env.PLATFORM_TENANT_NAME, slug: env.PLATFORM_TENANT_SLUG, isActive: true },
  });
}

export const authService = {
  async register(input: RegisterInput) {
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'El correo ya está registrado');
    }

    let tenant;
    if (input.accountType === 'comercio') {
      tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId! } });
      if (!tenant || !tenant.isActive) {
        throw new AppError(404, 'TENANT_NOT_FOUND', 'Comercio no encontrado');
      }
    } else {
      tenant = await ensurePlatformTenant();
    }

    const passwordHash = await hashPassword(input.password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: input.fullName.trim(),
          passwordHash,
          isActive: true,
        },
      });
      const membership = await tx.userTenantRoleMap.create({
        data: {
          userId: user.id,
          tenantId: tenant!.id,
          role: input.accountType,
        },
        include: { tenant: true },
      });
      return { user, membership };
    });

    const role = result.membership.role as UserRole;
    const auth = buildAuth({ sub: result.user.id, email: result.user.email, role, tenantId: result.membership.tenantId });
    return {
      user: toUserDto(result.user),
      membership: toMembershipDto({ role, tenant: result.membership.tenant }),
      auth,
    };
  },

  async login(input: LoginInput) {
    const identifier = input.identifier.trim().toLowerCase();
    // MVP: login por email
    const user = await prisma.user.findUnique({
      where: { email: identifier },
      include: { memberships: { include: { tenant: true } } },
    });

    const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
    if (!user || !user.isActive) throw invalid();

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw invalid();

    const membership = user.memberships.find((m) => m.role === input.accountType && m.tenant.isActive);
    if (!membership) {
      throw new AppError(403, 'ROLE_MISMATCH', 'No tienes acceso con el tipo de cuenta seleccionado');
    }

    const role = membership.role as UserRole;
    const auth = buildAuth({ sub: user.id, email: user.email, role, tenantId: membership.tenantId });
    return {
      user: toUserDto(user),
      membership: toMembershipDto({ role, tenant: membership.tenant }),
      auth,
    };
  },

  async me(userId: string, tokenPayload: { role: UserRole; tenantId: string; iat?: number; exp?: number }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { tenant: true } } },
    });
    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
    }
    const membership = user.memberships.find((m) => m.tenantId === tokenPayload.tenantId && m.role === tokenPayload.role)
      || user.memberships[0];
    if (!membership || !membership.tenant.isActive) {
      throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
    }
    const role = membership.role as UserRole;
    return {
      user: toUserDto(user),
      membership: toMembershipDto({ role, tenant: membership.tenant }),
      session: {
        issuedAt: tokenPayload.iat ? new Date(tokenPayload.iat * 1000).toISOString() : undefined,
        expiresAt: tokenPayload.exp ? new Date(tokenPayload.exp * 1000).toISOString() : undefined,
      },
    };
  },
};
