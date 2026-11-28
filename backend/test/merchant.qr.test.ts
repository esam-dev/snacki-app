import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-16';

const prismaMock = vi.hoisted(() => ({
  product: { findFirst: vi.fn(), delete: vi.fn(), update: vi.fn() },
  purchaseClaim: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: prismaMock }));

const { merchantService, QR_TTL_MS } = await import('../src/modules/merchant/merchant.service.js');
const { signQrToken, verifyQrToken, QR_URI_PREFIX, QrTokenError } = await import('../src/lib/qr-token.js');
const { createQrSchema } = await import('../src/modules/merchant/merchant.schemas.js');

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const CLAIM = '44444444-4444-4444-8444-444444444444';
const DAY = 86_400_000;

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT,
    tenantId: TENANT,
    name: 'Café nuevo',
    points: 250,
    isActive: true,
    promoStartsAt: new Date(Date.now() - DAY),
    promoEndsAt: new Date(Date.now() + DAY),
    ...overrides,
  };
}

describe('qr token', () => {
  it('es compacto, solo lleva el claimId y se verifica con o sin prefijo', () => {
    const token = signQrToken(CLAIM, new Date(Date.now() + 60_000));
    expect(token).toMatch(/^S1\.[0-9a-f]{32}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
    expect(token.length).toBeLessThan(80);
    expect(verifyQrToken(token).claimId).toBe(CLAIM);
    expect(verifyQrToken(`${QR_URI_PREFIX}${token}`).claimId).toBe(CLAIM);
  });

  it('rechaza firmas falsas y cualquier campo alterado', () => {
    const token = signQrToken(CLAIM, new Date(Date.now() + 60_000));
    const [v, id, exp, sig] = token.split('.');
    const otroId = id.replace(/^./, id[0] === 'a' ? 'b' : 'a');
    const masTarde = (parseInt(exp, 36) + 86_400).toString(36);
    const sigMala = sig.replace(/^./, sig[0] === 'A' ? 'B' : 'A');
    const sigRelleno = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A'); // solo cambia bits de relleno
    for (const t of [`${v}.${otroId}.${exp}.${sig}`, `${v}.${id}.${masTarde}.${sig}`, `${v}.${id}.${exp}.${sigMala}`, `${v}.${id}.${exp}.${sigRelleno}`, `S2.${id}.${exp}.${sig}`]) {
      expect(() => verifyQrToken(t)).toThrow(QrTokenError);
    }
  });

  it('rechaza basura, JWT de sesión y formatos antiguos', () => {
    const session = jwt.sign({ sub: CLAIM }, process.env.JWT_SECRET!);
    for (const t of ['', 'hola', session, 'snacki://purchase/burger-house?id=x&points=999', `${QR_URI_PREFIX}${session}`]) {
      expect(() => verifyQrToken(t)).toThrow(QrTokenError);
    }
  });

  it('marca como vencido un token pasado su exp', () => {
    const token = signQrToken(CLAIM, new Date(Date.now() + 5_000));
    try {
      verifyQrToken(token, Date.now() + 10_000);
      expect.unreachable();
    } catch (e) {
      expect((e as InstanceType<typeof QrTokenError>).reason).toBe('expired');
    }
  });
});

describe('createQrSchema', () => {
  it('usa cantidad 1 por defecto y limita el rango', () => {
    expect(createQrSchema.parse({ productId: PRODUCT }).quantity).toBe(1);
    expect(() => createQrSchema.parse({ productId: PRODUCT, quantity: 0 })).toThrow();
    expect(() => createQrSchema.parse({ productId: PRODUCT, quantity: 21 })).toThrow();
    expect(() => createQrSchema.parse({ productId: 'no-uuid' })).toThrow();
  });
});

describe('merchantService.createQr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.purchaseClaim.create.mockImplementation(async ({ data }: any) => ({ id: CLAIM, ...data }));
  });

  it('crea el claim con puntos × cantidad, vence en 24 h y devuelve un token válido', async () => {
    prismaMock.product.findFirst.mockResolvedValue(product());
    const before = Date.now();
    const qr = await merchantService.createQr(TENANT, USER, { productId: PRODUCT, quantity: 3 });

    expect(prismaMock.product.findFirst).toHaveBeenCalledWith({ where: { id: PRODUCT, tenantId: TENANT, deletedAt: null } });
    const data = prismaMock.purchaseClaim.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: TENANT, productId: PRODUCT, quantity: 3, points: 750, createdById: USER });
    expect(data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(QR_TTL_MS - 1000);
    expect(data.expiresAt.getTime() - before).toBeLessThanOrEqual(QR_TTL_MS + 1000);

    expect(qr.points).toBe(750);
    expect(qr.qrContent).toBe(`${QR_URI_PREFIX}${qr.token}`);
    expect(verifyQrToken(qr.token).claimId).toBe(CLAIM);
  });

  it('no encuentra promos de otro comercio', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    await expect(merchantService.createQr(TENANT, USER, { productId: PRODUCT, quantity: 1 })).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.purchaseClaim.create).not.toHaveBeenCalled();
  });

  it.each([
    ['pausada', { isActive: false }, 'PROMO_INACTIVE'],
    ['programada', { promoStartsAt: new Date(Date.now() + DAY), promoEndsAt: new Date(Date.now() + 2 * DAY) }, 'PROMO_NOT_STARTED'],
    ['finalizada', { promoStartsAt: new Date(Date.now() - 2 * DAY), promoEndsAt: new Date(Date.now() - DAY) }, 'PROMO_ENDED'],
  ])('rechaza promo %s', async (_label, overrides, code) => {
    prismaMock.product.findFirst.mockResolvedValue(product(overrides));
    await expect(merchantService.createQr(TENANT, USER, { productId: PRODUCT, quantity: 1 })).rejects.toMatchObject({ statusCode: 409, code });
    expect(prismaMock.purchaseClaim.create).not.toHaveBeenCalled();
  });

  it('exige sesión con comercio y usuario', async () => {
    await expect(merchantService.createQr(undefined, USER, { productId: PRODUCT, quantity: 1 })).rejects.toMatchObject({ statusCode: 401 });
    await expect(merchantService.createQr(TENANT, undefined, { productId: PRODUCT, quantity: 1 })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('merchantService.getQrStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['pending', { claimedAt: null, expiresAt: new Date(Date.now() + DAY) }],
    ['claimed', { claimedAt: new Date(), expiresAt: new Date(Date.now() + DAY) }],
    ['expired', { claimedAt: null, expiresAt: new Date(Date.now() - 1000) }],
  ])('informa %s', async (status, claim) => {
    prismaMock.purchaseClaim.findFirst.mockResolvedValue({ id: CLAIM, ...claim });
    const res = await merchantService.getQrStatus(TENANT, CLAIM);
    expect(res.status).toBe(status);
    expect(prismaMock.purchaseClaim.findFirst.mock.calls[0][0].where).toEqual({ id: CLAIM, tenantId: TENANT });
  });

  it('404 si el QR es de otro comercio', async () => {
    prismaMock.purchaseClaim.findFirst.mockResolvedValue(null);
    await expect(merchantService.getQrStatus(TENANT, CLAIM)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('merchantService.voidQr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('anula solo QR propios, sin canjear y vigentes (en una sola sentencia)', async () => {
    prismaMock.purchaseClaim.updateMany.mockResolvedValue({ count: 1 });
    await expect(merchantService.voidQr(TENANT, CLAIM)).resolves.toMatchObject({ status: 'expired' });
    const where = prismaMock.purchaseClaim.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: CLAIM, tenantId: TENANT, claimedAt: null });
  });

  it('409 si el cliente ya lo canjeó', async () => {
    prismaMock.purchaseClaim.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.purchaseClaim.findFirst.mockResolvedValue({ claimedAt: new Date() });
    await expect(merchantService.voidQr(TENANT, CLAIM)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('404 si el QR es de otro comercio', async () => {
    prismaMock.purchaseClaim.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.purchaseClaim.findFirst.mockResolvedValue(null);
    await expect(merchantService.voidQr(TENANT, CLAIM)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('merchantService.deleteProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('borra de verdad una promo sin ventas', async () => {
    prismaMock.product.findFirst.mockResolvedValue(product());
    prismaMock.purchaseClaim.count.mockResolvedValue(0);
    await expect(merchantService.deleteProduct(TENANT, PRODUCT)).resolves.toEqual({ ok: true, archived: false });
    expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: PRODUCT } });
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('archiva una promo con ventas (no rompe el historial) y anula sus QR pendientes', async () => {
    prismaMock.product.findFirst.mockResolvedValue(product());
    prismaMock.purchaseClaim.count.mockResolvedValue(2);
    await expect(merchantService.deleteProduct(TENANT, PRODUCT)).resolves.toEqual({ ok: true, archived: true });
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
    expect(prismaMock.product.update.mock.calls[0][0].data).toMatchObject({ isActive: false, deletedAt: expect.any(Date) });
    expect(prismaMock.purchaseClaim.updateMany.mock.calls[0][0].where).toMatchObject({ productId: PRODUCT, claimedAt: null });
  });

  it('404 si la promo es de otro comercio o ya fue eliminada', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    await expect(merchantService.deleteProduct(TENANT, PRODUCT)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.product.findFirst.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
  });
});
