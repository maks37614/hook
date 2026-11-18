/**
 * Server-side IP budget for public exchange REST. All callers must share this
 * instance; a separate limiter per feature would defeat IP-level protection.
 *
 * These are intentionally conservative application budgets, NOT claims about
 * exchange-advertised quotas. If another process shares the public IP, the
 * deployment must coordinate that process separately.
 */
export type ExchangeScope = 'binance-spot' | 'binance-futures' | 'bybit';

type Sample = { at: number; weight: number };

// Preserve capacity for an open chart even when automated formation scans
// consume the background allowance. Both request classes still share the
// exchange's full IP-weight ceiling, cooldowns, global budget and concurrency.
type RequestClass = 'background' | 'chart';
const CHART_RESERVED_WEIGHT: Record<ExchangeScope, number> = {
  'binance-futures': 180,  // 30% of the local 600/minute safety budget
  'binance-spot': 120,     // 10% of the local 1200/minute safety budget
  bybit: 20,              // 20% of the local 100/5-second safety budget
};
type ScopeState = {
  samples: Sample[];
  active: number;
  waiting: number;
  cooldownUntil: number;
  requests: number;
  rejected: number;
  rateLimited: number;
  observedWeight1m: number | null;
  observedAt: number;
};

const CONFIG: Record<ExchangeScope, { windowMs: number; budget: number; concurrency: number }> = {
  'binance-spot': { windowMs: 60_000, budget: 1_200, concurrency: 8 },
  'binance-futures': { windowMs: 60_000, budget: 600, concurrency: 8 },
  bybit: { windowMs: 5_000, budget: 100, concurrency: 8 },
};

export class ExchangeBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExchangeBudgetError';
  }
}

function classify(url: URL): ExchangeScope | null {
  const host = url.hostname.toLowerCase();
  if (host === 'api.bybit.com' || host === 'api.bytick.com' || host === 'api.bybit.nl') return 'bybit';
  if (host === 'data-api.binance.vision' || host === 'api.binance.com' || host === 'api1.binance.com' ||
      host === 'fapi.binance.com' || host === 'fapi1.binance.com') {
    return host.startsWith('fapi') || url.pathname.startsWith('/fapi/') || url.pathname.startsWith('/futures/')
      ? 'binance-futures' : 'binance-spot';
  }
  return null;
}

/** Deliberately overestimate costly endpoints; missing routes cost 5 weight. */
function estimatedWeight(scope: ExchangeScope, url: URL): number {
  if (scope === 'bybit') return 1;
  const path = url.pathname;
  if (path.endsWith('/ticker/24hr')) {
    if (url.searchParams.has('symbol') || url.searchParams.has('symbols'))
      return scope === 'binance-futures' ? 2 : 5;
    return scope === 'binance-spot' ? 80 : 40;
  }
  if (path.endsWith('/ticker') && !url.searchParams.has('symbol')) return 80;
  if (path.endsWith('/depth')) {
    const limit = Number(url.searchParams.get('limit') || 100);
    // USD-M Futures documents IP weights 2 / 5 / 10 / 20 for
    // depths <=50 / 100 / 500 / 1000. Keep a 40-50% safety margin,
    // instead of charging 50 for a depth-1000 snapshot (actual weight 20).
    // The same 600/min local budget and observed IP-weight guard remain.
    if (scope === 'binance-futures')
      return limit <= 50 ? 3 : limit <= 100 ? 7 : limit <= 500 ? 15 : 30;
    return limit > 1000 ? 250 : limit > 500 ? 50 : 25;
  }
  if (path.endsWith('/klines')) {
    if (scope === 'binance-futures') {
      const limit = Number(url.searchParams.get('limit') || 500);
      // USD-M: 1 / 2 / 5 / 10 actual weight by candle count.
      return limit < 100 ? 2 : limit < 500 ? 3 : limit <= 1000 ? 7 : 14;
    }
    return 5;
  }
  if (scope === 'binance-futures' && path.endsWith('/openInterest') && url.searchParams.has('symbol')) return 2; // Exchange weight 1; safety margin 2x.
  if (path.endsWith('/ticker/price') && !url.searchParams.has('symbol')) return 10;
  return 5;
}

