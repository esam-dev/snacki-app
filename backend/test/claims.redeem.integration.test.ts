import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Canje de QR contra la base real: un solo uso, también con escaneos simultáneos.
 * Crea su propia promo y QRs, y borra todo al terminar.
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

describe.skipIf(!ready)('canje de QR (integración, DB real)', () => {
  let prisma: PrismaClient;
  let merchantService: typeof import('../src/modules/merchant/merchant.service.js').merchantService;
  let claimsService: typeof import('../src/modules/claims/claims.service.js').claimsService;
  let tenantId: string;
  let merchantUserId: string;
  let clientId: string;
  let productId: string;
  const claimIds: string[] = [];

  async function nuevoQr(quantity = 1) {
    const qr = await merchantService.createQr(tenantId, merchantUserId, { productId, quantity });
    claimIds.push(qr.claimId);
    return qr;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ merchantService } = await import('../src/modules/merchant/merchant.service.js'));
    ({ claimsService } = await import('../src/modules/claims/claims.service.js'));

    const merchant = await prisma.userTenantRoleMap.findFirstOrThrow({ where: { role: 'comercio', user: { email: 'comercio@snacki.demo' } } });
    const client = await prisma.user.findFirstOrThrow({ where: { email: 'cliente@snacki.demo' } });
    tenantId = merchant.tenantId;
    merchantUserId = merchant.userId;
    clientId = client.id;
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: '[test] promo QR',
        points: 40,
        promoStartsAt: new Date(Date.now() - 60_000),
        promoEndsAt: new Date(Date.now() + 86_400_000),
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.pointEntry.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.purchaseClaim.deleteMany({ where: { id: { in: claimIds } } });
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('acredita una vez y rechaza el segundo escaneo con 409', async () => {
    const qr = await nuevoQr(2);
    const ok = await claimsService.redeem(clientId, qr.qrContent);
    expect(ok.points).toBe(80);

    await expect(claimsService.redeem(clientId, qr.qrContent)).rejects.toMatchObject({ statusCode: 409, code: 'QR_ALREADY_USED' });
    expect(await prisma.pointEntry.count({ where: { claimId: qr.claimId } })).toBe(1);
  });

  it('10 escaneos simultáneos del mismo QR: exactamente uno acredita', async () => {
    const qr = await nuevoQr();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => claimsService.redeem(clientId, qr.token)));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected.every((r) => r.reason?.statusCode === 409)).toBe(true);
    expect(await prisma.pointEntry.count({ where: { claimId: qr.claimId } })).toBe(1);
  });

  it('el comercio no puede canjear su propio QR', async () => {
    const qr = await nuevoQr();
    await expect(claimsService.redeem(merchantUserId, qr.token)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('un QR anulado por el comercio ya no se puede canjear (410)', async () => {
    const qr = await nuevoQr();
    await merchantService.voidQr(tenantId, qr.claimId);
    await expect(claimsService.redeem(clientId, qr.token)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('no se puede anular un QR ya canjeado', async () => {
    const qr = await nuevoQr();
    await claimsService.redeem(clientId, qr.token);
    await expect(merchantService.voidQr(tenantId, qr.claimId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rechaza QR alterados (400)', async () => {
    const qr = await nuevoQr();
    const alterado = qr.token.slice(0, -1) + (qr.token.endsWith('A') ? 'B' : 'A');
    await expect(claimsService.redeem(clientId, alterado)).rejects.toMatchObject({ statusCode: 400, code: 'QR_INVALID' });
  });
});
