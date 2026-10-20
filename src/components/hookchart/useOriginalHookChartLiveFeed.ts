import { MarketWebSocket as WebSocket } from '../../utils/marketTransport';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExchangeId, HookChartPreferences, MarketType } from '../../types';
import { atr, quantile, robustThreshold, type MarketPrint } from './marketAnalytics';
import { calcCascadeRisk, type Candle, type Density, type Liquidation } from './engine';

type BookLevel = { p: number; q: number };

type LiveFeedArgs = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  settings: HookChartPreferences;
  candles: Candle[];
  replay?: boolean;
};

const BINANCE_FUTURES_API = 'https://fapi.binance.com';
const BINANCE_SPOT_APIS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/ws';
const BINANCE_SPOT_WS = 'wss://stream.binance.com:9443/ws';
const BYBIT_API = 'https://api.bybit.com';
const BYBIT_WS = {
  futures: 'wss://stream.bybit.com/v5/public/linear',
  spot: 'wss://stream.bybit.com/v5/public/spot',
} as const;

const adaptiveCut = (values: number[], loQ = .97, hiQ = .995, madMult = 3.2) => {
  const valid = values.filter(value => Number.isFinite(value) && value > 0);
  if (!valid.length) return 0;
  if (valid.length < 20) return Math.max(1, quantile(valid, .8) * 1.35);
  const lo = quantile(valid, loQ);
  const hi = Math.max(lo, quantile(valid, hiQ));
  const raw = robustThreshold(valid, loQ, madMult) || lo;
  return Math.max(1, Math.min(hi, Math.max(lo, raw)));
};

