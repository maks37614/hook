/** Limits are per authenticated owner, not per IP. Previously active coins are
 * grandfathered on deploy; no existing subscriptions are silently disabled. */
function boundedEnv(name: string, fallback: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}
export const MAX_SURVEILLANCE_ACTIVE = boundedEnv('H00K_SURVEILLANCE_MAX_ACTIVE', 8, 100);
export const MAX_SURVEILLANCE_SAVED = boundedEnv('H00K_SURVEILLANCE_MAX_SAVED', 30, 300);

export function canActivateSurveillance(
  coins: readonly { id: string; isActive: boolean }[], id?: string,
): boolean {
  if (id && coins.some(coin => coin.id === id && coin.isActive)) return true;
  return coins.filter(coin => coin.isActive).length < MAX_SURVEILLANCE_ACTIVE;
}
export function canSaveSurveillance(coins: readonly unknown[]): boolean {
  return coins.length < MAX_SURVEILLANCE_SAVED;
}

/** Cheap per-user throttling of manual expensive endpoints. Fails closed when
 * the same account spams check-all/backtest from multiple tabs. */
export class UserWorkThrottle {
  private last = new Map<string, number>();
  allow(userId: string, action: string, minMs: number, now = Date.now()): boolean {
    if (!userId || userId === 'guest' || !action || !(minMs >= 0)) return false;
    const key = JSON.stringify([userId,action]);
    const lastAt = this.last.get(key);
    if (lastAt !== undefined && now - lastAt < minMs) return false;
    this.last.delete(key);
    this.last.set(key,now);
    if (this.last.size > 3000) this.last.delete(this.last.keys().next().value!);
    return true;
  }
}
export const userWorkThrottle = new UserWorkThrottle();

/** Sliding per-user cap for distinct expensive tasks (e.g. backtests of
 * different symbols), independent from the same-task cooldown above. */
export class UserWorkQuota {
  private history = new Map<string, number[]>();
  allow(userId: string, action: string, maxCalls: number, windowMs: number, now=Date.now()): boolean {
    if (!userId || userId === 'guest' || !(maxCalls > 0) || !(windowMs > 0)) return false;
    const key = JSON.stringify([userId,action]);
    const recent = (this.history.get(key) || []).filter(at => now - at < windowMs && now >= at);
    if (recent.length >= maxCalls) { this.history.set(key,recent); return false; }
    recent.push(now);
    this.history.delete(key);
    this.history.set(key,recent);
    if (this.history.size > 3000) this.history.delete(this.history.keys().next().value!);
    return true;
  }
}
export const userWorkQuota = new UserWorkQuota();
