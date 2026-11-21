import type { BinanceTradePacket } from './binanceSharedTradeTransport';
import { recoverBinanceTradeGap, type BinanceRawTrade } from './binanceTradeGapRecovery';

/**
 * One strictly ordered trade-ID stream to the existing market analytics.
 * Peers, fallback sockets and REST pages can overlap; duplicates are dropped.
 * Missing IDs are recovered before any subsequent trade affects delta.
 * If recovery is not provably complete, suspend output and mark INCOMPLETE.
 */
export function createVerifiedBinanceTrades(options: {
  accept: (trade: BinanceTradePacket) => void;
  load: (fromId: number, limit: number, signal: AbortSignal) => Promise<readonly BinanceRawTrade[]>;
  onIntegrity?: (status: 'verified' | 'recovering' | 'incomplete') => void;
  maxBuffered?: number;
  maxPages?: number;
  restartAfterMs?: number;
  warmupMs?: number;
  now?: () => number;
}) {
  let previous: number | null = null;
  let status: 'verified' | 'recovering' | 'incomplete' = 'verified';
  let queue: BinanceTradePacket[] = [];
  let closed = false;
  let running = false;
  let recoveryWindow = 0;
  let recoveryCount = 0;
  const clock = options.now ?? Date.now;
  let failedAt = 0;
  let warmupStart: number | null = null;
  let restartFloor = -1;
  const abort = new AbortController();
  const maxBuffered = Math.max(100, Math.min(10_000, options.maxBuffered ?? 3_000));
  const emit = (next: typeof status) => {
    if (status === next) return;
    status = next;
    options.onIntegrity?.(next);
    if (warmupStart !== null && trade.t >= warmupStart + (options.warmupMs ?? 300_000)) warmupStart = null;
  };
  // Async recovery may finish after a buffer overflow marked the feed incomplete.
  const isIncomplete = () => status === 'incomplete';
  const fail = () => {
    for (const row of queue) restartFloor = Math.max(restartFloor, Number(row.id));
    restartFloor = Math.max(restartFloor, previous ?? -1);
    queue = [];
    failedAt = clock();
    warmupStart = null;
    emit('incomplete');
  };
  const consume = (trade: BinanceTradePacket) => {
    const id = Number(trade.id);
    if (previous !== null && id <= previous) return;
    previous = id;
    options.accept(trade);
  };
  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (queue.length && !closed && status !== 'incomplete') {
        queue.sort((a, b) => Number(a.id) - Number(b.id));
        const next = queue.shift()!;
        const id = Number(next.id);
        if (previous !== null && id <= previous) continue;
        if (previous !== null && id > previous + 1) {
          const now = clock();
          if (!recoveryWindow || now - recoveryWindow >= 60_000) {
            recoveryWindow = now; recoveryCount = 0;
          }
          // Binance Futures aggTrades can cost 20 IP-weight per page.
          // Allow two gap recoveries per minute; otherwise fail closed.
          if (++recoveryCount > 2) { restartFloor = Math.max(restartFloor,id); fail(); break; }
          const result = await recoverBinanceTradeGap({
            previousId: previous, currentId: id,
            load: (fromId, limit, signal) => options.load(fromId, limit, signal ?? abort.signal),
            signal: abort.signal, maxPages: options.maxPages,
          });
          if (closed || isIncomplete()) break;
          if (result.status !== 'complete') { restartFloor = Math.max(restartFloor,id); fail(); break; }
          for (const missing of result.rows) consume(missing);
        }
        if (!closed) consume(next);
      }
    } catch {
      if (!closed) fail();
    } finally {
      running = false;
      if (!closed && status !== 'incomplete' && warmupStart === null) emit('verified');
    }
  };
  const push = (trade: BinanceTradePacket) => {
    if (closed) return;
    const id = Number(trade.id);
    if (!Number.isSafeInteger(id) || id < 0 || !Number.isFinite(trade.p) || trade.p <= 0 ||
      !Number.isFinite(trade.q) || trade.q <= 0 || !Number.isFinite(trade.t) || trade.t <= 0 ||
      (trade.side !== 'BUY' && trade.side !== 'SELL')) return;
    if (status === 'incomplete') {
      if (options.restartAfterMs === undefined || running || clock() - failedAt < options.restartAfterMs || id <= restartFloor || Math.abs(clock() - trade.t) > 5000) return;
      // Start a new provable interval; the old hole is never filled with made-up trades.
      previous = null;
      warmupStart = trade.t;
      emit('recovering');
    }
    if (!running && queue.length === 0 && (previous === null || id <= previous + 1)) {
      consume(trade);
      if (status === 'recovering' && warmupStart === null) emit('verified');
      return;
    }
    queue.push(trade);
    if (queue.length > maxBuffered) { fail(); return; }
    emit('recovering');
    void drain();
  };
  const prime = (id: number) => {
    if (!Number.isSafeInteger(id) || id < 0 || closed || running) return;
    previous = previous === null ? id : Math.max(previous, id);
  };
  const close = () => { closed = true; abort.abort(); queue = []; };
  return { push, prime, close, invalidate: fail, getIntegrity: () => status, getLastId: () => previous };
}
