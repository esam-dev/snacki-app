import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { QrTokenError, verifyRedeemToken } from '../../lib/qr-token.js';
import { SPENDABLE_TYPES } from '../wallet/spendable.js';

export const REDEEM_ERRORS = {
  invalid: () => new AppError(400, 'QR_INVALID', 'Este QR de canje no es válido.'),
  used: () => new AppError(409, 'QR_ALREADY_USED', 'Este QR de canje ya fue usado.'),
  expired: () => new AppError(410, 'QR_EXPIRED', 'Este QR de canje venció. Pide uno nuevo en el local.'),
  unavailable: () => new AppError(410, 'REWARD_UNAVAILABLE', 'Esta recompensa ya no está disponible.'),
  insufficient: (missing: number) =>
    new AppError(409, 'INSUFFICIENT_POINTS', `Te faltan ${missing.toLocaleString('es')} puntos en este comercio para esta recompensa.`),
};

/** Alfabeto sin caracteres ambiguos (0/O, 1/I) para el código que ve el comercio. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function redemptionCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

function parseToken(token: string): string {
  try {
    return verifyRedeemToken(token).claimId;
  } catch (e) {
    if (e instanceof QrTokenError && e.reason === 'expired') throw REDEEM_ERRORS.expired();
    throw REDEEM_ERRORS.invalid();
  }
}

function requireUser(userId: string | undefined): string {
  if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  return userId;
}

/** Saldo vigente del cliente en un comercio (EARN y bonos de referido no vencidos). */
async function balanceOf(db: Prisma.TransactionClient | typeof prisma, userId: string, tenantId: string, now: Date) {
  const agg = await db.pointEntry.aggregate({
    where: { userId, tenantId, type: { in: [...SPENDABLE_TYPES] }, remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    _sum: { remaining: true },
  });
  return agg._sum.remaining ?? 0;
}

/**
 * Canje de recompensas. Solo se puede gastar saldo escaneando el QR de canje que genera el comercio,
 * así el cliente tiene que estar en el local. Garantías:
 * 1. Firma `R1` válida y no vencida (un QR de compra no sirve como canje).
 * 2. Un solo uso: `UPDATE ... WHERE claimed_at IS NULL` + `redemption_id` único.
 * 3. Sin doble gasto: las entradas de puntos del cliente en ese comercio se bloquean (`FOR UPDATE`)
 *    antes de calcular el saldo, así dos canjes simultáneos no pueden usar los mismos puntos.
 * 4. Se descuentan primero los puntos que vencen antes (FIFO por vencimiento).
 * Todo en una transacción: si falta saldo no se marca el QR ni se toca ningún punto.
 */
export const redemptionsService = {
  /** Lo que el cliente ve antes de confirmar: recompensa, costo y su saldo en ese comercio. */
  async preview(userId: string | undefined, token: string) {
    const uid = requireUser(userId);
    const qrId = parseToken(token);
    const now = new Date();
    const qr = await prisma.redemptionClaim.findUnique({
      where: { id: qrId },
      include: {
        tenant: { select: { id: true, slug: true, name: true, isActive: true } },
        reward: { select: { id: true, name: true, description: true, isActive: true, deletedAt: true } },
      },
    });
    if (!qr || !qr.tenant.isActive) throw REDEEM_ERRORS.invalid();
    if (qr.claimedAt) throw REDEEM_ERRORS.used();
    if (qr.expiresAt <= now) throw REDEEM_ERRORS.expired();
    if (!qr.reward.isActive || qr.reward.deletedAt) throw REDEEM_ERRORS.unavailable();

    const balance = await balanceOf(prisma, uid, qr.tenantId, now);
    return {
      reward: { id: qr.reward.id, name: qr.reward.name, description: qr.reward.description },
      tenant: { id: qr.tenant.id, slug: qr.tenant.slug, name: qr.tenant.name },
      cost: qr.cost,
      balance,
      enough: balance >= qr.cost,
      expiresAt: qr.expiresAt,
    };
  },

  async redeem(userId: string | undefined, token: string) {
    const uid = requireUser(userId);
    const qrId = parseToken(token);

    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const qr = await tx.redemptionClaim.findUnique({
          where: { id: qrId },
          include: {
            tenant: { select: { id: true, name: true, isActive: true } },
            reward: { select: { id: true, name: true, isActive: true, deletedAt: true } },
          },
        });
        if (!qr || !qr.tenant.isActive) throw REDEEM_ERRORS.invalid();
        if (qr.claimedAt) throw REDEEM_ERRORS.used();
        if (qr.expiresAt <= now) throw REDEEM_ERRORS.expired();
        if (!qr.reward.isActive || qr.reward.deletedAt) throw REDEEM_ERRORS.unavailable();

        // Bloquea los puntos vigentes del cliente en este comercio, en el orden en que se consumen.
        const entries = await tx.$queryRaw<Array<{ id: string; remaining: number }>>`
          SELECT id, remaining FROM point_entries
          WHERE user_id = ${uid}::uuid AND tenant_id = ${qr.tenantId}::uuid
            AND type IN ('EARN', 'REFERRAL_BONUS') AND remaining > 0 AND (expires_at IS NULL OR expires_at > ${now})
          ORDER BY expires_at ASC NULLS LAST, created_at ASC
          FOR UPDATE`;

        const marked = await tx.redemptionClaim.updateMany({
          where: { id: qr.id, claimedAt: null, expiresAt: { gt: now } },
          data: { claimedAt: now, claimedById: uid },
        });
        if (marked.count !== 1) throw REDEEM_ERRORS.used(); // otro escaneo ganó la carrera

        const balance = entries.reduce((sum, e) => sum + e.remaining, 0);
        if (balance < qr.cost) throw REDEEM_ERRORS.insufficient(qr.cost - balance);

        let left = qr.cost;
        for (const e of entries) {
          if (left <= 0) break;
          const take = Math.min(e.remaining, left);
          await tx.pointEntry.update({ where: { id: e.id }, data: { remaining: { decrement: take } } });
          left -= take;
        }

        const redemption = await tx.redemption.create({
          data: {
            userId: uid, tenantId: qr.tenantId, rewardId: qr.rewardId, code: redemptionCode(),
            cost: qr.cost, status: 'DELIVERED', deliveredAt: now,
          },
        });
        await tx.redemptionClaim.update({ where: { id: qr.id }, data: { redemptionId: redemption.id } });
        await tx.pointEntry.create({
          data: { userId: uid, tenantId: qr.tenantId, type: 'REDEEM', points: qr.cost, remaining: 0, rewardId: qr.rewardId },
        });

        return {
          redemptionId: redemption.id,
          code: redemption.code,
          cost: qr.cost,
          reward: { id: qr.reward.id, name: qr.reward.name },
          tenant: { id: qr.tenant.id, name: qr.tenant.name },
          balance: balance - qr.cost,
          redeemedAt: now,
        };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw REDEEM_ERRORS.used();
      throw e;
    }
  },
};
