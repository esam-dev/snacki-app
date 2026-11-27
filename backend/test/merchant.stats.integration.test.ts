import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

async function dbAvailable() {
  if (!process.env.DATABASE_URL) return false;
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

const ready = await dbAvailable();
const DAY = 86_400_000;
/** Los fixtures son ~25 inserts secuenciales; contra una base remota superan los 10 s por defecto. */
const HOOK_TIMEOUT = 60_000;

/**
 * Lista de canjes y estadísticas del comercio contra la base real, en dos comercios de prueba propios
 * (se borran al final): métricas por período, recompra, promo más escaneada, embudo de referidos,
 * paginación y aislamiento entre comercios.
 */
describe.skipIf(!ready)('canjes y estadísticas del comercio (integración, DB real)', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
  let signAccessToken: typeof import('../src/lib/jwt.js').signAccessToken;
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  let tenantId: string;
  let otherTenantId: string;
  let merchantToken: string;
  let otherMerchantToken: string;
  let clientToken: string;
  let recentRedemptionId: string;
  let oldRedemptionId: string;
  let otherRedemptionId: string;

  const ago = (days: number) => new Date(Date.now() - days * DAY);
  const get = (url: string, token = merchantToken) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  async function newUser(name: string) {
    const user = await prisma.user.create({
      data: { email: `stats-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@snacki.test`, fullName: `[test] ${name}`, passwordHash: 'x' },
    });
    userIds.push(user.id);
    return user;
  }

  async function newMerchant(name: string) {
    const tenant = await prisma.tenant.create({ data: { name: `[test] ${name}`, slug: `test-stats-${name}-${Date.now()}` } });
    tenantIds.push(tenant.id);
    const user = await newUser(`comercio-${name}`);
    await prisma.userTenantRoleMap.create({ data: { userId: user.id, tenantId: tenant.id, role: 'comercio' } });
    return { tenant, user, token: signAccessToken({ sub: user.id, email: user.email, role: 'comercio', tenantId: tenant.id }) };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ signAccessToken } = await import('../src/lib/jwt.js'));
    const { buildApp } = await import('../src/app.js');
    app = await buildApp();

    const main = await newMerchant('principal');
    const other = await newMerchant('otro');
    tenantId = main.tenant.id;
    otherTenantId = other.tenant.id;
    merchantToken = main.token;
    otherMerchantToken = other.token;

    const [ana, beto, caro] = [await newUser('ana'), await newUser('beto'), await newUser('caro')];
    clientToken = signAccessToken({ sub: ana.id, email: ana.email, role: 'cliente', tenantId });

    const promo = (name: string, tid = tenantId) => prisma.product.create({
      data: { tenantId: tid, name, points: 100, promoStartsAt: ago(60), promoEndsAt: new Date(Date.now() + DAY) },
    });
    const [burger, fries] = [await promo('[test] burger'), await promo('[test] papas')];
    const reward = await prisma.reward.create({ data: { tenantId, name: '[test] bebida', cost: 150 } });

    const scan = (productId: string, userId: string | null, claimedAt: Date | null) => prisma.purchaseClaim.create({
      data: { tenantId, productId, points: 100, expiresAt: new Date(Date.now() + DAY), createdById: main.user.id, claimedById: userId, claimedAt, createdAt: claimedAt ?? new Date() },
    });
    // Últimos 30 días: Ana compra 2 veces (recurrente), Beto 1. Caro compró hace 40 días. Un QR sin escanear no cuenta.
    await scan(burger.id, ana.id, ago(2));
    await scan(burger.id, ana.id, ago(1));
    await scan(burger.id, beto.id, ago(3));
    await scan(fries.id, caro.id, ago(40));
    await scan(fries.id, null, null);

    const entry = (userId: string, type: 'EARN' | 'REFERRAL_BONUS', points: number, createdAt: Date) =>
      prisma.pointEntry.create({ data: { userId, tenantId, type, points, remaining: points, createdAt } });
    await entry(ana.id, 'EARN', 100, ago(2));
    await entry(ana.id, 'EARN', 100, ago(1));
    await entry(beto.id, 'EARN', 100, ago(3));
    await entry(caro.id, 'EARN', 50, ago(40));
    await entry(ana.id, 'REFERRAL_BONUS', 30, ago(3));

    const redemption = (tid: string, userId: string, rewardId: string, cost: number, createdAt: Date) => prisma.redemption.create({
      data: { tenantId: tid, userId, rewardId, cost, code: randomUUID().slice(0, 8).toUpperCase(), status: 'DELIVERED', deliveredAt: createdAt, createdAt },
    });
    recentRedemptionId = (await redemption(tenantId, ana.id, reward.id, 150, ago(1))).id;
    oldRedemptionId = (await redemption(tenantId, caro.id, reward.id, 40, ago(40))).id;

    // Referidos: Ana invitó a Beto (ya compró) y a Caro (todavía no).
    await prisma.referral.create({ data: { tenantId, referrerId: ana.id, refereeId: beto.id, code: 'TESTAAAA', status: 'COMPLETED', createdAt: ago(5), completedAt: ago(3) } });
    await prisma.referral.create({ data: { tenantId, referrerId: ana.id, refereeId: caro.id, code: 'TESTAAAA', status: 'PENDING', createdAt: ago(4) } });

    // Otro comercio con su propio canje: no debe aparecer en el principal.
    const otherReward = await prisma.reward.create({ data: { tenantId: otherTenantId, name: '[test] otro', cost: 10 } });
    otherRedemptionId = (await redemption(otherTenantId, ana.id, otherReward.id, 10, ago(1))).id;
  }, HOOK_TIMEOUT);

  afterAll(async () => {
    if (!prisma) return;
    await app?.close();
    if (tenantIds.length) {
      const where = { tenantId: { in: tenantIds } };
      await prisma.redemption.deleteMany({ where });
      await prisma.pointEntry.deleteMany({ where });
      await prisma.referral.deleteMany({ where });
      await prisma.purchaseClaim.deleteMany({ where });
      await prisma.product.deleteMany({ where });
      await prisma.reward.deleteMany({ where });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, HOOK_TIMEOUT);

  it('resume los últimos 30 días por defecto', async () => {
    const res = await get('/api/merchant/stats');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      range: '30d',
      pointsIssued: 300,
      redemptions: 1,
      pointsRedeemed: 150,
      purchases: 3,
      uniqueCustomers: 2,
      returningCustomers: 1,
      topPromo: { name: '[test] burger', scans: 3 },
      referrals: { pending: 1, completed: 1, bonusIssued: 30, conversion: 0.5 },
    });
  });

  it('con range=all incluye todo el historial', async () => {
    const res = await get('/api/merchant/stats?range=all');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      range: 'all', since: null, pointsIssued: 350, redemptions: 2, pointsRedeemed: 190,
      purchases: 4, uniqueCustomers: 3, returningCustomers: 1, topPromo: { name: '[test] burger' },
    });
  });

  it('un comercio sin actividad recibe ceros, sin promo top ni conversión', async () => {
    const res = await get('/api/merchant/stats', otherMerchantToken);
    expect(res.json().data).toMatchObject({
      pointsIssued: 0, purchases: 0, uniqueCustomers: 0, returningCustomers: 0, topPromo: null,
      redemptions: 1, referrals: { pending: 0, completed: 0, bonusIssued: 0, conversion: null },
    });
  });

  it('rechaza un período desconocido', async () => {
    expect((await get('/api/merchant/stats?range=1y')).statusCode).toBe(400);
  });

  it('lista los canjes propios del más reciente al más antiguo, con el nombre del cliente', async () => {
    const res = await get('/api/merchant/redemptions');
    expect(res.statusCode).toBe(200);
    const { redemptions, nextCursor } = res.json().data as { redemptions: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(redemptions.map((r) => r.id)).toEqual([recentRedemptionId, oldRedemptionId]);
    expect(redemptions[0]).toMatchObject({ cost: 150, status: 'DELIVERED', customerName: '[test] ana', reward: { name: '[test] bebida' } });
    expect(redemptions[0]).not.toHaveProperty('email');
    expect(nextCursor).toBeNull();
  });

  it('pagina con cursor', async () => {
    const first = (await get('/api/merchant/redemptions?limit=1')).json().data;
    expect(first.redemptions.map((r: { id: string }) => r.id)).toEqual([recentRedemptionId]);
    expect(first.nextCursor).toBe(recentRedemptionId);

    const second = (await get(`/api/merchant/redemptions?limit=1&before=${first.nextCursor}`)).json().data;
    expect(second.redemptions.map((r: { id: string }) => r.id)).toEqual([oldRedemptionId]);
    expect(second.nextCursor).toBeNull();
  });

  it('no deja usar como cursor un canje de otro comercio', async () => {
    const res = await get(`/api/merchant/redemptions?before=${otherRedemptionId}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_CURSOR');
  });

  it('cada comercio ve solo sus canjes', async () => {
    const res = await get('/api/merchant/redemptions', otherMerchantToken);
    expect(res.json().data.redemptions.map((r: { id: string }) => r.id)).toEqual([otherRedemptionId]);
  });

  it('un cliente no puede ver canjes ni estadísticas del comercio', async () => {
    expect((await get('/api/merchant/redemptions', clientToken)).statusCode).toBe(403);
    expect((await get('/api/merchant/stats', clientToken)).statusCode).toBe(403);
  });
});
