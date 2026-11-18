import { depthOutlierProfile, type DepthOutlierProfile } from './depthOutlierProfile';

/**
 * Cache the public portion of the AUTO/HYBRID liquidity threshold once for
 * each canonical shared order-book revision. Every account still computes
 * its own turnover baseline, manual threshold and persistence score.
 *
 * WeakMap lifetime follows the shared market Map; no account keys or user
 * settings are ever retained. Revisions advance on a real book mutation or
 * full snapshot/resync, including clearing books after an outage.
 */
export class SharedPublicDepthMedianCache {
  private rows = new WeakMap<ReadonlyMap<number, number>, {
    asks: ReadonlyMap<number, number>; revision: number; profile: DepthOutlierProfile | null;
  }>();
  private calculations = 0;
  private hits = 0;

  getProfile(bids: ReadonlyMap<number, number>, asks: ReadonlyMap<number, number>,
    revision: number): DepthOutlierProfile | null {
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new Error('Invalid shared depth revision');
    const row = this.rows.get(bids);
    if (row && row.asks === asks && row.revision === revision) {
      this.hits++;
      return row.profile;
    }
    const profile = depthOutlierProfile(bids, asks);
    this.calculations++;
    this.rows.set(bids, { asks, revision, profile });
    return profile;
  }

  get(bids: ReadonlyMap<number, number>, asks: ReadonlyMap<number, number>,
    revision: number): number | null {
    return this.getProfile(bids, asks, revision)?.median ?? null;
  }

  stats() { return { calculations: this.calculations, hits: this.hits }; }
}

export const sharedPublicDepthMedian = new SharedPublicDepthMedianCache();
