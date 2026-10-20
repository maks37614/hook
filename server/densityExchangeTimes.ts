import WebSocket, { type RawData } from 'ws';
import { openExchangeSocket, type SharedExchangeSocket } from './exchangeStreamPool';
import type { ExchangeId, MarketType } from '../src/types';

export type WallSide = 'bid' | 'ask';

// Time of a qualifying PRICE-LEVEL transition observed in live exchange
// depth deltas. This is not the private order's placement timestamp.
interface Transition {
  side: WallSide;
  price: number;
  priceKey: string;
  fromUsd: number;
  toUsd: number;
  exchangeTime: number;
}
interface DepthTracker {
  id: string;
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  ws: SharedExchangeSocket;
  touchedAt: number;
  ready: boolean;
  bids: Map<string, number>;
  asks: Map<string, number>;
  removedBids: Map<string, number>;
  removedAsks: Map<string, number>;
  transitions: Transition[];
  ping?: ReturnType<typeof setInterval>;
  shutdown?: ReturnType<typeof setTimeout>;
}
const watchers = new Map<string, DepthTracker>();
const MAX_STREAMS = 12;
const STREAM_IDLE_MS = 2 * 60_000;
const MAX_TRANSITIONS = 500;
const MAX_EVENT_AGE_MS = 3 * 60 * 60_000;
const idFor = (exchange: string, market: string, symbol: string) =>
  [exchange, market, symbol].join(':');

function stop(id: string) {
  const watcher = watchers.get(id);
  if (!watcher) return;
  watchers.delete(id);
  if (watcher.ping) clearInterval(watcher.ping);
  if (watcher.shutdown) clearTimeout(watcher.shutdown);
  watcher.ws.removeAllListeners();
  // A connection can be evicted while its TLS handshake is still pending.
  // Keep an error listener to avoid crashing the server on late socket errors.
  watcher.ws.on('error', () => {});
  try {
    if (watcher.ws.readyState === WebSocket.CONNECTING) watcher.ws.terminate();
    else if (watcher.ws.readyState === WebSocket.OPEN) watcher.ws.close();
  } catch { /* already disconnected */ }
}
function updateFromDelta(tracker: DepthTracker, side: WallSide,
  updates: unknown, exchangeTime: number, snapshot: boolean) {
  if (!Array.isArray(updates)) return;
  const book = side === 'bid' ? tracker.bids : tracker.asks;
  const removed = side === 'bid' ? tracker.removedBids : tracker.removedAsks;
  for (const value of updates) {
    if (!Array.isArray(value) || value.length < 2) continue;
    const price = Number(value[0]);
    // Binance/Bybit can serialize one price as "1.2300" or "1.23".
    const priceText = String(price);
    const qty = Number(value[1]);
    if (!(price > 0 && Number.isFinite(price) && qty >= 0 && Number.isFinite(qty))) continue;
    const previous = book.get(priceText);
    // An unobserved price may have entered the limited depth window.
    // Only a known previous quantity OR an observed deletion proves a
    // threshold crossing; never infer order birth from an initial snapshot.
    if (!snapshot && tracker.ready && (previous !== undefined || removed.has(priceText))) {
      const fromUsd = price * (previous || 0);
      const toUsd = price * qty;
      if (toUsd > fromUsd) {
        tracker.transitions.push({ side, price, priceKey: priceText, fromUsd, toUsd, exchangeTime });
      }
    }
    if (qty === 0) {
      book.delete(priceText);
      if (!snapshot) removed.set(priceText, exchangeTime);
    } else {
      book.set(priceText, qty);
      removed.delete(priceText);
    }
  }
  if (tracker.transitions.length > MAX_TRANSITIONS) {
    tracker.transitions.splice(0, tracker.transitions.length - MAX_TRANSITIONS);
  }
  // Avoid unbounded memory if a Bybit snapshot is unexpectedly large.
  if (book.size > 1500) {
    for (const key of [...book.keys()].slice(0, book.size - 1500)) book.delete(key);
  }
  if (removed.size > 1500) {
    for (const key of [...removed.keys()].slice(0, removed.size - 1500)) removed.delete(key);
  }
}
function handleMessage(tracker: DepthTracker, raw: RawData) {
  let message: any;
  try { message = JSON.parse(raw.toString()); } catch { return; }
  if (!message || typeof message !== 'object') return;
  const data = tracker.exchange === 'bybit' ? message.data : message;
  if (!data || typeof data !== 'object') return;
  const at = Number(tracker.exchange === 'bybit'
    ? (message.cts || message.ts) : (data.T || data.E));
  if (!(at > 0 && at <= Date.now() + 60_000 && at >= Date.now() - MAX_EVENT_AGE_MS)) return;
  if (tracker.exchange === 'bybit') {
    if (data.s !== tracker.symbol || (message.type !== 'snapshot' && message.type !== 'delta')) return;
    if (message.type === 'snapshot') {
      // A snapshot cannot tell us when the level appeared.
      tracker.bids.clear();
      tracker.asks.clear();
      tracker.removedBids.clear();
      tracker.removedAsks.clear();
      tracker.transitions.length = 0;
      tracker.ready = false;
      updateFromDelta(tracker, 'bid', data.b, at, true);
      updateFromDelta(tracker, 'ask', data.a, at, true);
      tracker.ready = true;
      return;
    }
    if (!tracker.ready) return;
    updateFromDelta(tracker, 'bid', data.b, at, false);
    updateFromDelta(tracker, 'ask', data.a, at, false);
  } else {
    if (data.s !== tracker.symbol || data.e !== 'depthUpdate') return;
    // Binance diff stream has no initial snapshot. First update of a level
    // establishes its state; only subsequent crossings may be timestamped.
    updateFromDelta(tracker, 'bid', data.b, at, false);
    updateFromDelta(tracker, 'ask', data.a, at, false);
    tracker.ready = true;
  }
}

