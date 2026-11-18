import type { Express } from 'express';
import { liquidationArchive } from './liquidationArchive';

type Payload = Awaited<ReturnType<typeof liquidationArchive.heatmap>>;

/** Public read-only observed liquidation history; only enabled for the
 * opt-in PostgreSQL archive. No polling or extra exchange connections.
 */
export function installLiquidationArchiveRoutes(app: Express) {
  if (!liquidationArchive.enabled) {
    // Explicit 404 keeps SPA fallback from returning index.html (HTTP 200).
    // No database connection, polling, or market-data fetch occurs here.
    app.get('/api/hookchart/liquidation-heatmap', (_req,res) => {
      res.setHeader('Cache-Control','no-store');
      res.status(404).json({ success:false, code:'LIQ_ARCHIVE_DISABLED' });
    });
    return;
  }
  // Runs only for an enabled PostgreSQL archive. The first check catches up
  // after VPS downtime; subsequent checks do not affect normal HookChart Liq.
  liquidationArchive.startMonthlyMaintenance();

  // 8 MiB serialized-data ceiling (heap usage is higher and engine-specific).
  // Never let hundreds of different enabled chart maps grow an unbounded RAM
  // cache; these are reusable only while someone is viewing the map.
  const MAX_CACHE_BYTES = 8 * 1024 * 1024;
  let cacheBytes = 0;
  let cacheMonth = new Date().toISOString().slice(0, 7);
  const cached = new Map<string, { at: number; data: Payload; bytes: number }>();
  const putCache = (key: string, data: Payload) => {
    const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
    const previous = cached.get(key);
    if (previous) { cacheBytes -= previous.bytes; cached.delete(key); }
    // Large maps are still served, but not kept in shared server RAM.
    if (bytes > MAX_CACHE_BYTES) return;
    while (cached.size >= 40 || cacheBytes + bytes > MAX_CACHE_BYTES) {
      const oldest = cached.keys().next().value;
      if (oldest === undefined) break;
      cacheBytes -= cached.get(oldest)!.bytes;
      cached.delete(oldest);
    }
    cached.set(key, { at: Date.now(), data, bytes });
    cacheBytes += bytes;
  };
  const inflight = new Map<string, Promise<Payload>>();
  const throttles = new Map<string, { at: number; count: number }>();

  app.get('/api/hookchart/liquidation-heatmap', async (req, res) => {
    const exchange = req.query.exchange;
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    const period = req.query.period;
    if ((exchange !== 'binance' && exchange !== 'bybit') ||
        !/^[\p{L}\p{M}\p{N}]{3,80}$/u.test(symbol) ||
        (period !== '24h' && period !== '7d')) {
      res.status(400).json({ success:false, error:'Invalid liquidation heatmap scope' });
      return;
    }
    const now = Date.now();
    const ip = req.ip || 'unknown';
    let rate = throttles.get(ip);
    if (!rate || now - rate.at > 60_000) rate = {at:now,count:0};
    rate.count++;
    throttles.set(ip,rate);
    if (rate.count > 30) {
      res.status(429).json({success:false,error:'Too many heatmap requests'});
      return;
    }
    if (throttles.size > 2500) for (const [key,value] of throttles)
      if (now - value.at > 60_000) throttles.delete(key);

    const hours = period === '24h' ? 24 : 168;
    // Clear old month RAM buffers as well as their cache keys. This runs only
    // on an explicit heatmap request, with no timer when the map is off.
    const month = new Date(now).toISOString().slice(0, 7);
    if (cacheMonth !== month) {
      cached.clear();
      cacheBytes = 0;
      cacheMonth = month;
    }
    const key = month + ':' + exchange + ':' + symbol + ':' + hours;
    const stored = cached.get(key);
    if (stored && now - stored.at < 30_000) {
      res.set('Cache-Control','public, max-age=20');
      res.json({ success:true, data:stored.data });
      return;
    }
    if (inflight.size >= 2 && !inflight.has(key)) {
      res.status(503).json({success:false,error:'Heatmap history is busy'});
      return;
    }
    let job = inflight.get(key);
    if (!job) {
      job = liquidationArchive.heatmap(exchange, symbol, hours);
      inflight.set(key, job);
    }
    try {
      const result = await job;
      putCache(key, result);
      res.set('Cache-Control','public, max-age=20');
      res.json({ success:true, data:result });
    } catch {
      res.status(503).json({success:false,error:'Observed liquidation history unavailable'});
    } finally {
      if (inflight.get(key) === job) inflight.delete(key);
    }
  });
}
