import { exchangeFetch } from './exchangeHttp';

/**
 * Bounded cache for 5-minute exchange *historical* measurements. This is
 * deliberately separate from the 15-second live OI sampling cadence.
 * Only schema-validated successful replies enter the cache; rate-limit errors
 * never turn old history into a fresh measurement.
 */
export class ExchangeHistoryCache {
  private readonly cache = new Map<string, { at: number; data: any }>();
  private readonly inFlight = new Map<string, Promise<any | null>>();
  private hits = 0;
  private misses = 0;
  private shared = 0;

  constructor(
    private readonly request: typeof fetch = exchangeFetch,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 60_000,
    private readonly maxItems = 1000,
  ) {}

  async get(url: string, valid: (data: any) => boolean, timeoutMs = 2_500): Promise<any | null> {
    const cached = this.cache.get(url);
    if (cached && this.now() - cached.at < this.ttlMs && this.now() >= cached.at) {
      this.hits++;
      return cached.data;
    }
    const running = this.inFlight.get(url);
    if (running) { this.shared++; return running; }
    this.misses++;

    const pending = (async (): Promise<any | null> => {
      try {
        const res = await this.request(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'SignalHook/1.0' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!valid(data)) return null;
        this.cache.delete(url);
        this.cache.set(url, { at: this.now(), data });
        while (this.cache.size > this.maxItems)
          this.cache.delete(this.cache.keys().next().value!);
        return data;
      } catch {
        // Never claim a 5-minute historical sample was freshly fetched on
        // timeout, invalid payload, exchange cooldown or regional restriction.
        return null;
      }
    })();
    this.inFlight.set(url, pending);
    try { return await pending; }
    finally { if (this.inFlight.get(url) === pending) this.inFlight.delete(url); }
  }

  stats() { return { cachedSeries: this.cache.size, inFlight: this.inFlight.size,
    hits: this.hits, misses: this.misses, shared: this.shared }; }
}

export const exchangeHistoryCache = new ExchangeHistoryCache();