function start(exchange: ExchangeId, marketType: MarketType, symbol: string) {
  const id = idFor(exchange, marketType, symbol);
  if (watchers.has(id)) {
    const tracker = watchers.get(id)!;
    tracker.touchedAt = Date.now();
    return;
  }
  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) return;
  if (watchers.size >= MAX_STREAMS) {
    const oldest = [...watchers.values()].sort((a, b) => a.touchedAt - b.touchedAt)[0];
    if (oldest) stop(oldest.id);
  }
  const url = exchange === 'bybit'
    ? 'wss://stream.bybit.com/v5/public/' + (marketType === 'spot' ? 'spot' : 'linear')
    : marketType === 'futures'
      ? 'wss://fstream.binance.com/ws/' + symbol.toLowerCase() + '@depth@100ms'
      : 'wss://stream.binance.com:9443/ws/' + symbol.toLowerCase() + '@depth@100ms';
  const ws = openExchangeSocket(url);
  const tracker: DepthTracker = {
    id, exchange, marketType, symbol, ws, touchedAt: Date.now(), ready: false,
    bids: new Map(), asks: new Map(), removedBids: new Map(), removedAsks: new Map(), transitions: [],
  };
  watchers.set(id, tracker);
  ws.on('open', () => {
    if (exchange === 'bybit') {
      ws.send(JSON.stringify({ op: 'subscribe', args: ['orderbook.200.' + symbol] }));
      tracker.ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
      }, 20_000);
      tracker.ping.unref?.();
    }
  });
  ws.on('message', data => {
    if (watchers.get(id) === tracker) handleMessage(tracker, data);
  });
  ws.on('error', () => { stop(id); });
  ws.on('close', () => { stop(id); });
  tracker.shutdown = setTimeout(() => { if (watchers.get(id) === tracker) stop(id); }, STREAM_IDLE_MS);
  tracker.shutdown.unref?.();
}

export function watchExchangeOrderbooks(coins: { exchange: ExchangeId; marketType: MarketType; symbol: string }[]) {
  // Called for up to eight visible density cards on each verification tick.
  for (const coin of coins.slice(0, 8)) {
    const id = idFor(coin.exchange, coin.marketType, coin.symbol);
    const tracker = watchers.get(id);
    if (tracker) {
      tracker.touchedAt = Date.now();
      if (tracker.shutdown) clearTimeout(tracker.shutdown);
      tracker.shutdown = setTimeout(() => stop(id), STREAM_IDLE_MS);
      tracker.shutdown.unref?.();
    } else start(coin.exchange, coin.marketType, coin.symbol);
  }
}

export function exchangeLevelAppearance(
  coin: { exchange: ExchangeId; marketType: MarketType; symbol: string },
  side: WallSide,
  levelPrice: number,
  minNotionalUsd: number,
  bucketPct: number,
): number | undefined {
  const tracker = watchers.get(idFor(coin.exchange, coin.marketType, coin.symbol));
  if (!tracker?.ready) return;
  const tolerance = Math.max(levelPrice * bucketPct / 100, levelPrice * 0.00005);
  // The earliest event crossing the configured wall threshold for a
  // matching raw price-level, after streaming started. Excludes preexisting
  // levels; it must not be presented as an individual order's creation time.
  const now = Date.now();
  const eligible = tracker.transitions.filter(item =>
    item.side === side &&
    now - item.exchangeTime <= MAX_EVENT_AGE_MS &&
    Math.abs(item.price - levelPrice) <= tolerance &&
    item.fromUsd < minNotionalUsd &&
    item.toUsd >= minNotionalUsd &&
    ((item.side === 'bid' ? tracker.bids : tracker.asks).get(item.priceKey) || 0) * item.price >= minNotionalUsd
  );
  if (!eligible.length) return;
  // Prefer the most recent crossing: a wall could have disappeared and returned.
  return eligible[eligible.length - 1].exchangeTime;
}
