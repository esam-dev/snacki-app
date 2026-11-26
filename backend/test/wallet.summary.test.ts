import { describe, it, expect } from 'vitest';
import { summarizeTenantWallet } from '../src/modules/wallet/wallet.summary.js';

const now = new Date('2026-11-25T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const rewards = [
  { id: 'r2', name: 'Combo', cost: 2500 },
  { id: 'r1', name: 'Papas', cost: 600 },
];

describe('summarizeTenantWallet', () => {
  it('sin movimientos: saldo 0 y la recompensa más barata como meta', () => {
    const s = summarizeTenantWallet([], rewards, now);
    expect(s).toMatchObject({ balance: 0, nextExpiresAt: null, nextExpiringPoints: 0, redeemableRewards: 0 });
    expect(s.nextReward).toMatchObject({ id: 'r1', missing: 600, progress: 0 });
  });

  it('los puntos vencidos no cuentan en el saldo ni en el próximo vencimiento', () => {
    const s = summarizeTenantWallet(
      [
        { remaining: 300, expiresAt: days(-1) },
        { remaining: 450, expiresAt: days(30) },
      ],
      rewards,
      now,
    );
    expect(s.balance).toBe(450);
    expect(s.nextExpiresAt).toEqual(days(30));
    expect(s.nextExpiringPoints).toBe(450);
  });

  it('vence exactamente ahora = vencido', () => {
    expect(summarizeTenantWallet([{ remaining: 100, expiresAt: now }], [], now).balance).toBe(0);
  });

  it('próximo vencimiento suma los puntos que vencen en la misma fecha', () => {
    const s = summarizeTenantWallet(
      [
        { remaining: 100, expiresAt: days(10) },
        { remaining: 50, expiresAt: days(10) },
        { remaining: 900, expiresAt: days(40) },
        { remaining: 20, expiresAt: null },
      ],
      rewards,
      now,
    );
    expect(s.balance).toBe(1070);
    expect(s.nextExpiresAt).toEqual(days(10));
    expect(s.nextExpiringPoints).toBe(150);
  });

  it('progreso hacia la siguiente recompensa que aún no alcanza', () => {
    const s = summarizeTenantWallet([{ remaining: 1000, expiresAt: null }], rewards, now);
    expect(s.redeemableRewards).toBe(1);
    expect(s.nextReward).toMatchObject({ id: 'r2', cost: 2500, missing: 1500, progress: 0.4 });
  });

  it('si alcanza todas las recompensas no hay meta pendiente', () => {
    const s = summarizeTenantWallet([{ remaining: 3000, expiresAt: null }], rewards, now);
    expect(s.redeemableRewards).toBe(2);
    expect(s.nextReward).toBeNull();
  });

  it('ignora entradas sin puntos restantes (ya canjeadas)', () => {
    expect(summarizeTenantWallet([{ remaining: 0, expiresAt: days(5) }], [], now)).toMatchObject({ balance: 0, nextExpiresAt: null });
  });
});
