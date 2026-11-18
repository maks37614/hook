import type { ChartEvidence, MarketAddress } from './model';
import { analysisMarketKey } from './model';

/** Passive, in-tab readers of ALREADY mounted live charts. No network or React subscriptions. */
const readers = new Map<string, Set<() => ChartEvidence>>();
export function evidenceScope(owner: string, market: MarketAddress, tf: string): string {
  return owner + ':' + analysisMarketKey(market) + ':' + tf;
}
export function registerTerminalEvidence(scope: string, read: () => ChartEvidence): () => void {
  const set = readers.get(scope) || new Set(); set.add(read); readers.set(scope, set);
  return () => { set.delete(read); if (!set.size) readers.delete(scope); };
}
export function readTerminalEvidence(scopes: readonly string[], now: number): ChartEvidence {
  const result: ChartEvidence = { manualLevels: [], densityEnabled: false, densities: [], oi: [] };
  for (const scope of new Set(scopes)) for (const read of readers.get(scope) || []) {
    const value = read();
    result.manualLevels.push(...value.manualLevels.filter(p => Number.isFinite(p) && p > 0));
    if (value.densityEnabled) {
      result.densityEnabled = true;
      result.densities.push(...value.densities.filter(d => Number.isFinite(d.price) && d.price > 0
        && d.usd > 0 && d.at <= now + 1000 && now - d.at <= 15_000));
    }
    result.oi.push(...value.oi.filter(p => p.t <= now && now - p.t < 86_400_000));
  }
  result.manualLevels = [...new Set(result.manualLevels)].slice(0, 24);
  result.densities = result.densities.sort((a, b) => b.usd - a.usd).slice(0, 12);
  result.oi = [...new Map(result.oi.map(p => [p.t, p])).values()].sort((a, b) => a.t - b.t).slice(-24);
  return result;
}
