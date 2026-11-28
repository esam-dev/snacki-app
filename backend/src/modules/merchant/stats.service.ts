import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../common/errors/app-error.js';

function requireTenantId(tenantId: string | undefined): string {
  if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'No autenticado');
  return tenantId;
}

export const STATS_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<Exclude<StatsRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

export const REDEMPTIONS_DEFAULT_LIMIT = 30;

/** Desde cuándo cuenta el período; `undefined` = desde siempre. */
function rangeStart(range: StatsRange, now = new Date()): Date | undefined {
  return range === 'all' ? undefined : new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS);
}

export const merchantStatsService = {
  /**
   * Canjes del comercio, del más reciente al más antiguo. Paginado por cursor (`before` = id del último
   * canje recibido). Del cliente solo se expone el nombre: es lo que el comercio necesita para entregar.
   */
  async listRedemptions(tenantId: string | undefined, opts: { limit?: number; before?: string } = {}) {
    const tid = requireTenantId(tenantId);
    const limit = opts.limit ?? REDEMPTIONS_DEFAULT_LIMIT;

    if (opts.before) {
      const exists = await prisma.redemption.findFirst({ where: { id: opts.before, tenantId: tid }, select: { id: true } });
      if (!exists) throw new AppError(400, 'INVALID_CURSOR', 'Cursor inválido');
    }

    const rows = await prisma.redemption.findMany({
      where: { tenantId: tid },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
      select: {
        id: true, code: true, cost: true, status: true, createdAt: true, deliveredAt: true,
        reward: { select: { id: true, name: true } },
        user: { select: { fullName: true } },
      },
    });

    const page = rows.slice(0, limit);
    return {
      redemptions: page.map((r) => ({
        id: r.id,
        code: r.code,
        cost: r.cost,
        status: r.status,
        createdAt: r.createdAt,
        deliveredAt: r.deliveredAt,
        reward: r.reward,
        customerName: r.user.fullName,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  },

  /**
   * Métricas del comercio en el período: puntos, canjes, clientes (únicos y recurrentes = 2+ compras
   * escaneadas), la promo más escaneada y el embudo de referidos. Todo acotado al propio comercio.
   */
  async getStats(tenantId: string | undefined, range: StatsRange = '30d') {
    const tid = requireTenantId(tenantId);
    const since = rangeStart(range);
    const createdIn = since ? { gte: since } : undefined;
    const claimedIn = since ? { gte: since } : { not: null };

    const [earned, bonus, redeemed, buyers, topProducts, referralsByStatus, referralsCompleted] = await Promise.all([
      prisma.pointEntry.aggregate({ where: { tenantId: tid, type: 'EARN', createdAt: createdIn }, _sum: { points: true } }),
      prisma.pointEntry.aggregate({ where: { tenantId: tid, type: 'REFERRAL_BONUS', createdAt: createdIn }, _sum: { points: true } }),
      prisma.redemption.aggregate({ where: { tenantId: tid, createdAt: createdIn }, _count: { _all: true }, _sum: { cost: true } }),
      prisma.purchaseClaim.groupBy({
        by: ['claimedById'],
        where: { tenantId: tid, claimedById: { not: null }, claimedAt: claimedIn },
        _count: { _all: true },
      }),
      prisma.purchaseClaim.groupBy({
        by: ['productId'],
        where: { tenantId: tid, claimedAt: claimedIn },
        _count: { productId: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 1,
      }),
      prisma.referral.groupBy({ by: ['status'], where: { tenantId: tid, createdAt: createdIn }, _count: { _all: true } }),
      prisma.referral.count({ where: { tenantId: tid, status: 'COMPLETED', completedAt: createdIn } }),
    ]);

    const top = topProducts[0];
    const topProduct = top
      ? await prisma.product.findUnique({ where: { id: top.productId }, select: { id: true, name: true } })
      : null;

    const invited = (status: 'PENDING' | 'COMPLETED') => referralsByStatus.find((r) => r.status === status)?._count._all ?? 0;
    const pending = invited('PENDING');
    const convertedOfInvited = invited('COMPLETED');
    const totalInvited = pending + convertedOfInvited;

    return {
      range,
      since: since ?? null,
      pointsIssued: earned._sum.points ?? 0,
      redemptions: redeemed._count._all,
      pointsRedeemed: redeemed._sum.cost ?? 0,
      purchases: buyers.reduce((n, b) => n + b._count._all, 0),
      uniqueCustomers: buyers.length,
      returningCustomers: buyers.filter((b) => b._count._all >= 2).length,
      topPromo: topProduct && top ? { ...topProduct, scans: top._count.productId } : null,
      referrals: {
        /** Invitados en el período que todavía no hacen su primera compra. */
        pending,
        /** Clientes nuevos que llegaron por un referido y completaron su primera compra en el período. */
        completed: referralsCompleted,
        bonusIssued: bonus._sum.points ?? 0,
        /** De los invitados en el período, qué fracción ya compró (0–1); null si no hubo invitados. */
        conversion: totalInvited ? convertedOfInvited / totalInvited : null,
      },
    };
  },
};
