import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Wallet del cliente contra la base real: escanear QR → saldo del comercio sube, el de otro no cambia,
 * los vencidos no cuentan y los movimientos describen la compra. Usa un cliente propio y limpia al final.
 */
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

describe.skipIf(!ready)('wallet del cliente (integración, DB real)', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
  let signAccessToken: typeof import('../src/lib/jwt.js').signAccessToken;
  let merchantService: typeof import('../src/modules/merchant/merchant.service.js').merchantService;
  let tenantId: string;
  let otherTenantId: string;
  let merchantUserId: string;
  let clientId: string;
  let productId: string;
  let clientToken: string;
  const claimIds: string[] = [];

  async function getWallet() {
    const res = await app.inject({ method: 'GET', url: '/api/wallet', headers: { authorization: `Bearer ${clientToken}` } });
    expect(res.statusCode).toBe(200);
    return res.json().data as { totalPoints: number; tenants: Array<{ tenantId: string; balance: number; nextExpiresAt: string | null; nextReward: { missing: number } | null }> };
  }

  async function redeem(token: string) {
    return app.inject({ method: 'POST', url: '/api/claims', headers: { authorization: `Bearer ${clientToken}` }, payload: { token } });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ signAccessToken } = await import('../src/lib/jwt.js'));
    ({ merchantService } = await import('../src/modules/merchant/merchant.service.js'));
    const { buildApp } = await import('../src/app.js');
    app = await buildApp();

    const merchant = await prisma.userTenantRoleMap.findFirstOrThrow({ where: { role: 'comercio', user: { email: 'comercio@snacki.demo' } } });
    tenantId = merchant.tenantId;
    merchantUserId = merchant.userId;
    const other = await prisma.tenant.findFirstOrThrow({ where: { id: { not: tenantId }, isActive: true, slug: { not: process.env.PLATFORM_TENANT_SLUG ?? 'snacki' } } });
    otherTenantId = other.id;

    const client = await prisma.user.create({
      data: { email: `wallet-test-${Date.now()}@snacki.test`, fullName: '[test] wallet', passwordHash: 'x' },
    });
    clientId = client.id;
    clientToken = signAccessToken({ sub: clientId, email: client.email, role: 'cliente', tenantId: otherTenantId });

    const product = await prisma.product.create({
      data: {
        tenantId,
        name: '[test] promo wallet',
        points: 120,
        promoStartsAt: new Date(Date.now() - 60_000),
        promoEndsAt: new Date(Date.now() + 86_400_000),
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await app?.close();
    if (clientId) await prisma.user.delete({ where: { id: clientId } }).catch(() => undefined);
    await prisma.purchaseClaim.deleteMany({ where: { id: { in: claimIds } } });
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('cliente nuevo: saldo 0 en todos los comercios', async () => {
    const wallet = await getWallet();
    expect(wallet.totalPoints).toBe(0);
    expect(wallet.tenants.length).toBeGreaterThan(1);
    expect(wallet.tenants.every((t) => t.balance === 0)).toBe(true);
  });

  it('escanear un QR sube el saldo de ese comercio y no el de otro', async () => {
    const qr = await merchantService.createQr(tenantId, merchantUserId, { productId, quantity: 2 });
    claimIds.push(qr.claimId);
    const res = await redeem(qr.qrContent);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.points).toBe(240);

    const wallet = await getWallet();
    expect(wallet.totalPoints).toBe(240);
    expect(wallet.tenants.find((t) => t.tenantId === tenantId)?.balance).toBe(240);
    expect(wallet.tenants.find((t) => t.tenantId === otherTenantId)?.balance).toBe(0);

    // El mismo QR otra vez: 409 y el saldo no cambia.
    expect((await redeem(qr.qrContent)).statusCode).toBe(409);
    expect((await getWallet()).totalPoints).toBe(240);
  });

  it('los puntos vencidos no cuentan y aparecen marcados en movimientos', async () => {
    await prisma.pointEntry.create({
      data: { userId: clientId, tenantId: otherTenantId, type: 'EARN', points: 500, remaining: 500, expiresAt: new Date(Date.now() - 1000) },
    });
    const wallet = await getWallet();
    expect(wallet.tenants.find((t) => t.tenantId === otherTenantId)?.balance).toBe(0);

    const res = await app.inject({ method: 'GET', url: '/api/wallet/movements', headers: { authorization: `Bearer ${clientToken}` } });
    expect(res.statusCode).toBe(200);
    const movements = res.json().data.movements as Array<{ tenantId: string; description: string; points: number; expired: boolean; type: string }>;
    expect(movements).toHaveLength(2);
    expect(movements.find((m) => m.tenantId === otherTenantId)).toMatchObject({ expired: true, points: 500 });
    expect(movements.find((m) => m.tenantId === tenantId)).toMatchObject({ type: 'EARN', points: 240, expired: false, description: '2 × [test] promo wallet' });
  });

  it('movimientos filtrados por comercio', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/wallet/${tenantId}/movements`, headers: { authorization: `Bearer ${clientToken}` } });
    expect(res.statusCode).toBe(200);
    const movements = res.json().data.movements as Array<{ tenantId: string }>;
    expect(movements).toHaveLength(1);
    expect(movements[0].tenantId).toBe(tenantId);
  });

  it('una cuenta de comercio no tiene wallet (403) y sin token es 401', async () => {
    const merchantToken = signAccessToken({ sub: merchantUserId, email: 'comercio@snacki.demo', role: 'comercio', tenantId });
    expect((await app.inject({ method: 'GET', url: '/api/wallet', headers: { authorization: `Bearer ${merchantToken}` } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/wallet' })).statusCode).toBe(401);
  });
});
