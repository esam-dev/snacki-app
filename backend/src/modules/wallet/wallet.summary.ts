/** Cálculo puro del saldo de un cliente en un comercio (sin acceso a la base, fácil de testear). */

export interface EarnEntry {
  remaining: number;
  expiresAt: Date | null;
}

export interface RewardOption {
  id: string;
  name: string;
  cost: number;
}

export interface TenantWalletSummary {
  balance: number;
  nextExpiresAt: Date | null;
  nextExpiringPoints: number;
  /** Recompensa más barata que todavía no alcanza; null si ya alcanza todas (o no hay). */
  nextReward: (RewardOption & { missing: number; progress: number }) | null;
  redeemableRewards: number;
}

export function isActiveEntry(entry: EarnEntry, now: Date): boolean {
  return entry.remaining > 0 && (entry.expiresAt === null || entry.expiresAt > now);
}

export function summarizeTenantWallet(entries: EarnEntry[], rewards: RewardOption[], now = new Date()): TenantWalletSummary {
  const active = entries.filter((e) => isActiveEntry(e, now));
  const balance = active.reduce((sum, e) => sum + e.remaining, 0);

  // Próximo vencimiento: la fecha más cercana y cuántos puntos vencen en ella.
  let nextExpiresAt: Date | null = null;
  let nextExpiringPoints = 0;
  for (const e of active) {
    if (!e.expiresAt) continue;
    if (!nextExpiresAt || e.expiresAt < nextExpiresAt) {
      nextExpiresAt = e.expiresAt;
      nextExpiringPoints = e.remaining;
    } else if (e.expiresAt.getTime() === nextExpiresAt.getTime()) {
      nextExpiringPoints += e.remaining;
    }
  }

  const sorted = [...rewards].filter((r) => r.cost > 0).sort((a, b) => a.cost - b.cost);
  const redeemableRewards = sorted.filter((r) => r.cost <= balance).length;
  const target = sorted.find((r) => r.cost > balance);
  const nextReward = target
    ? { ...target, missing: target.cost - balance, progress: Math.round((balance / target.cost) * 100) / 100 }
    : null;

  return { balance, nextExpiresAt, nextExpiringPoints, nextReward, redeemableRewards };
}
