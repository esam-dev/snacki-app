import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Canje de recompensas solo vía QR del comercio, contra la base real: un solo uso, sin doble gasto,
 * FIFO por vencimiento y sin tocar nada si falta saldo. Usa un cliente propio y limpia al final.
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
const DAY = 86_400_000;

describe.skipIf(!ready)('canje con QR (integración, DB real)', () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
  let signAccessToken: typeof import('../src/lib/jwt.js').signAccessToken;
  let tenantId: string;
  let merchantUserId: string;
  let clientId: string;
  let clientToken: string;
  let merchantToken: string;
  let rewardId: string;
  let expensiveRewardId: string;
  let soonEntryId: string;
  let laterEntryId: string;
  const qrIds: string[] = [];

  const asClient = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${clientToken}` }, payload: payload as object });

  async function redeemQr(id = rewardId) {
    const res = await app.inject({ method: 'POST', url: '/api/merchant/redeem-qr', headers: { authorization: `Bearer ${merchantToken}` }, payload: { rewardId: id } });
    expect(res.statusCode).toBe(201);
    const data = res.json().data as { qrId: string; qrContent: string; cost: number };
    qrIds.push(data.qrId);
    return data;
  }

  async function remaining(id: string) {
    return (await prisma.pointEntry.findUniqueOrThrow({ where: { id } })).remaining;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ signAccessToken } = await import('../src/lib/jwt.js'));
    const { buildApp } = await import('../src/app.js');
    app = await buildApp();

    const merchant = await prisma.userTenantRoleMap.findFirstOrThrow({ where: { role: 'comercio', user: { email: 'comercio@snacki.demo' } } });
    tenantId = merchant.tenantId;
    merchantUserId = merchant.userId;
    merchantToken = signAccessToken({ sub: merchantUserId, email: 'comercio@snacki.demo', role: 'comercio', tenantId });

    const client = await prisma.user.create({ data: { email: `redeem-test-${Date.now()}@snacki.test`, fullName: '[test] canje', passwordHash: 'x' } });
    clientId = client.id;
    clientToken = signAccessToken({ sub: clientId, email: client.email, role: 'cliente', tenantId });

    rewardId = (await prisma.reward.create({ data: { tenantId, name: '[test] papas', cost: 300 } })).id;
    expensiveRewardId = (await prisma.reward.create({ data: { tenantId, name: '[test] combo', cost: 5000 } })).id;

    // 200 pts que vencen pronto + 500 que vencen después + 100 ya vencidos (no cuentan).
    soonEntryId = (await prisma.pointEntry.create({ data: { userId: clientId, tenantId, type: 'EARN', points: 200, remaining: 200, expiresAt: new Date(Date.now() + 5 * DAY) } })).id;
    laterEntryId = (await prisma.pointEntry.create({ data: { userId: clientId, tenantId, type: 'EARN', points: 500, remaining: 500, expiresAt: new Date(Date.now() + 60 * DAY) } })).id;
    await prisma.pointEntry.create({ data: { userId: clientId, tenantId, type: 'EARN', points: 100, remaining: 100, expiresAt: new Date(Date.now() - DAY) } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await app?.close();
    await prisma.redemptionClaim.deleteMany({ where: { id: { in: qrIds } } });
    if (clientId) await prisma.user.delete({ where: { id: clientId } }).catch(() => undefined);
    await prisma.reward.deleteMany({ where: { id: { in: [rewardId, expensiveRewardId].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it('la vista previa muestra recompensa, costo y saldo sin descontar nada', async () => {
    const qr = await redeemQr();
    const res = await asClient('/api/redemptions/preview', { token: qr.qrContent });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ cost: 300, balance: 700, enough: true, reward: { name: '[test] papas' } });
    expect(await remaining(soonEntryId)).toBe(200);
  });

  it('canjea una sola vez y descuenta primero los puntos que vencen antes', async () => {
    const qr = await redeemQr();
    const res = await asClient('/api/redemptions', { token: qr.qrContent });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ cost: 300, balance: 400, reward: { name: '[test] papas' } });
    expect(res.json().data.code).toMatch(/^[A-Z2-9]{8}$/);

    expect(await remaining(soonEntryId)).toBe(0);
    expect(await remaining(laterEntryId)).toBe(400);
    expect(await prisma.pointEntry.count({ where: { userId: clientId, type: 'REDEEM' } })).toBe(1);

    const again = await asClient('/api/redemptions', { token: qr.qrContent });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('QR_ALREADY_USED');
    expect(await remaining(laterEntryId)).toBe(400);

    // El comercio ve que se canjeó y a quién entregarle.
    const status = await app.inject({ method: 'GET', url: `/api/merchant/redeem-qr/${qr.qrId}`, headers: { authorization: `Bearer ${merchantToken}` } });
    expect(status.json().data).toMatchObject({ status: 'claimed', customerName: '[test] canje', code: res.json().data.code });
  });

  it('sin saldo suficiente no toca puntos y el QR sigue sin usar', async () => {
    const qr = await redeemQr(expensiveRewardId);
    const res = await asClient('/api/redemptions', { token: qr.qrContent });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INSUFFICIENT_POINTS');
    expect(await remaining(laterEntryId)).toBe(400);
    expect((await prisma.redemptionClaim.findUniqueOrThrow({ where: { id: qr.qrId } })).claimedAt).toBeNull();
  });

  it('dos canjes simultáneos con saldo para uno solo: exactamente uno pasa', async () => {
    // Saldo 400: dos QR de 300 a la vez.
    const [a, b] = [await redeemQr(), await redeemQr()];
    const results = await Promise.all([asClient('/api/redemptions', { token: a.qrContent }), asClient('/api/redemptions', { token: b.qrContent })]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409]);
    expect(await remaining(laterEntryId)).toBe(100);
  });

  it('un QR de compra no sirve para canjear ni un QR de canje para sumar puntos', async () => {
    const qr = await redeemQr();
    const asPurchase = await asClient('/api/claims', { token: qr.qrContent });
    expect(asPurchase.statusCode).toBe(400);

    const { merchantService } = await import('../src/modules/merchant/merchant.service.js');
    const product = await prisma.product.create({
      data: { tenantId, name: '[test] promo canje', points: 10, promoStartsAt: new Date(Date.now() - 60_000), promoEndsAt: new Date(Date.now() + DAY) },
    });
    try {
      const purchase = await merchantService.createQr(tenantId, merchantUserId, { productId: product.id, quantity: 1 });
      const asRedeem = await asClient('/api/redemptions', { token: purchase.qrContent });
      expect(asRedeem.statusCode).toBe(400);
      await prisma.purchaseClaim.delete({ where: { id: purchase.claimId } });
    } finally {
      await prisma.product.delete({ where: { id: product.id } });
    }
  });

  it('un QR de canje anulado por el comercio ya no se puede usar', async () => {
    const qr = await redeemQr();
    const voided = await app.inject({ method: 'POST', url: `/api/merchant/redeem-qr/${qr.qrId}/void`, headers: { authorization: `Bearer ${merchantToken}` }, payload: {} });
    expect(voided.statusCode).toBe(200);
    const res = await asClient('/api/redemptions', { token: qr.qrContent });
    expect(res.statusCode).toBe(410);
  });

  it('una cuenta de comercio no puede canjear', async () => {
    const qr = await redeemQr();
    const res = await app.inject({ method: 'POST', url: '/api/redemptions', headers: { authorization: `Bearer ${merchantToken}` }, payload: { token: qr.qrContent } });
    expect(res.statusCode).toBe(403);
  });
});