async function fetchBinanceJson(path: string, marketType: MarketType, signal?: AbortSignal) {
  const hosts = marketType === 'futures' ? [BINANCE_FUTURES_API] : BINANCE_SPOT_APIS;
  let lastError: unknown;
  for (const host of hosts) {
    try {
      const response = await fetch(`${host}${path}`, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Binance unavailable');
}

export function useOriginalHookChartLiveFeed({
  exchange,
  marketType,
  symbol,
  settings,
  candles,
  replay = false,
}: LiveFeedArgs) {
  const [densities, setDensities] = useState<Density[]>([]);
  const [marketPrints, setMarketPrints] = useState<MarketPrint[]>([]);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [liquidationCut, setLiquidationCut] = useState(0);
  const [liquidationStreamLive, setLiquidationStreamLive] = useState(false);
  const [liquidationLastEventAt, setLiquidationLastEventAt] = useState<number | null>(null);
  const [densityCut, setDensityCut] = useState(0);
  const [book, setBook] = useState<{ b: BookLevel[]; a: BookLevel[] }>({ b: [], a: [] });
  const [fundingRate, setFundingRate] = useState(Number.NaN);
  const [fundingHistory, setFundingHistory] = useState<number[]>([]);
  const [depthReady, setDepthReady] = useState(false);
  const priceRef = useRef(0);
  const atrRef = useRef(0);

  useEffect(() => {
    const last = candles.at(-1);
    if (last?.c) priceRef.current = last.c;
    atrRef.current = atr(candles, 50);
  }, [candles]);

  useEffect(() => {
    const exchangeSymbol = /^[\p{L}\p{M}\p{N}]+$/u.test(symbol);
    if (replay || !exchangeSymbol) {
      setDensities([]);
      setMarketPrints([]);
      setBook({ b: [], a: [] });
      setDepthReady(false);
      setDensityCut(0);
      return;
    }

    let dead = false;
    let depthSocket: WebSocket | null = null;
    let tradeSocket: WebSocket | null = null;
    let depthPing: ReturnType<typeof setInterval> | null = null;
    let tradePing: ReturnType<typeof setInterval> | null = null;
    let snapshotController: AbortController | null = null;
    let snapshotReady = false;
    let lastUpdateId = 0;
    const depthBuffer: any[] = [];
    const bids = new Map<number, number>();
    const asks = new Map<number, number>();
    const densityMap = new Map<string, Density>();
    const tradeWindow: Array<{ t: number; usd: number }> = [];
    let lastThresholdCalc = 0;
    let bookThreshold = 0;
    let lastTradeThresholdCalc = 0;
    let tradeCut = 0;
    let burst: { side: 'BUY' | 'SELL'; start: number; last: number; usd: number; pv: number; count: number; id: string } | null = null;

    const applyLevels = (levels: Array<[string | number, string | number]>, target: Map<number, number>) => {
      for (const row of levels || []) {
        const p = Number(row[0]);
        const q = Number(row[1]);
        if (!Number.isFinite(p) || !Number.isFinite(q) || p <= 0) continue;
        if (q > 0) target.set(p, q);
        else target.delete(p);
      }
    };

    const touchTolerance = () => {
      const price = priceRef.current;
      return Math.max(price * .00055, (atrRef.current || price * .001) * .18);
    };

    const scoreDensity = (density: Density, cut: number) => {
      const price = priceRef.current;
      const age = Math.max(0, (Date.now() - density.first) / 1000);
      const size = Math.min(3, density.usd / Math.max(1, cut));
      const persistence = Math.min(1, Math.log1p(age) / Math.log(121));
      const repl = Math.min(1, density.replenishments / 3);
      const proximity = price ? Math.max(0, 1 - Math.abs(density.p - price) / (price * .05)) : 0;
      density.score = size * .42 + persistence * .23 + repl * .2 + proximity * .1 + Math.min(1, density.touches / 4) * .05;
      density.mmScore = Math.max(0, Math.min(100, Math.round(100 * (
        persistence * .28 + repl * .28 + Math.min(1, density.touches / 4) * .2 + Math.min(1, size / 2) * .14 + (density.reacted ? .1 : 0)
      ))));
    };

    const publishDensities = (cut: number) => {
      const now = Date.now();
      const minAge = Math.max(0, settings.densityTimeoutMin || 0) * 60_000;
      const all = [...densityMap.values()].filter(row => now - row.last < 12 * 60_000 && now - row.first >= minAge);
      all.forEach(row => scoreDensity(row, cut));
      const active = all.filter(row => row.active).sort((a, b) => b.score - a.score);
      const pick = (side: Density['side']) => active.filter(row => row.side === side).slice(0, 4);
      const history = all.filter(row => !row.active && (row.touches > 0 || row.reacted)).sort((a, b) => b.last - a.last).slice(0, 4);
      const unique = new Map([...pick('ASK'), ...pick('BID'), ...history].map(row => [row.id, row]));
      setDensities([...unique.values()].sort((a, b) => b.score - a.score).slice(0, 12));
    };

    const applyBook = () => {
      if (dead) return;
      const bestBid = bids.size ? Math.max(...bids.keys()) : 0;
      const bestAsk = asks.size ? Math.min(...asks.keys()) : 0;
      const price = priceRef.current || (bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0);
      if (!price) return;
      priceRef.current = price;
      const diff = Math.max(.1, Math.min(20, settings.densityDiffPct ?? 5)) / 100;
      const b = [...bids].filter(([p, q]) => q > 0 && p >= price * (1 - diff) && p <= price)
        .sort((x, y) => y[0] - x[0]).map(([p, q]) => ({ p, q }));
      const a = [...asks].filter(([p, q]) => q > 0 && p <= price * (1 + diff) && p >= price)
        .sort((x, y) => x[0] - y[0]).map(([p, q]) => ({ p, q }));
      setBook({ b: b.slice(0, 40), a: a.slice(0, 40) });
      const now = Date.now();
      const notionals = [...b, ...a].map(row => row.p * row.q).filter(value => value > 0);
      if (!bookThreshold || now - lastThresholdCalc > 5000) {
        const base = adaptiveCut(notionals, .97, .995, 3.2) || 50_000;
        bookThreshold = base * Math.max(.1, Math.min(10, settings.densityAutoMultiplier ?? 1));
        lastThresholdCalc = now;
      }
      const manual = settings.densityMode === 'manual' && (settings.densityThreshold || 0) > 0;
      const cut = manual ? Math.max(1, settings.densityThreshold || 0) : bookThreshold;
      setDensityCut(cut);
      if (settings.densityAnalysis === false) {
        densityMap.clear();
        setDensities([]);
        return;
      }
      const levels = [
        ...b.map(row => ({ ...row, side: 'BID' as const })),
        ...a.map(row => ({ ...row, side: 'ASK' as const })),
      ].filter(row => row.p * row.q >= cut);
      const seen = new Set<string>();
      const tolerance = touchTolerance();
      for (const row of levels) {
        const id = `${row.side}:${row.p}`;
        const usd = row.p * row.q;
        seen.add(id);
        let density = densityMap.get(id);
        if (!density) {
          density = {
            id, side: row.side, p: row.p, q: row.q, usd, peakUsd: usd,
            first: now, last: now, active: true, touches: 0, lastTouch: 0,
            replenishments: 0, updates: 1, score: 0, mmScore: 0,
          };
          densityMap.set(id, density);
        } else {
          if (usd > density.usd * 1.22 && density.usd > 0) density.replenishments += 1;
          density.q = row.q;
          density.usd = usd;
          density.peakUsd = Math.max(density.peakUsd, usd);
          density.last = now;
          density.active = true;
          density.updates += 1;
        }
        if (Math.abs(price - density.p) <= tolerance && now - density.lastTouch > 15_000) {
          density.touches += 1;
          density.lastTouch = now;
        }
        if (density.touches > 0 && Math.abs(price - density.p) >= Math.max(tolerance * 3, (atrRef.current || price * .001) * .35)) {
          density.reacted = true;
          density.reaction = Math.abs(price - density.p) / density.p * 100;
        }
      }
      for (const density of densityMap.values()) {
        if (!seen.has(density.id) && now - density.last > 900) density.active = false;
      }
      publishDensities(cut);
    };

    const syncBinanceSnapshot = async () => {
      if (dead) return;
      snapshotReady = false;
      setDepthReady(false);
      snapshotController?.abort();
      snapshotController = new AbortController();
      try {
        const path = marketType === 'futures'
          ? `/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=1000`
          : `/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=1000`;
        const data = await fetchBinanceJson(path, marketType, snapshotController.signal);
        if (dead) return;
        bids.clear();
        asks.clear();
        applyLevels(data?.bids || [], bids);
        applyLevels(data?.asks || [], asks);
        lastUpdateId = Number(data?.lastUpdateId || 0);
        snapshotReady = lastUpdateId > 0;
        if (!snapshotReady) return;
        const buffered = depthBuffer.splice(0).filter(item => Number(item?.u || 0) > lastUpdateId);
        for (const event of buffered) {
          if (event.pu != null && Number(event.pu) !== lastUpdateId) break;
          if (event.pu == null && Number(event.U || event.u || 0) > lastUpdateId + 1) break;
          applyLevels(event.b || [], bids);
          applyLevels(event.a || [], asks);
          lastUpdateId = Number(event.u || lastUpdateId);
        }
        setDepthReady(true);
        applyBook();
      } catch {
        if (!dead) setDepthReady(false);
      }
    };

    const applyBinanceDepth = (data: any) => {
      if (!data || !Number.isFinite(Number(data.u))) return;
      if (!snapshotReady) {
        depthBuffer.push(data);
        if (depthBuffer.length > 1200) depthBuffer.splice(0, depthBuffer.length - 1200);
        return;
      }
      if (Number(data.u) <= lastUpdateId) return;
      if (data.pu != null && Number(data.pu) !== lastUpdateId) {
        void syncBinanceSnapshot();
        return;
      }
      if (data.pu == null && Number(data.U || data.u) > lastUpdateId + 1) {
        void syncBinanceSnapshot();
        return;
      }
      applyLevels(data.b || [], bids);
      applyLevels(data.a || [], asks);
      lastUpdateId = Number(data.u);
      applyBook();
    };

    try {
      if (exchange === 'binance') {
        const host = marketType === 'futures' ? BINANCE_FUTURES_WS : BINANCE_SPOT_WS;
        depthSocket = new WebSocket(`${host}/${symbol.toLowerCase()}@depth@100ms`);
        depthSocket.onopen = () => void syncBinanceSnapshot();
        depthSocket.onmessage = event => {
          if (dead) return;
          try { applyBinanceDepth(JSON.parse(event.data)); } catch {}
        };
        depthSocket.onclose = () => { if (!dead) setDepthReady(false); };
        depthSocket.onerror = () => { if (!dead) setDepthReady(false); };
      } else {
        const depth = marketType === 'futures' ? 1000 : 200;
        depthSocket = new WebSocket(BYBIT_WS[marketType]);
        depthSocket.onopen = () => depthSocket?.send(JSON.stringify({ op: 'subscribe', args: [`orderbook.${depth}.${symbol}`] }));
        depthSocket.onmessage = event => {
          if (dead) return;
          try {
            const message = JSON.parse(event.data);
            if (message.topic !== `orderbook.${depth}.${symbol}` || !message.data) return;
            if (message.type === 'snapshot' || Number(message.data.u) === 1) { bids.clear(); asks.clear(); }
            applyLevels(message.data.b || [], bids);
            applyLevels(message.data.a || [], asks);
            setDepthReady(true);
            applyBook();
          } catch {}
        };
        depthSocket.onclose = () => { if (!dead) setDepthReady(false); };
        depthSocket.onerror = () => { if (!dead) setDepthReady(false); };
        depthPing = setInterval(() => {
          if (depthSocket?.readyState === WebSocket.OPEN) try { depthSocket.send(JSON.stringify({ op: 'ping' })); } catch {}
        }, 20_000);
      }
    } catch {
      setDepthReady(false);
    }

    type Trade = { t: number; p: number; q: number; side: 'BUY' | 'SELL'; id: string };

    const commitBurst = () => {
      if (dead || !burst || !tradeCut || burst.usd < tradeCut) return;
      const p = burst.pv / Math.max(1, burst.usd);
      const score = Math.min(100, Math.round(100 * burst.usd / Math.max(tradeCut * 2, 1)));
      const item: MarketPrint = {
        id: burst.id, side: burst.side, t: burst.start, p, usd: burst.usd,
        count: burst.count, touches: 1, lastTouch: burst.start, score,
      };
      setMarketPrints(previous => {
        const next = [...previous];
        const index = next.findIndex(row => row.id === item.id);
        if (index >= 0) next[index] = item;
        else next.push(item);
        return next.filter(row => Date.now() - row.t < 6 * 60 * 60_000).slice(-60);
      });
    };

    const handleTrade = (trade: Trade) => {
      if (dead || !Number.isFinite(trade.p) || !Number.isFinite(trade.q) || trade.p <= 0 || trade.q <= 0) return;
      const usd = trade.p * trade.q;
      tradeWindow.push({ t: trade.t, usd });
      while (tradeWindow.length && trade.t - tradeWindow[0].t > 120_000) tradeWindow.shift();
      if (!tradeCut || trade.t - lastTradeThresholdCalc > 3000) {
        tradeCut = adaptiveCut(tradeWindow.map(row => row.usd), .95, .995, 2.8);
        lastTradeThresholdCalc = trade.t;
      }
      if (!burst || burst.side !== trade.side || trade.t - burst.last > 450 || trade.t - burst.start > 1400) {
        commitBurst();
        burst = { side: trade.side, start: trade.t, last: trade.t, usd, pv: trade.p * usd, count: 1, id: `${trade.side}:${trade.t}:${trade.id}` };
      } else {
        burst.last = trade.t;
        burst.usd += usd;
        burst.pv += trade.p * usd;
        burst.count += 1;
      }
      if (tradeCut && burst.usd >= tradeCut) commitBurst();
    };

    const seedTrades = async () => {
      try {
        let rows: Trade[] = [];
        if (exchange === 'binance') {
          const path = marketType === 'futures'
            ? `/fapi/v1/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=1000`
            : `/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=1000`;
          const data = await fetchBinanceJson(path, marketType);
          rows = (Array.isArray(data) ? data : []).map((row: any) => ({
            t: Number(row.T) || Date.now(),
            p: Number(row.p),
            q: Number(row.q),
            side: row.m ? 'SELL' : 'BUY',
            id: String(row.a ?? row.T),
          }));
        } else {
          const category = marketType === 'futures' ? 'linear' : 'spot';
          const response = await fetch(`${BYBIT_API}/v5/market/recent-trade?category=${category}&symbol=${encodeURIComponent(symbol)}&limit=1000`, { cache: 'no-store' });
          if (!response.ok) return;
          const data = await response.json();
          rows = (data?.result?.list || []).map((row: any) => ({
            t: Number(row.time) || Date.now(),
            p: Number(row.price),
            q: Number(row.size),
            side: String(row.side).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
            id: String(row.execId || row.time),
          })).sort((a: Trade, b: Trade) => a.t - b.t);
        }
        if (dead || !rows.length) return;
        tradeCut = adaptiveCut(rows.map(row => row.p * row.q), .95, .995, 2.8);
        lastTradeThresholdCalc = Date.now();
        for (const row of rows) handleTrade(row);
        commitBurst();
      } catch {}
    };
    void seedTrades();

    try {
      if (exchange === 'binance') {
        const host = marketType === 'futures' ? BINANCE_FUTURES_WS : BINANCE_SPOT_WS;
        tradeSocket = new WebSocket(`${host}/${symbol.toLowerCase()}@aggTrade`);
        tradeSocket.onmessage = event => {
          if (dead) return;
          try {
            const row = JSON.parse(event.data);
            handleTrade({
              t: Number(row.T) || Date.now(), p: Number(row.p), q: Number(row.q),
              side: row.m ? 'SELL' : 'BUY', id: String(row.a ?? row.T),
            });
          } catch {}
        };
      } else {
        tradeSocket = new WebSocket(BYBIT_WS[marketType]);
        tradeSocket.onopen = () => tradeSocket?.send(JSON.stringify({ op: 'subscribe', args: [`publicTrade.${symbol}`] }));
        tradeSocket.onmessage = event => {
          if (dead) return;
          try {
            const message = JSON.parse(event.data);
            if (message.topic !== `publicTrade.${symbol}` || !Array.isArray(message.data)) return;
            for (const row of message.data) {
              handleTrade({
                t: Number(row.T) || Date.now(), p: Number(row.p), q: Number(row.v),
                side: String(row.S).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
                id: String(row.i || row.T),
              });
            }
          } catch {}
        };
        tradePing = setInterval(() => {
          if (tradeSocket?.readyState === WebSocket.OPEN) try { tradeSocket.send(JSON.stringify({ op: 'ping' })); } catch {}
        }, 20_000);
      }
    } catch {}

    return () => {
      dead = true;
      snapshotController?.abort();
      if (depthPing) clearInterval(depthPing);
      if (tradePing) clearInterval(tradePing);
      try { depthSocket?.close(); } catch {}
      try { tradeSocket?.close(); } catch {}
    };
  }, [
    exchange, marketType, symbol, replay,
    settings.densityAnalysis, settings.densityDiffPct, settings.densityAutoMultiplier,
    settings.densityMode, settings.densityThreshold, settings.densityTimeoutMin,
  ]);

  useEffect(() => {
    const exchangeSymbol = /^[\p{L}\p{M}\p{N}]+$/u.test(symbol);
    if (replay || !exchangeSymbol || marketType !== 'futures') {
      setLiquidations([]);
      setLiquidationCut(0);
      setLiquidationStreamLive(false);
      setLiquidationLastEventAt(null);
      return;
    }

    let dead = false;
    let socket: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const raw: Liquidation[] = [];

    const publish = () => {
      if (dead) return;
      const now = Date.now();
      raw.sort((a, b) => a.t - b.t);
      while (raw.length && now - raw[0].t > 30 * 60_000) raw.shift();
      if (raw.length > 1500) raw.splice(0, raw.length - 1500);
      const values = raw
        .filter(row => now - row.t <= 15 * 60_000)
        .map(row => row.usd)
        .filter(value => Number.isFinite(value) && value > 0);
      const adaptive = !values.length ? 0 : values.length < 6
        ? quantile(values, .75)
        : Math.max(quantile(values, .8), adaptiveCut(values, .8, .98, 2.5));
      const cut = values.length ? Math.max(1000, adaptive) : 0;
      setLiquidationCut(cut);
      setLiquidations([...raw]);
    };

    const push = (row: Liquidation) => {
      if (!Number.isFinite(row.p) || !Number.isFinite(row.q) || !Number.isFinite(row.t) || row.p <= 0 || row.q <= 0 || row.usd <= 0) return;
      const index = raw.findIndex(item => item.id === row.id);
      if (index >= 0) raw[index] = row;
      else raw.push(row);
      setLiquidationLastEventAt(current => Math.max(current || 0, row.t));
      publish();
    };

    const scheduleReconnect = () => {
      if (dead || retry) return;
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, 2000);
    };

    const connect = () => {
      if (dead) return;
      if (ping) { clearInterval(ping); ping = null; }
      setLiquidationStreamLive(false);
      try {
        if (exchange === 'binance') {
          socket = new WebSocket(`${BINANCE_FUTURES_WS}/${symbol.toLowerCase()}@forceOrder`);
          socket.onopen = () => { if (!dead) setLiquidationStreamLive(true); };
          socket.onmessage = event => {
            if (dead) return;
            try {
              const message = JSON.parse(event.data);
              const order = message?.o;
              if (!order || String(order.s || symbol).toUpperCase() !== symbol.toUpperCase()) return;
              const p = Number(order.ap || order.L || order.p || 0);
              const z = Number(order.z || 0);
              const last = Number(order.l || 0);
              const original = Number(order.q || 0);
              const q = z > 0 ? z : last > 0 ? last : original;
              const t = Number(order.T || message.E) || Date.now();
              // Binance SELL liquidation closes a long; BUY closes a short.
              const side: Liquidation['side'] = String(order.S).toUpperCase() === 'SELL' ? 'LONG' : 'SHORT';
              push({ id: `bin:${symbol}:${String(order.i ?? order.T ?? message.E ?? t)}`, side, t, p, q, usd: p * q });
            } catch {}
          };
        } else {
          socket = new WebSocket(BYBIT_WS.futures);
          socket.onopen = () => {
            if (dead) return;
            setLiquidationStreamLive(true);
            socket?.send(JSON.stringify({ op: 'subscribe', args: [`allLiquidation.${symbol}`] }));
          };
          socket.onmessage = event => {
            if (dead) return;
            try {
              const message = JSON.parse(event.data);
              if (message.topic !== `allLiquidation.${symbol}` || !Array.isArray(message.data)) return;
              for (const row of message.data) {
                const p = Number(row.p);
                const q = Number(row.v);
                const t = Number(row.T || message.ts) || Date.now();
                // Bybit documents S as the liquidated position side: Buy => long liquidation.
                const side: Liquidation['side'] = String(row.S).toLowerCase() === 'buy' ? 'LONG' : 'SHORT';
                push({ id: `byb:${symbol}:${t}:${row.S}:${row.p}:${row.v}`, side, t, p, q, usd: p * q });
              }
            } catch {}
          };
          ping = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) try { socket.send(JSON.stringify({ op: 'ping' })); } catch {}
          }, 20_000);
        }
        socket.onerror = () => { try { socket?.close(); } catch {} };
        socket.onclose = () => {
          if (dead) return;
          setLiquidationStreamLive(false);
          scheduleReconnect();
        };
      } catch {
        setLiquidationStreamLive(false);
        scheduleReconnect();
      }
    };

    setLiquidations([]);
    setLiquidationCut(0);
    setLiquidationLastEventAt(null);
    connect();
    const publishTimer = setInterval(publish, 2000);

    return () => {
      dead = true;
      clearInterval(publishTimer);
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      try { socket?.close(); } catch {}
    };
  }, [exchange, marketType, symbol, replay]);

  useEffect(() => {
    const exchangeSymbol = /^[\p{L}\p{M}\p{N}]+$/u.test(symbol);
    if (replay || !exchangeSymbol || marketType !== 'futures') {
      setFundingRate(Number.NaN);
      setFundingHistory([]);
      return;
    }
    let dead = false;
    let controller = new AbortController();
    setFundingRate(Number.NaN); setFundingHistory([]);

    const pull = async () => {
      try {
        if (exchange === 'binance') {
          const [premiumResponse, historyResponse] = await Promise.all([
            fetch(`${BINANCE_FUTURES_API}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal, cache: 'no-store' }),
            fetch(`${BINANCE_FUTURES_API}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=100`, { signal: controller.signal, cache: 'no-store' }),
          ]);
          if (!premiumResponse.ok || !historyResponse.ok) { if (!dead) { setFundingRate(Number.NaN); setFundingHistory([]); } return; }
          const premium = await premiumResponse.json();
          const history = await historyResponse.json();
          if (dead) return;
          setFundingRate(premium?.lastFundingRate == null ? Number.NaN : Number(premium.lastFundingRate));
          setFundingHistory((Array.isArray(history) ? history : []).map((row: any) => Number(row.fundingRate)).filter(Number.isFinite));
        } else {
          const [tickerResponse, historyResponse] = await Promise.all([
            fetch(`${BYBIT_API}/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal, cache: 'no-store' }),
            fetch(`${BYBIT_API}/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(symbol)}&limit=100`, { signal: controller.signal, cache: 'no-store' }),
          ]);
          if (!tickerResponse.ok || !historyResponse.ok) { if (!dead) { setFundingRate(Number.NaN); setFundingHistory([]); } return; }
          const ticker = await tickerResponse.json();
          const history = await historyResponse.json();
          if (dead) return;
          const value = ticker?.result?.list?.[0]?.fundingRate;
          setFundingRate(ticker?.retCode === 0 && value != null ? Number(value) : Number.NaN);
          setFundingHistory((history?.result?.list || []).map((row: any) => Number(row.fundingRate)).filter(Number.isFinite));
        }
      } catch { if (!dead) { setFundingRate(Number.NaN); setFundingHistory([]); } }
    };

    void pull();
    const timer = setInterval(() => {
      controller.abort();
      controller = new AbortController();
      void pull();
    }, 60_000);

    return () => {
      dead = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [exchange, marketType, symbol, replay]);

  const visibleLiquidations = useMemo(
    () => liquidationCut > 0
      ? liquidations.filter(row => row.usd >= liquidationCut).slice(-160)
      : [],
    [liquidations, liquidationCut],
  );
  const risk = useMemo(
    () => calcCascadeRisk(liquidations, liquidationCut, candles.at(-1)?.c || 0),
    [liquidations, liquidationCut, candles.at(-1)?.c],
  );
  const liquidationSource = marketType === 'futures'
    ? (exchange === 'binance' ? 'BIN forceOrder' : 'BYB allLiq')
    : '';

  return {
    densities,
    marketPrints: marketPrints.slice(-40),
    liquidations: visibleLiquidations,
    allLiquidations: liquidations,
    liquidationCut,
    liquidationStreamLive,
    liquidationLastEventAt,
    liquidationSource,
    cascadeRisk: risk,
    densityCut,
    book,
    fundingRate,
    fundingHistory,
    depthReady,
  };
}