function retryAfterMs(value: string | null, now: number): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const absolute = Date.parse(value);
  return Number.isFinite(absolute) ? Math.max(0, absolute - now) : 0;
}

/** A browser or server caller can stop awaiting a shared fetch without cancelling other consumers. */
function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('Request aborted'));
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener('abort', aborted);
      reject(signal.reason ?? new Error('Request aborted'));
    };
    signal.addEventListener('abort', aborted, { once: true });
    operation.then(value => {
      signal.removeEventListener('abort', aborted);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', aborted);
      reject(error);
    });
  });
}

export class ExchangeHttpManager {
  private states = new Map<ExchangeScope, ScopeState>();
  private pending = new Map<string, Promise<Response>>();

  constructor(
    private readonly request: typeof fetch = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now,
  ) {}

  private state(scope: ExchangeScope): ScopeState {
    let state = this.states.get(scope);
    if (!state) {
      state = { samples: [], active: 0, waiting: 0, cooldownUntil: 0,
        requests: 0, rejected: 0, rateLimited: 0, observedWeight1m: null, observedAt: 0 };
      this.states.set(scope, state);
    }
    return state;
  }

  stats() {
    return (Object.keys(CONFIG) as ExchangeScope[]).map(scope => {
      const state = this.state(scope);
      this.prune(scope, state);
      return { scope, requests: state.requests, rejected: state.rejected,
        rateLimited: state.rateLimited, inFlight: state.active, waiting: state.waiting,
        cooldownMs: Math.max(0, state.cooldownUntil - this.now()),
        estimatedWindowWeight: state.samples.reduce((sum, s) => sum + s.weight, 0),
        observedWeight1m: state.observedWeight1m };
    });
  }

  private prune(scope: ExchangeScope, state: ScopeState) {
    const oldest = this.now() - CONFIG[scope].windowMs;
    while (state.samples.length && state.samples[0].at <= oldest) state.samples.shift();
  }

  private async acquire(scope: ExchangeScope, weight: number, signal?: AbortSignal, requestClass: RequestClass = 'background') {
    const state = this.state(scope);
    const policy = CONFIG[scope];
    if (state.waiting >= 256) {
      state.rejected++;
      throw new ExchangeBudgetError('Exchange REST queue full');
    }
    state.waiting++;
    const realDeadline = Date.now() + 2_000;
    try {
      for (;;) {
        if (signal?.aborted) throw signal.reason ?? new Error('Exchange request aborted');
        this.prune(scope, state);
        const now = this.now();
        if (state.cooldownUntil > now) {
          state.rejected++;
          throw new ExchangeBudgetError(`Exchange ${scope} cooling down`);
        }
        // The exchange's own response header reports usage for the *whole
        // egress IP*, including other processes. Respect it in addition to
        // this process's estimated rolling budget whenever it is recent.
        const externalHeadroom = scope === 'binance-spot' ? 3_000
          : scope === 'binance-futures' ? 1_200 : Infinity;
        if (state.observedWeight1m !== null && now - state.observedAt < 15_000 &&
            state.observedWeight1m >= externalHeadroom) {
          state.rejected++;
          throw new ExchangeBudgetError(`Exchange ${scope} IP weight near safety limit`);
        }
        const used = state.samples.reduce((sum, s) => sum + s.weight, 0);
        const maxWeight = requestClass === 'chart'
          ? policy.budget : policy.budget - CHART_RESERVED_WEIGHT[scope];
        if (used + weight <= maxWeight && state.active < policy.concurrency) {
          state.samples.push({ at: now, weight });
          state.active++;
          return;
        }
        if (Date.now() >= realDeadline) {
          state.rejected++;
          throw new ExchangeBudgetError(`Exchange ${scope} REST budget exhausted`);
        }
        await new Promise<void>(resolve => setTimeout(resolve, 50));
      }
    } finally {
      state.waiting--;
    }
  }

