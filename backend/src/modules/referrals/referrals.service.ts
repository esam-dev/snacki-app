import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { publicImageUrl } from '../catalog/catalog.service.js';

/** Sin 0/O ni 1/I/L para que el código se pueda dictar o copiar a mano sin errores. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 7;

export function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Mayúsculas y sin espacios ni guiones: acepta "abc-12 34" igual que "ABC1234". */
export function normalizeReferralCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

export const REFERRAL_ERRORS = {
  invalid: () => new AppError(404, 'REFERRAL_CODE_INVALID', 'Este código de invitación no existe.'),
  disabled: () => new AppError(409, 'REFERRALS_DISABLED', 'Este comercio no tiene referidos activos.'),
  self: () => new AppError(409, 'REFERRAL_SELF', 'No puedes usar tu propio código.'),
  mutual: () => new AppError(409, 'REFERRAL_MUTUAL', 'No puedes usar el código de alguien a quien tú invitaste.'),
  existingClient: () => new AppError(409, 'REFERRAL_EXISTING_CLIENT', 'Ya eres cliente de este comercio: los códigos son para clientes nuevos.'),
  alreadyReferred: () => new AppError(409, 'REFERRAL_ALREADY_REFERRED', 'Ya usaste un código de invitación en este comercio.'),
  limitReached: () => new AppError(409, 'REFERRAL_LIMIT_REACHED', 'Este código ya alcanzó el máximo de invitaciones.'),
};

function requireUser(userId: string | undefined): string {
  if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  return userId;
}

/**
 * Crea los códigos que falten (uno por comercio). `skipDuplicates` absorbe tanto una petición
 * concurrente que ya lo creó como un choque improbable de código; en ese caso se reintenta.
 */
async function ensureCodes(userId: string, tenantIds: string[]) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.referralCode.findMany({ where: { userId, tenantId: { in: tenantIds } } });
    const missing = tenantIds.filter((id) => !existing.some((c) => c.tenantId === id));
    if (missing.length === 0) return existing;
    await prisma.referralCode.createMany({
      data: missing.map((tenantId) => ({ userId, tenantId, code: generateReferralCode() })),
      skipDuplicates: true,
    });
  }
  throw new AppError(500, 'REFERRAL_CODE_UNAVAILABLE', 'No se pudo generar tu código. Intenta de nuevo.');
}

