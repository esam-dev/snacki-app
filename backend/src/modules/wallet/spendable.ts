import type { PointEntryType } from '@prisma/client';

/** Movimientos que suman saldo y se pueden gastar: compras y bonos de referido (vencen igual). */
export const SPENDABLE_TYPES = ['EARN', 'REFERRAL_BONUS'] as const satisfies readonly PointEntryType[];
