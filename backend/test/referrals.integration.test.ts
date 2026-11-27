import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateReferralCode, normalizeReferralCode, REFERRAL_CODE_LENGTH } from '../src/modules/referrals/referrals.service.js';

describe('códigos de referido', () => {
  it('se generan con el largo fijo y sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]+$/);
    }
  });

  it('se normalizan a mayúsculas sin espacios ni guiones', () => {
    expect(normalizeReferralCode(' abc-12 34 ')).toBe('ABC1234');
  });
});

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

/**
 * Motor de referidos contra la base real, en un comercio de prueba propio (se borra al final):
 * aplicar código, rechazos (propio, mutuo, cliente existente, doble, tope, desactivado),
 * liquidación del bono en la misma transacción del claim y bono una sola vez.
 */
describe.skipIf(!ready)('referidos (integración, DB real)', () => {
  const REFERRER_BONUS = 100;
  const REFEREE_BONUS = 50;
  const PROMO_POINTS = 120;

  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
  let signAccessToken: typeof import('../src/lib/jwt.js').signAccessToken;
  let merchantService: typeof import('../src/modules/merchant/merchant.service.js').merchantService;
  let tenantId: string;
  let merchantUserId: string;
  let productId: string;
  const userIds: string[] = [];
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function newClient(name: string) {
    const user = await prisma.user.create({
      data: { email: `ref-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@snacki.test`, fullName: `[test] ${name}`, passwordHash: 'x' },
    });
    userIds.push(user.id);
    ids[name] = user.id;
    tokens[name] = signAccessToken({ sub: user.id, email: user.email, role: 'cliente', tenantId });
  }

  const auth = (name: string) => ({ authorization: `Bearer ${tokens[name]}` });
  const errorCode = (res: { json: () => unknown }) => JSON.stringify(res.json());

  async function myReferrals(name: string) {
    const res = await app.inject({ method: 'GET', url: '/api/referrals/me', headers: auth(name) });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.tenants as Array<{
      tenantId: string; code: string; pending: number; completed: number; bonusEarned: number;
      remainingInvites: number; referredBy: { name: string; status: string } | null;
    }>;
    return list.find((t) => t.tenantId === tenantId)!;
  }

  const apply = (name: string, code: string) =>
    app.inject({ method: 'POST', url: '/api/referrals/apply', headers: auth(name), payload: { code } });

  const claim = (name: string, token: string) =>
    app.inject({ method: 'POST', url: '/api/claims', headers: auth(name), payload: { token } });

  async function newQr() {
    return (await merchantService.createQr(tenantId, merchantUserId, { productId, quantity: 1 })).qrContent;
  }

  async function balance(name: string) {
    const res = await app.inject({ method: 'GET', url: '/api/wallet', headers: auth(name) });
    return (res.json().data.tenants as Array<{ tenantId: string; balance: number }>).find((t) => t.tenantId === tenantId)?.balance ?? 0;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ signAccessToken } = await import('../src/lib/jwt.js'));
    ({ merchantService } = await import('../src/modules/merchant/merchant.service.js'));
    const { buildApp } = await import('../src/app.js');
    app = await buildApp();

    const tenant = await prisma.tenant.create({
      data: {
        name: '[test] referidos', slug: `test-referidos-${Date.now()}`,
        referralEnabled: true, referrerBonusPoints: REFERRER_BONUS, refereeBonusPoints: REFEREE_BONUS, referralMaxPerUser: 2,
      },
    });
    tenantId = tenant.id;
    const merchant = await prisma.user.create({
      data: { email: `ref-merchant-${Date.now()}@snacki.test`, fullName: '[test] comercio referidos', passwordHash: 'x' },
    });
    merchantUserId = merchant.id;
    userIds.push(merchant.id);
    productId = (await prisma.product.create({
      data: {
        tenantId, name: '[test] promo referidos', points: PROMO_POINTS,
        promoStartsAt: new Date(Date.now() - 60_000), promoEndsAt: new Date(Date.now() + 86_400_000),
      },
    })).id;

    for (const name of ['ana', 'beto', 'caro', 'dani', 'eva']) await newClient(name);
  });

  afterAll(async () => {
    if (!prisma) return;
    await app?.close();
    if (tenantId) {
      await prisma.pointEntry.deleteMany({ where: { tenantId } });
      await prisma.referral.deleteMany({ where: { tenantId } });
      await prisma.purchaseClaim.deleteMany({ where: { tenantId } });
      await prisma.product.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('GET /me crea un código por comercio y lo mantiene estable', async () => {
    const first = await myReferrals('ana');
    expect(first.code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(first).toMatchObject({ pending: 0, completed: 0, bonusEarned: 0, remainingInvites: 2, referredBy: null });
    expect((await myReferrals('ana')).code).toBe(first.code);
  });

  it('rechaza código inexistente (404) y el propio código (409)', async () => {
    const res = await apply('ana', 'ZZZZZZZ');
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toContain('REFERRAL_CODE_INVALID');

    const { code } = await myReferrals('ana');
    const self = await apply('ana', code.toLowerCase());
    expect(self.statusCode).toBe(409);
    expect(errorCode(self)).toContain('REFERRAL_SELF');
  });

  it('QR escaneado sin conexión antes de aplicar el código: al sincronizar completa el referido', async () => {
    // Beto recibe el QR en el local (sin red), aplica el código de Ana después y el claim llega al final.
    const offlineQr = await newQr();
    const { code } = await myReferrals('ana');

    const applied = await apply('beto', code);
    expect(applied.statusCode).toBe(201);
    expect(applied.json().data).toMatchObject({ status: 'PENDING', refereeBonusPoints: REFEREE_BONUS, referrerBonusPoints: REFERRER_BONUS });
    expect(await myReferrals('ana')).toMatchObject({ pending: 1, completed: 0 });
    expect((await myReferrals('beto')).referredBy).toMatchObject({ status: 'PENDING' });

    const res = await claim('beto', offlineQr);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.referralBonus).toMatchObject({ points: REFEREE_BONUS, referrerPoints: REFERRER_BONUS });

    expect(await balance('beto')).toBe(PROMO_POINTS + REFEREE_BONUS);
    expect(await balance('ana')).toBe(REFERRER_BONUS);
    expect(await myReferrals('ana')).toMatchObject({ pending: 0, completed: 1, bonusEarned: REFERRER_BONUS, remainingInvites: 1 });
    expect(await myReferrals('beto')).toMatchObject({ bonusEarned: REFEREE_BONUS, referredBy: { status: 'COMPLETED' } });

    const referral = await prisma.referral.findUniqueOrThrow({ where: { tenantId_refereeId: { tenantId, refereeId: ids.beto } } });
    expect(referral.qualifyingClaimId).toBeTruthy();
  });

  it('el bono se paga una sola vez: la segunda compra no suma otro', async () => {
    const res = await claim('beto', await newQr());
    expect(res.statusCode).toBe(201);
    expect(res.json().data.referralBonus).toBeNull();
    expect(await prisma.pointEntry.count({ where: { tenantId, type: 'REFERRAL_BONUS' } })).toBe(2);
    expect(await balance('ana')).toBe(REFERRER_BONUS);
  });

  it('el bono aparece en movimientos', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/wallet/${tenantId}/movements`, headers: auth('ana') });
    expect(res.json().data.movements).toEqual([
      expect.objectContaining({ type: 'REFERRAL_BONUS', points: REFERRER_BONUS, description: 'Bono por referido', expired: false }),
    ]);
  });

  it('el bono se puede gastar en un canje como cualquier punto', async () => {
    const reward = await prisma.reward.create({ data: { tenantId, name: '[test] premio referidos', cost: REFERRER_BONUS } });
    const qr = await merchantService.createRedeemQr(tenantId, merchantUserId, { rewardId: reward.id });
    const res = await app.inject({ method: 'POST', url: '/api/redemptions', headers: auth('ana'), payload: { token: qr.qrContent } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.balance).toBe(0);
    expect(await balance('ana')).toBe(0);
    await prisma.redemptionClaim.deleteMany({ where: { tenantId } });
    await prisma.redemption.deleteMany({ where: { tenantId } });
  });

  it('rechaza a quien ya fue referido y a quien ya es cliente del comercio', async () => {
    const { code } = await myReferrals('ana');
    // Beto ya usó un código en este comercio.
    expect(errorCode(await apply('beto', code))).toContain('REFERRAL_ALREADY_REFERRED');

    // Caro ya compró antes en el comercio: no es un cliente nuevo.
    expect((await claim('caro', await newQr())).statusCode).toBe(201);
    const res = await apply('caro', code);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toContain('REFERRAL_EXISTING_CLIENT');
  });

  it('rechaza el referido mutuo (usar el código de alguien a quien invitaste)', async () => {
    const { code } = await myReferrals('ana');
    expect((await apply('dani', code)).statusCode).toBe(201);
    const daniCode = (await myReferrals('dani')).code;
    const res = await apply('ana', daniCode);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toContain('REFERRAL_MUTUAL');
  });

  it('respeta el tope de invitaciones por cliente', async () => {
    // Ana ya tiene 2 (Beto completado + Dani pendiente) y el tope es 2.
    const res = await apply('eva', (await myReferrals('ana')).code);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toContain('REFERRAL_LIMIT_REACHED');
  });

  it('con referidos apagados: no se aplican códigos y los pendientes esperan sin pagar', async () => {
    const betoCode = (await myReferrals('beto')).code;
    await prisma.tenant.update({ where: { id: tenantId }, data: { referralEnabled: false } });
    try {
      expect(errorCode(await apply('eva', betoCode))).toContain('REFERRALS_DISABLED');

      const claimed = await claim('dani', await newQr());
      expect(claimed.statusCode).toBe(201);
      expect(claimed.json().data.referralBonus).toBeNull();
      const pending = await prisma.referral.findUniqueOrThrow({ where: { tenantId_refereeId: { tenantId, refereeId: ids.dani } } });
      expect(pending.status).toBe('PENDING');
    } finally {
      await prisma.tenant.update({ where: { id: tenantId }, data: { referralEnabled: true } });
    }
  });

  it('el comercio no puede activar referidos sin ningún bono', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { referrerBonusPoints: 0, refereeBonusPoints: 0, referralEnabled: false } });
    await expect(merchantService.updateSettings(tenantId, { referralEnabled: true })).rejects.toMatchObject({ code: 'REFERRAL_BONUS_REQUIRED' });
    const updated = await merchantService.updateSettings(tenantId, { referralEnabled: true, refereeBonusPoints: 30 });
    expect(updated).toMatchObject({ referralEnabled: true, refereeBonusPoints: 30, referrerBonusPoints: 0 });
  });

  it('una cuenta de comercio no usa referidos (403) y sin token es 401', async () => {
    const merchantToken = signAccessToken({ sub: merchantUserId, email: 'm@snacki.test', role: 'comercio', tenantId });
    expect((await app.inject({ method: 'GET', url: '/api/referrals/me', headers: { authorization: `Bearer ${merchantToken}` } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/referrals/me' })).statusCode).toBe(401);
  });
});
