import type { Express, Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { AuthFailure, identityPool } from './pgIdentity';
import { requireUserAuth } from './userAuth';
import { rateLimit } from './pgIdentityRoutes';

let ready: Promise<void> | undefined;
async function ensureTable() {
  if (!ready) ready = (async () => {
    const client = await identityPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(811040127)');
      await client.query(readFileSync(new URL('./migrations/007_replay_state.sql', import.meta.url), 'utf8'));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
const invalid = (field: string): never => {
  throw new AuthFailure(400, 'Некоректні дані Replay: ' + field, 'INVALID_REPLAY_STATE');
};
const obj = (x: any, field: string): Record<string, any> => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) invalid(field);
  return x;
};
const str = (x: any, field: string, max = 200): string => {
  if (typeof x !== 'string' || !x.length || x.length > max) invalid(field);
  return x;
};
const optStr = (x: any, field: string, max = 300): string | undefined => x == null
  ? undefined : typeof x === 'string' && x.length <= max ? x : invalid(field);
const number = (x: any, field: string, min = 0, max = 1e15): number => {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) invalid(field);
  return x;
};
const optNum = (x: any, field: string): number | undefined => x == null ? undefined : number(x, field);
const pick = <T extends string>(x: any, values: readonly T[], field: string): T => {
  if (!values.includes(x)) invalid(field);
  return x as T;
};
const symbol = (x: any): string => {
  const result = str(x, 'symbol', 45);
  if (!/^[A-Za-z0-9_.:-]{2,45}$/.test(result)) invalid('symbol');
  return result;
};
const exchange = (x: any) => pick(x, ['binance','bybit'] as const, 'exchange');
const market = (x: any) => pick(x, ['spot','futures'] as const, 'marketType');
const timeframe = (x: any) => pick(x, ['1m','5m','15m','1h','4h','1d'] as const, 'timeframe');
const position = (raw: any) => {
  if (raw == null) return null;
  const p = obj(raw, 'position');
  return {
    id: str(p.id, 'position.id', 90), symbol: symbol(p.symbol),
    side: pick(p.side, ['long','short'] as const, 'position.side'),
    entryPrice: number(p.entryPrice, 'entryPrice'),
    currentPrice: number(p.currentPrice, 'currentPrice'),
    sizeUsd: number(p.sizeUsd, 'sizeUsd'),
    marginUsd: number(p.marginUsd, 'marginUsd'),
    quantity: number(p.quantity, 'quantity'),
    leverage: number(p.leverage, 'leverage', 1, 1000),
    slPrice: optNum(p.slPrice, 'slPrice'), tpPrice: optNum(p.tpPrice, 'tpPrice'),
    entryTime: number(p.entryTime, 'entryTime', 1, 1e12),
    unrealizedPnlUsd: number(p.unrealizedPnlUsd, 'unrealizedPnlUsd', -1e15),
    unrealizedPnlPct: number(p.unrealizedPnlPct, 'unrealizedPnlPct', -1e9),
    liquidationPrice: number(p.liquidationPrice, 'liquidationPrice'),
    tag: optStr(p.tag, 'tag'),
    notes: optStr(p.notes, 'position.notes', 3000),
  };
};
const pendingOrder = (raw: any) => {
  const o = obj(raw, 'order');
  return {
    id: str(o.id, 'order.id', 90), symbol: symbol(o.symbol),
    side: pick(o.side, ['buy','sell'] as const, 'order.side'),
    orderType: pick(o.orderType, ['limit','stop'] as const, 'order.type'),
    price: number(o.price, 'order.price'),
    sizeUsd: number(o.sizeUsd, 'order.sizeUsd'),
    leverage: number(o.leverage, 'order.leverage', 1, 1000),
    slPrice: optNum(o.slPrice, 'order.slPrice'),
    tpPrice: optNum(o.tpPrice, 'order.tpPrice'),
    tag: optStr(o.tag, 'order.tag'),
    notes: optStr(o.notes, 'order.notes', 3000),
    createdAtTime: number(o.createdAtTime, 'order.createdAtTime', 1, 1e12),
  };
};
const trade = (raw: any) => {
  const t = obj(raw, 'trade'), id = str(t.id, 'trade.id', 90);
  const screenshotUrl = optStr(t.screenshotUrl, 'trade.screenshot', 120);
  if (screenshotUrl && screenshotUrl !== 'idb:' + id) invalid('trade.screenshot');
  return {
    id, symbol: symbol(t.symbol),
    exchange: exchange(t.exchange), marketType: market(t.marketType),
    timeframe: timeframe(t.timeframe),
    side: pick(t.side, ['long','short'] as const, 'trade.side'),
    entryPrice: number(t.entryPrice, 'entryPrice'),
    exitPrice: number(t.exitPrice, 'exitPrice'),
    entryTime: number(t.entryTime, 'entryTime', 1, 1e12),
    exitTime: number(t.exitTime, 'exitTime', 1, 1e12),
    sizeUsd: number(t.sizeUsd, 'sizeUsd'),
    marginUsd: number(t.marginUsd, 'marginUsd'),
    leverage: number(t.leverage, 'leverage', 1, 1000),
    slPrice: optNum(t.slPrice, 'slPrice'), tpPrice: optNum(t.tpPrice, 'tpPrice'),
    pnlUsd: number(t.pnlUsd, 'pnlUsd', -1e15),
    pnlPct: number(t.pnlPct, 'pnlPct', -1e9),
    commissionUsd: number(t.commissionUsd, 'commissionUsd'),
    tag: optStr(t.tag, 'tag') || 'Replay Trade',
    notes: optStr(t.notes, 'notes', 3000),
    screenshotUrl,
    exitReason: pick(t.exitReason, ['tp','sl','manual','liquidation','limit'] as const, 'exitReason'),
  };
};
export function validateReplayPayload(input: unknown) {
  const raw = obj(input, 'state');
  const s = obj(raw.settings, 'settings');
  const journal = Array.isArray(raw.journal) && raw.journal.length <= 700
    ? raw.journal.map(trade) : invalid('journal');
  const pendingOrders = Array.isArray(raw.pendingOrders) && raw.pendingOrders.length <= 200
    ? raw.pendingOrders.map(pendingOrder) : invalid('pendingOrders');
  if (new Set(journal.map((x: any) => x.id)).size !== journal.length) invalid('duplicate trade ids');
  const c = obj(raw.context, 'context');
  return {
    settings: {
      balance: number(s.balance, 'balance'),
      leverage: number(s.leverage, 'leverage', 1, 1000),
      positionSizeUsd: number(s.positionSizeUsd, 'positionSizeUsd'),
      commissionPct: number(s.commissionPct, 'commissionPct', 0, 100),
      spreadPct: number(s.spreadPct, 'spreadPct', 0, 100),
      slippagePct: number(s.slippagePct, 'slippagePct', 0, 100),
      autoSlPct: optNum(s.autoSlPct, 'autoSlPct'),
      autoTpPct: optNum(s.autoTpPct, 'autoTpPct'),
    },
    position: position(raw.position), pendingOrders, journal,
    context: {
      symbol: symbol(c.symbol), exchange: exchange(c.exchange),
      marketType: market(c.marketType), timeframe: timeframe(c.timeframe),
      atTime: optNum(c.atTime, 'context.atTime'),
    },
    resetCount: number(raw.resetCount ?? 0, 'resetCount', 0, 1e9),
  };
}
function failed(res: Response, error: unknown) {
  if (error instanceof AuthFailure) res.status(error.status)
    .json({ success: false, code: error.code, error: error.message });
  else {
    console.error('[Replay profile]', error instanceof Error ? error.message : String(error));
    res.status(503).json({ success: false, code: 'REPLAY_STORE_OFFLINE', error: 'Replay зараз не може зберегти стан профілю.' });
  }
}
export function installReplayProfileRoutes(app: Express) {
  app.get('/api/account/replay', requireUserAuth, async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      await ensureTable();
      const { rows } = await identityPool().query(
        'SELECT revision, payload FROM auth_replay_state WHERE user_id = $1', [res.locals.userId],
      );
      res.json({ success: true, revision: Number(rows[0]?.revision ?? 0), state: rows[0]?.payload ?? null });
    } catch (error) { failed(res, error); }
  });
  app.put('/api/account/replay', requireUserAuth, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      rateLimit(req, 'replay-write', 120, 60_000, false, res.locals.userId);
      const expected = req.body?.expectedRevision;
      if (!Number.isSafeInteger(expected) || expected < 0) invalid('revision');
      const state = validateReplayPayload(req.body?.state);
      const serialized = JSON.stringify(state);
      if (serialized.length > 300_000) invalid('state too large');
      await ensureTable();
      // A nonexistent snapshot may only be created with revision zero. A
      // stale writer carrying revision N must not resurrect a deleted row.
      // Once present, compare-and-swap is a single atomic UPDATE.
      const statement = expected === 0
        ? 'INSERT INTO auth_replay_state(user_id,revision,payload,updated_at) VALUES ($1,1,$2::jsonb,now()) ON CONFLICT(user_id) DO NOTHING RETURNING revision'
        : 'UPDATE auth_replay_state SET revision=revision+1,payload=$2::jsonb,updated_at=now() WHERE user_id=$1 AND revision=$3::bigint RETURNING revision';
      const args = expected === 0
        ? [res.locals.userId, serialized]
        : [res.locals.userId, serialized, expected];
      const { rows } = await identityPool().query(statement, args);
      if (!rows[0]) throw new AuthFailure(409, 'Replay змінено в іншій вкладці. Перезавантажте стан профілю.', 'REPLAY_CONFLICT');
      res.json({ success: true, revision: Number(rows[0].revision) });
    } catch (error) { failed(res, error); }
  });
}
