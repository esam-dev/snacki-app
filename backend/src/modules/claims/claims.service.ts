import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { QrTokenError, verifyQrToken } from '../../lib/qr-token.js';

export const CLAIM_ERRORS = {
  invalid: () => new AppError(400, 'QR_INVALID', 'Este QR no es válido.'),
  used: () => new AppError(409, 'QR_ALREADY_USED', 'Este QR ya fue usado.'),
  expired: () => new AppError(410, 'QR_EXPIRED', 'Este QR venció. Pide uno nuevo en el local.'),
  ownQr: () => new AppError(403, 'QR_OWN', 'No puedes sumar puntos con un QR que generaste tú.'),
};

/**
 * Canje de un QR de compra. Garantías:
 * 1. Firma HMAC válida y no vencida (rechaza QR inventados o editados).
 * 2. Un solo uso aunque lleguen dos escaneos a la vez: el `UPDATE ... WHERE claimed_at IS NULL`
 *    es atómico en Postgres (el segundo espera el bloqueo de fila y no encuentra nada que actualizar).
 * 3. Segunda barrera: `point_entries.claim_id` es único, así que nunca puede haber dos EARN por QR.
 * 4. Los puntos salen del claim guardado en el servidor, no del contenido del QR.
 * Todo corre en una transacción: o se marca usado y se acreditan los puntos, o no pasa nada.
 */
export const claimsService = {
  async redeem(userId: string | undefined, token: string) {
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');

    let claimId: string;
    try {
      ({ claimId } = verifyQrToken(token));
    } catch (e) {
      if (e instanceof QrTokenError && e.reason === 'expired') throw CLAIM_ERRORS.expired();
      throw CLAIM_ERRORS.invalid();
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const claim = await tx.purchaseClaim.findUnique({
          where: { id: claimId },
          include: {
            tenant: { select: { id: true, name: true, pointsExpireAt: true, isActive: true } },
            product: { select: { id: true, name: true } },
          },
        });
        const now = new Date();
        if (!claim || !claim.tenant.isActive) throw CLAIM_ERRORS.invalid();
        if (claim.claimedAt) throw CLAIM_ERRORS.used();
        if (claim.expiresAt <= now) throw CLAIM_ERRORS.expired();
        if (claim.createdById === userId) throw CLAIM_ERRORS.ownQr();

        const marked = await tx.purchaseClaim.updateMany({
          where: { id: claimId, claimedAt: null, expiresAt: { gt: now } },
          data: { claimedAt: now, claimedById: userId },
        });
        if (marked.count !== 1) throw CLAIM_ERRORS.used(); // otro escaneo ganó la carrera

        // Vencimiento de los puntos: el que fija el comercio (si está en el futuro).
        const pointsExpireAt = claim.tenant.pointsExpireAt && claim.tenant.pointsExpireAt > now ? claim.tenant.pointsExpireAt : null;
        const entry = await tx.pointEntry.create({
          data: {
            userId,
            tenantId: claim.tenantId,
            type: 'EARN',
            points: claim.points,
            remaining: claim.points,
            expiresAt: pointsExpireAt,
            claimId: claim.id,
          },
        });

        return {
          claimId: claim.id,
          points: claim.points,
          quantity: claim.quantity,
          tenant: { id: claim.tenant.id, name: claim.tenant.name },
          product: claim.product,
          pointsExpireAt: entry.expiresAt,
          claimedAt: now,
        };
      });
    } catch (e) {
      // Violación de unicidad en point_entries.claim_id: el QR ya se acreditó.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw CLAIM_ERRORS.used();
      throw e;
    }
  },
};