  private observe(scope: ExchangeScope, state: ScopeState, response: Response) {
    const now = this.now();
    if (scope.startsWith('binance')) {
      const observed = response.headers.get('x-mbx-used-weight-1m');
      if (observed !== null && Number.isFinite(Number(observed))) {
        state.observedWeight1m = Number(observed);
        state.observedAt = now;
      }
    }
    let cooldown = 0;
    if (response.status === 418) cooldown = 120_000;
    else if (response.status === 429) cooldown = 60_000;
    else if (response.status === 403 || response.status === 451) cooldown = 600_000;
    if (cooldown) {
      state.rateLimited++;
      state.cooldownUntil = Math.max(state.cooldownUntil, now + Math.max(
        cooldown, retryAfterMs(response.headers.get('retry-after'), now)));
    }
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit,
    requestClass: RequestClass = 'background'): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const scope = classify(url);
    if (!scope) return this.request(input, init);

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    // Public exchange GET requests are idempotent; never merge orders/private traffic.
    // A chart request must not accidentally join a background GET waiting at its
    // smaller budget ceiling. Deduplicate within each class; both still charge
    // the exact same shared IP budget when they reach the exchange.
    const key = method === 'GET' ? `${scope}:${requestClass}:${url.href}` : null;
    const consumerSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
    if (key) {
      const inFlight = this.pending.get(key);
      if (inFlight) return (await awaitWithAbort(inFlight, consumerSignal)).clone();
    }
    // A short caller timeout/cancel must not abort everyone else's shared
    // public GET. Bound the actual exchange operation independently at 5s.
    const detached = Boolean(key && consumerSignal);
    const upstreamSignal = detached ? AbortSignal.timeout(5_000) : consumerSignal;
    const upstreamInit: RequestInit | undefined = detached ? { ...init, signal: upstreamSignal } : init;
    const upstreamInput = detached && input instanceof Request
      ? new Request(input, { signal: upstreamSignal }) : input;
    const operation = (async () => {
      const state = this.state(scope);
      await this.acquire(scope, estimatedWeight(scope, url), upstreamSignal, requestClass);
      try {
        state.requests++;
        const response = await this.request(upstreamInput, upstreamInit);
        this.observe(scope, state, response);
        if (scope === 'bybit' && response.ok) {
          // Bybit signals some rate limits in its JSON payload (HTTP 200).
          try {
            const json = await response.clone().json();
            if (json?.retCode === 10006) {
              state.rateLimited++;
              state.cooldownUntil = Math.max(state.cooldownUntil, this.now() + 60_000);
            }
          } catch { /* Non-JSON result: leave response handling to caller. */ }
        }
        return response;
      } finally {
        state.active--;
      }
    })();
    if (key) {
      this.pending.set(key, operation);
      // Use two handlers (rather than a floating finally) to avoid unhandled rejections.
      operation.then(() => this.pending.delete(key), () => this.pending.delete(key));
    }
    return (await awaitWithAbort(operation, consumerSignal)).clone();
  }
}

export const exchangeHttp = new ExchangeHttpManager();
// The offline test harness deliberately stubs HTTP and tests error paths in the
// same process. Its fixtures must not trip the production singleton's cooldown.
// ExchangeHttpManager itself remains tested independently with injected fetches.
export const exchangeFetch: typeof fetch = (input, init) =>
  process.env.H00K_OFFLINE_TESTS === '1' ? fetch(input, init) : exchangeHttp.fetch(input, init);

/** For live charts only: uses the same global limiter but may spend the
 * reserved chart headroom that routine background scanners cannot consume. */
export const chartExchangeFetch: typeof fetch = (input, init) =>
  process.env.H00K_OFFLINE_TESTS === '1'
    ? fetch(input, init) : exchangeHttp.fetch(input, init, 'chart');
