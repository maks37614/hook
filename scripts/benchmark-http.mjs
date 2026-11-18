#!/usr/bin/env node
/**
 * Simulate independent browser sessions polling the public screener endpoint.
 * This calls ONLY your site's HTTP endpoint, never the exchange URLs.
 * Default target is loopback. Remote use requires explicit authorization flag.
 */
const read = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const url = new URL(read('--url',
  'http://127.0.0.1:3000/api/market/quotes?exchange=all&marketType=all&minVolume=0'));
const users = Number(read('--users', '50'));
const seconds = Number(read('--seconds', '60'));
const refreshMs = Number(read('--refresh-ms', '30000'));
const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
if (!['http:', 'https:'].includes(url.protocol) ||
    (!local && !process.argv.includes('--allow-remote')))
  throw new Error('HTTP(S) target required. Remote targets require --allow-remote.');
if (!['/api/market/quotes', '/api/health', '/api/market/sentiment'].includes(url.pathname))
  throw new Error('Only read-only public H00K endpoints are allowed.');
if (![users, seconds, refreshMs].every(Number.isFinite) ||
    !Number.isSafeInteger(users) || users < 1 || users > 10_000 ||
    seconds < 10 || seconds > 300 || refreshMs < 1_000 || refreshMs > 120_000)
  throw new Error('Limits: --users 1..10000, --seconds 10..300, --refresh-ms 1000..120000.');

const started = Date.now();
const endAt = started + seconds * 1000;
const times = [];
const stats = { target: url.origin, endpoint: url.pathname, users, seconds, refreshMs,
  attempts: 0, successes: 0, status429: 0, status5xx: 0, otherHttpErrors: 0,
  networkErrors: 0, requestsWithStaleSources: 0, peakInFlight: 0 };
let inFlight = 0;
const timers = new Set();
const pending = new Set();
const schedule = (fn, delay) => {
  const t = setTimeout(() => { timers.delete(t); fn(); }, delay);
  timers.add(t);
};

function poll() {
  if (Date.now() >= endAt) return;
  stats.attempts++;
  inFlight++;
  stats.peakInFlight = Math.max(stats.peakInFlight, inFlight);
  const start = Date.now();
  const request = (async () => {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      const elapsed = Date.now() - start;
      times.push(elapsed);
      if (res.status === 429) stats.status429++;
      else if (res.status >= 500) stats.status5xx++;
      else if (!res.ok) stats.otherHttpErrors++;
      else stats.successes++;
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const body = await res.json();
        if (Array.isArray(body?.sources) && body.sources.some(source => source.status !== 'live'))
          stats.requestsWithStaleSources++;
      } else {
        await res.arrayBuffer().catch(() => {});
      }
    } catch { stats.networkErrors++; }
    finally {
      inFlight--;
      pending.delete(request);
      if (Date.now() + refreshMs < endAt) schedule(poll, refreshMs);
    }
  })();
  pending.add(request);
}

const spread = Math.min(refreshMs, Math.round(seconds * 500));
for (let i = 0; i < users; i++) schedule(poll, Math.floor(Math.random() * spread));
await new Promise(resolve => setTimeout(resolve, seconds * 1000));
for (const timer of timers) clearTimeout(timer);
timers.clear();
let settleTimer;
await Promise.race([
  Promise.allSettled([...pending]),
  new Promise(resolve => { settleTimer = setTimeout(resolve, 11_000); }),
]);
if (settleTimer) clearTimeout(settleTimer);
times.sort((a, b) => a - b);
const percentile = p => times.length ? times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)] : null;
console.log(JSON.stringify({ ...stats,
  requestsPerSecond: Number((stats.attempts / seconds).toFixed(2)),
  p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
  maxMs: times.length ? times[times.length - 1] : null,
}, null, 2));
if (stats.status429 || stats.status5xx || stats.networkErrors) process.exitCode = 1;
