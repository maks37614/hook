import type { ExchangeProvider } from '../src/utils/exchangeEndpoints';
import { exchangeProvider, publicMarketUrl } from '../src/utils/exchangeEndpoints';
import { waitForMarketRetry } from '../src/utils/marketRequests';

interface Hold { until: number; reason: string }
type Traffic = 'market' | 'analysis' | 'history';
interface State { active: number; queued: number; waiting: Record<Traffic, number>; slots: Array<{ at: number; weight: number; signed: boolean; traffic: Traffic }>; nextAt: number; requests: number; cacheHits: number; shared: number; queueTimeouts: number; upstreamTimeouts: number; lastError?: string; hold: Hold }
interface Saved { body: Uint8Array; status: number; headers: [string, string][]; expires: number }
export interface GatewayOptions {
  request?: typeof fetch; now?: () => number; wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  holds?: Partial<Record<ExchangeProvider, Hold>>;
  saveHolds?: (holds: Record<ExchangeProvider, Hold>) => void;
  weightPerMinute?: number; requestsPerFiveSeconds?: number; spacingMs?: number;
  publicTimeoutMs?: number;
  disabled?: ExchangeProvider[];
}
const reply = (value: Saved) => new Response(value.body.slice(), { status: value.status, headers: value.headers });
const unavailable = (until: number, now: number) => new Response(JSON.stringify({ error: 'Джерело тимчасово призупинено для дотримання лімітів біржі', retryAt: until }), {
  status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, Math.ceil((until - now) / 1000))) },
});
function abort(signal?: AbortSignal | null) { if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError'); }
function weight(url: URL) {
  const futures = url.pathname.startsWith('/fapi/');
  const limit = Number(url.searchParams.get('limit') || (futures && url.pathname.endsWith('/depth') ? 500 : 100));
  if (url.pathname === '/api/v3/account') return 20;
  if (url.pathname === '/api/v3/openOrders') return url.searchParams.has('symbol') ? 6 : 80;
  if (url.pathname === '/fapi/v1/openOrders') return url.searchParams.has('symbol') ? 1 : 40;
  if (url.pathname === '/api/v3/ticker') {
    let count = url.searchParams.has('symbol') ? 1 : 50;
    try { const symbols = JSON.parse(url.searchParams.get('symbols') || 'null'); if (Array.isArray(symbols)) count = symbols.length; } catch {}
    return Math.min(Math.max(count, 1) * 4, 200);
  }
  if (/\/depth$/.test(url.pathname)) return futures ? limit > 500 ? 20 : limit > 100 ? 10 : limit > 50 ? 5 : 2 : limit > 1000 ? 250 : limit > 500 ? 50 : limit > 100 ? 25 : 5;
  if (/ticker\/24hr$/.test(url.pathname) && !url.searchParams.has('symbol')) return futures ? 40 : 80;
  if (/\/exchangeInfo$/.test(url.pathname)) return futures ? 1 : 20;
  if (/klines$/i.test(url.pathname)) return futures ? limit < 100 ? 1 : limit < 500 ? 2 : limit <= 1000 ? 5 : 10 : 2;
  if (/\/aggTrades$|\/trades$/.test(url.pathname)) return 25;
  return 5;
}
function trafficFor(url: URL | null): Traffic {
  if (!url) return 'market'; // Signed operations retain the full budget and are never retried.
  const candles = /\/(klines|kline)$/.test(url.pathname);
  // Both server and older browser fallback queues request this daily badge history.
  if (candles && ['1d', 'D'].includes(url.searchParams.get('interval') || '') && url.searchParams.get('limit') === '731') return 'history';
  if (candles || (/\/(exchangeInfo|instruments-info|tickers|ticker\/24hr)$/.test(url.pathname) && !url.searchParams.has('symbol'))) return 'market';
  return 'analysis';
}
function ttl(url: URL) {
  if (/exchangeInfo|instruments-info/.test(url.pathname)) return 3600_000;
  if (/klines$|\/kline$/.test(url.pathname)) {
    const end = Number(url.searchParams.get('endTime') || url.searchParams.get('end'));
    return end > 0 && end < Date.now() - 86400_000 ? 3600_000 : 2000;
  }
  if (/fundingRate$|funding\/history$/.test(url.pathname)) return 300_000;
  return /openInterest|open-interest|premiumIndex/.test(url.pathname) ? 15_000 : 1500;
}

/** One quota budget per provider for every server module. Signed requests are never shared/retried/cached. */
export class ExchangeGateway {
  private states = new Map<ExchangeProvider, State>();
  private cache = new Map<string, Saved>();
  private pending = new Map<string, Promise<Saved>>();
  private cacheBytes = 0;
  private scopedSlots = new Map<string, number[]>();
  private now: () => number;
  constructor(private options: GatewayOptions = {}) { this.now = options.now || Date.now; }
  private state(provider: ExchangeProvider): State {
    if (!this.states.has(provider)) this.states.set(provider, { active: 0, queued: 0, waiting: { market: 0, analysis: 0, history: 0 }, slots: [], nextAt: 0, requests: 0, cacheHits: 0, shared: 0, queueTimeouts: 0, upstreamTimeouts: 0, hold: this.options.holds?.[provider] || { until: 0, reason: '' } });
    return this.states.get(provider)!;
  }
  hold(provider: ExchangeProvider, status: number, delay = 0, reason = `HTTP ${status}`) {
    const minimum = status === 451 || status === 418 ? 3 * 86400_000 : status === 403 ? 600_000 : 60_000;
    const state = this.state(provider);
    state.hold = { until: Math.max(state.hold.until, this.now() + Math.max(minimum, delay)), reason };
    // Ban/cooldown survives a restart; URLs, account keys and signatures are never persisted.
    this.options.saveHolds?.({ binance: this.state('binance').hold, bybit: this.state('bybit').hold });
  }
  stats() {
    return (['binance', 'bybit'] as const).map(exchange => {
      const s = this.state(exchange);
      const recent = s.slots.filter(slot => this.now() - slot.at < 60_000);
      return { exchange, active: s.active, queued: s.queued, requests: s.requests, cacheHits: s.cacheHits, shared: s.shared,
        weightUsed: recent.reduce((sum, slot) => sum + slot.weight, 0), weightLimit: exchange === 'binance' ? this.options.weightPerMinute || 900 : null,
        backgroundWeightUsed: recent.filter(slot => slot.traffic === 'history').reduce((sum, slot) => sum + slot.weight, 0),
        queueTimeouts: s.queueTimeouts, upstreamTimeouts: s.upstreamTimeouts, lastError: s.lastError,
        disabled: this.options.disabled?.includes(exchange) || false,
        pausedUntil: s.hold.until > this.now() ? s.hold.until : null, reason: s.hold.until > this.now() ? s.hold.reason : undefined };
    });
  }
  private async acquire(provider: ExchangeProvider, cost: number, signal: AbortSignal, signed: boolean, scope?: { key: string; cap: number }, traffic: Traffic = 'analysis') {
    const state = this.state(provider);
    if (state.queued >= (traffic === 'market' ? 210 : 200)) throw new Error('Черга біржових даних заповнена. Повторіть пізніше.');
    state.queued++; state.waiting[traffic]++;
    try {
      while (true) {
        abort(signal);
        if (state.hold.until > this.now()) return false;
        const now = this.now();
        state.slots = state.slots.filter(slot => now - slot.at < 60_000);
        const recent = state.slots.filter(slot => now - slot.at < 5000);
        const privateSecond = state.slots.filter(slot => slot.signed && now - slot.at < 1000);
        const scoped = scope ? (this.scopedSlots.get(scope.key) || []).filter(at => now - at < 300_000) : [];
        if (scope) this.scopedSlots.set(scope.key, scoped);
        const minute = state.slots.reduce((sum, slot) => sum + slot.weight, 0);
        const minuteCap = this.options.weightPerMinute || 900;
        // Separate sub-budgets within the SAME total cap. Background badge history
        // cannot spend the capacity reserved for quotes and visible candle history.
        const analysis = state.slots.filter(slot => slot.traffic !== 'market');
        const history = analysis.filter(slot => slot.traffic === 'history');
        const fiveCap = this.options.requestsPerFiveSeconds || (provider === 'bybit' ? 80 : 100);
        let delay = Math.max(0, state.nextAt - now);
        if (provider === 'binance') {
          if (minute + cost > minuteCap) delay = Math.max(delay, state.slots[0].at + 60_001 - now);
          if (traffic !== 'market' && analysis.reduce((sum, slot) => sum + slot.weight, 0) + cost > Math.max(cost, Math.floor(minuteCap * .45)))
            delay = Math.max(delay, analysis[0].at + 60_001 - now);
          if (traffic === 'history' && history.reduce((sum, slot) => sum + slot.weight, 0) + cost > Math.max(cost, Math.floor(minuteCap * .18)))
            delay = Math.max(delay, history[0].at + 60_001 - now);
        }
        if (recent.length >= fiveCap) delay = Math.max(delay, recent[0].at + 5001 - now);
        if (signed && privateSecond.length >= (provider === 'bybit' ? 1 : 4)) delay = Math.max(delay, privateSecond[0].at + 1001 - now);
        if (scope && scoped.length >= scope.cap) delay = Math.max(delay, scoped[0] + 300_001 - now);
        if (state.active >= 4) delay = Math.max(delay, 25);
        // A newly opened chart or quote request gets the next free connection.
        if ((traffic !== 'market' && state.waiting.market > 0) || (traffic === 'history' && state.waiting.analysis > 0)) delay = Math.max(delay, 25);
        if (delay <= 0) {
          state.slots.push({ at: now, weight: cost, signed, traffic }); state.active++; state.requests++;
          if (scope) scoped.push(now);
          state.nextAt = now + (this.options.spacingMs ?? 65);
          return true;
        }
        await (this.options.wait || waitForMarketRetry)(Math.min(delay, 1000), signal);
      }
    } finally { state.queued--; state.waiting[traffic]--; }
  }
  async fetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
    const original = new URL(input instanceof Request ? input.url : String(input));
    const provider = exchangeProvider(original);
    const request = this.options.request || ((target, options) => globalThis.fetch(target, options));
    if (!provider) return request(input, init);
    if (this.options.disabled?.includes(provider)) return new Response(JSON.stringify({ error: 'Ринкове джерело призупинено власником' }), { status: 503, headers: { 'content-type': 'application/json' } });
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    const signed = headers.has('x-mbx-apikey') || headers.has('x-bapi-api-key') || headers.has('authorization') || original.searchParams.has('signature');
    headers.set('User-Agent', 'SignalHook/1.0 (+https://h00k.top)');
    const publicUrl = !signed && method === 'GET' ? publicMarketUrl(original) : null;
    const url = publicUrl || original;
    const state = this.state(provider), signal = init?.signal || (input instanceof Request ? input.signal : undefined);
    abort(signal);
    if (state.hold.until > this.now()) return unavailable(state.hold.until, this.now());
    const key = publicUrl?.href;
    const cached = key ? this.cache.get(key) : undefined;
    if (cached && cached.expires > this.now()) { state.cacheHits++; return reply(cached); }
    if (cached) { this.cacheBytes -= cached.body.byteLength; this.cache.delete(key!); }
    let pending = key ? this.pending.get(key) : undefined;
    if (pending) state.shared++;
    else {
      pending = this.load(provider, url, publicUrl, headers, method, input, init);
      if (key) { this.pending.set(key, pending); void pending.finally(() => this.pending.delete(key)).catch(() => {}); }
    }
    // A single closing browser must not cancel data shared by other clients.
    const saved = await new Promise<Saved>((resolve, reject) => {
      const cancel = () => reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', cancel, { once: true });
      pending!.then(resolve, reject).finally(() => signal?.removeEventListener('abort', cancel));
    });
    abort(signal); return reply(saved);
  }
  private async load(provider: ExchangeProvider, url: URL, publicUrl: URL | null, headers: Headers, method: string, input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Saved> {
    // Signed timestamps cannot sit in a queue; give them a short deadline and never resend.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(new Error('Біржа перевантажена або не відповідає')), publicUrl ? this.options.publicTimeoutMs ?? 12_000 : 3500);
    const state = this.state(provider);
    let acquired = false;
    try {
      const scope = provider === 'binance' && /\/fapi\/v1\/funding(Rate|Info)$/.test(url.pathname) ? { key: 'binance:funding', cap: 400 }
        : provider === 'binance' && url.pathname.startsWith('/futures/data/') ? { key: 'binance:statistics', cap: 800 } : undefined;
      acquired = await this.acquire(provider, weight(url), controller.signal, !publicUrl, scope, trafficFor(publicUrl));
      if (!acquired) {
        const response = unavailable(state.hold.until, this.now());
        return { body: new Uint8Array(await response.arrayBuffer()), headers: [...response.headers], status: response.status, expires: 0 };
      }
      const request = this.options.request || ((target, options) => globalThis.fetch(target, options));
      const response = await request(publicUrl ? url : input, { ...init, method, headers, signal: controller.signal, redirect: 'error' });
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > 8 * 1024 * 1024) throw new Error('Відповідь біржі завелика');
      let payload: any;
      try { payload = JSON.parse(new TextDecoder().decode(body)); } catch {}
      const retry = response.headers.get('retry-after');
      const retryMs = retry ? Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - this.now() : 0;
      const limited = [403, 418, 429, 451].includes(response.status);
      const bybitLimited = provider === 'bybit' && [10006, 10009, 10018].includes(payload?.retCode);
      const regional = response.status === 403 && /country|jurisdiction|restricted region|not available in your location/i.test(new TextDecoder().decode(body));
      if (limited || bybitLimited) this.hold(provider, regional ? 451 : limited ? response.status : payload.retCode === 10009 ? 418 : 429,
        Math.max(retryMs || 0, Number(response.headers.get('x-bapi-limit-reset-timestamp')) - this.now() || 0), bybitLimited ? `Bybit ${payload.retCode}` : undefined);
      // Observe shared-IP consumption, including traffic outside this process.
      const used = Math.max(...[...response.headers].filter(([name]) => /^x-mbx-used-weight-(1m|1s)$/.test(name)).map(([, value]) => Number(value)), 0);
      if (provider === 'binance' && used >= (this.options.weightPerMinute || 900)) this.hold(provider, 429, 60_000, 'Запас ліміту Binance вичерпано');
      const successful = response.ok && !bybitLimited && !(provider === 'bybit' && payload?.retCode !== undefined && payload.retCode !== 0);
      const saved: Saved = { body, headers: [...response.headers], status: publicUrl && response.ok && !successful ? bybitLimited ? 429 : 502 : response.status, expires: 0 };
      if (publicUrl && successful && payload !== undefined) {
        saved.expires = this.now() + ttl(url);
        saved.headers.push(['x-hook2-source-updated-at', String(this.now())]);
        this.cache.set(url.href, saved); this.cacheBytes += body.byteLength;
        while (this.cache.size > 2000 || this.cacheBytes > 32 * 1024 * 1024) {
          const key = this.cache.keys().next().value!, item = this.cache.get(key)!;
          this.cacheBytes -= item.body.byteLength; this.cache.delete(key);
        }
      }
      return saved;
    } catch (error) {
      if (!publicUrl) throw error;
      if (controller.signal.aborted) {
        if (acquired) state.upstreamTimeouts++; else state.queueTimeouts++;
      }
      state.lastError = !acquired ? 'Черга ринкових запитів перевантажена. Повторіть спробу.'
        : controller.signal.aborted ? 'Біржа не відповіла вчасно' : 'Помилка підключення до біржі';
      return { body: new TextEncoder().encode(JSON.stringify({ error: state.lastError })), status: 503,
        headers: [['content-type', 'application/json'], ['retry-after', '1']], expires: 0 };
    } finally { clearTimeout(timer); if (acquired) state.active--; }
  }
}

let gateway = new ExchangeGateway();
export function configureExchangeGateway(options: GatewayOptions) { gateway = new ExchangeGateway(options); }
export const exchangeFetch: typeof fetch = (input, init) => gateway.fetch(input, init);
export const exchangeGatewayStatus = () => gateway.stats();
export const pauseExchange = (provider: ExchangeProvider, status: number, retryMs = 0) => gateway.hold(provider, status, retryMs);