export const referralsService = {
  /**
   * Por cada comercio con referidos activos: mi código, cómo va cada invitación y el bono ganado.
   * También informa si yo llegué invitado (`referredBy`) para mostrar "completa tu primera compra".
   */
  async getMine(userId: string | undefined) {
    const uid = requireUser(userId);
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true, referralEnabled: true, slug: { not: env.PLATFORM_TENANT_SLUG } },
      orderBy: { name: 'asc' },
      select: {
        id: true, slug: true, name: true, logoUrl: true, updatedAt: true,
        referrerBonusPoints: true, refereeBonusPoints: true, referralMaxPerUser: true,
      },
    });
    if (tenants.length === 0) return { tenants: [] };

    const tenantIds = tenants.map((t) => t.id);
    const [codes, made, joined, bonuses] = await Promise.all([
      ensureCodes(uid, tenantIds),
      prisma.referral.groupBy({
        by: ['tenantId', 'status'],
        where: { referrerId: uid, tenantId: { in: tenantIds } },
        _count: { _all: true },
      }),
      prisma.referral.findMany({
        where: { refereeId: uid, tenantId: { in: tenantIds } },
        select: { tenantId: true, status: true, referrer: { select: { fullName: true } } },
      }),
      prisma.pointEntry.groupBy({
        by: ['tenantId'],
        where: { userId: uid, type: 'REFERRAL_BONUS', tenantId: { in: tenantIds } },
        _sum: { points: true },
      }),
    ]);

    return {
      tenants: tenants.map((t) => {
        const count = (status: 'PENDING' | 'COMPLETED') =>
          made.find((m) => m.tenantId === t.id && m.status === status)?._count._all ?? 0;
        const pending = count('PENDING');
        const completed = count('COMPLETED');
        const mine = joined.find((j) => j.tenantId === t.id);
        return {
          tenantId: t.id,
          slug: t.slug,
          name: t.name,
          logoUrl: publicImageUrl('tenant', t.id, t.logoUrl, t.updatedAt),
          code: codes.find((c) => c.tenantId === t.id)!.code,
          referrerBonusPoints: t.referrerBonusPoints,
          refereeBonusPoints: t.refereeBonusPoints,
          maxReferrals: t.referralMaxPerUser,
          remainingInvites: Math.max(0, t.referralMaxPerUser - pending - completed),
          pending,
          completed,
          bonusEarned: bonuses.find((b) => b.tenantId === t.id)?._sum.points ?? 0,
          referredBy: mine ? { name: mine.referrer.fullName, status: mine.status } : null,
        };
      }),
    };
  },

  /**
   * Aplica un código de invitación. Solo para clientes nuevos en ese comercio (sin movimientos ni
   * compras escaneadas) y una sola vez por comercio. Queda PENDING hasta su primera compra promocional.
   * Bloquea el código del referente (`FOR UPDATE`) para que dos invitados a la vez no superen el tope.
   */
  async apply(userId: string | undefined, rawCode: string) {
    const uid = requireUser(userId);
    const code = normalizeReferralCode(rawCode);

    try {
      return await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM referral_codes WHERE code = ${code} FOR UPDATE`;
        if (locked.length === 0) throw REFERRAL_ERRORS.invalid();

        const ref = await tx.referralCode.findUniqueOrThrow({
          where: { id: locked[0].id },
          include: {
            tenant: {
              select: {
                id: true, name: true, isActive: true, referralEnabled: true,
                referrerBonusPoints: true, refereeBonusPoints: true, referralMaxPerUser: true,
              },
            },
            user: { select: { fullName: true, isActive: true } },
          },
        });
        const { tenant } = ref;
        if (!tenant.isActive || !ref.user.isActive) throw REFERRAL_ERRORS.invalid();
        if (!tenant.referralEnabled) throw REFERRAL_ERRORS.disabled();
        if (ref.userId === uid) throw REFERRAL_ERRORS.self();

        const [alreadyReferred, mutual, entries, scanned, used] = await Promise.all([
          tx.referral.count({ where: { tenantId: tenant.id, refereeId: uid } }),
          tx.referral.count({ where: { tenantId: tenant.id, referrerId: uid, refereeId: ref.userId } }),
          tx.pointEntry.count({ where: { tenantId: tenant.id, userId: uid } }),
          tx.purchaseClaim.count({ where: { tenantId: tenant.id, claimedById: uid } }),
          tx.referral.count({ where: { tenantId: tenant.id, referrerId: ref.userId } }),
        ]);
        if (alreadyReferred > 0) throw REFERRAL_ERRORS.alreadyReferred();
        if (mutual > 0) throw REFERRAL_ERRORS.mutual();
        if (entries > 0 || scanned > 0) throw REFERRAL_ERRORS.existingClient();
        if (used >= tenant.referralMaxPerUser) throw REFERRAL_ERRORS.limitReached();

        const referral = await tx.referral.create({
          data: { tenantId: tenant.id, referrerId: ref.userId, refereeId: uid, code: ref.code },
        });

        return {
          referralId: referral.id,
          status: referral.status,
          tenant: { id: tenant.id, name: tenant.name },
          referrerName: ref.user.fullName,
          refereeBonusPoints: tenant.refereeBonusPoints,
          referrerBonusPoints: tenant.referrerBonusPoints,
        };
      });
    } catch (e) {
      // Único (tenant, referido): otra petición simultánea del mismo cliente ganó.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw REFERRAL_ERRORS.alreadyReferred();
      throw e;
    }
  },

  /**
   * Liquida el referido PENDING del cliente en ese comercio con la compra `claimId`.
   * Se llama dentro de la transacción del claim: si algo falla, no se acredita ni la compra ni el bono.
   * Devuelve el bono del invitado, o null si no correspondía.
   */
  async settleOnClaim(
    tx: Prisma.TransactionClient,
    args: {
      userId: string;
      claimId: string;
      tenant: { id: string; referralEnabled: boolean; referrerBonusPoints: number; refereeBonusPoints: number };
      expiresAt: Date | null;
      now: Date;
    },
  ) {
    const { userId, claimId, tenant, expiresAt, now } = args;
    // Si el comercio apaga los referidos, las invitaciones pendientes esperan (no se pierden ni se pagan).
    if (!tenant.referralEnabled) return null;

    const referral = await tx.referral.findUnique({ where: { tenantId_refereeId: { tenantId: tenant.id, refereeId: userId } } });
    if (!referral || referral.status !== 'PENDING') return null;

    // Solo la primera compra lo completa, aunque lleguen dos claims a la vez.
    const marked = await tx.referral.updateMany({
      where: { id: referral.id, status: 'PENDING' },
      data: { status: 'COMPLETED', qualifyingClaimId: claimId, completedAt: now },
    });
    if (marked.count !== 1) return null;

    const bonuses = [
      { userId: referral.referrerId, points: tenant.referrerBonusPoints },
      { userId, points: tenant.refereeBonusPoints },
    ].filter((b) => b.points > 0);
    for (const b of bonuses) {
      await tx.pointEntry.create({
        data: {
          userId: b.userId, tenantId: tenant.id, type: 'REFERRAL_BONUS',
          points: b.points, remaining: b.points, expiresAt, referralId: referral.id,
        },
      });
    }

    return {
      referralId: referral.id,
      points: tenant.refereeBonusPoints,
      referrerPoints: tenant.referrerBonusPoints,
    };
  },
};
