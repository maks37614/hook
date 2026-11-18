import type { Kline, TerminalChartBlock } from '../../types';
import type { LiveKline } from '../../components/hookchart/sharedKlineStream';
import { validBar } from './geometry';
import { analysisMarketKey, terminalAnalysisAllowed, type AnalysisTf, type ChartEvidence,
  type ContextNotice, type MarketAddress, type WorkerRequest, type WorkerResponse } from './model';

export type AnalysisWorker = {
  postMessage: (message: WorkerRequest) => void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate: () => void;
};
type Timer = ReturnType<typeof setTimeout>;
export type SessionRuntime = {
  now: () => number;
  createWorker: () => AnalysisWorker;
  history: (market: MarketAddress, tf: AnalysisTf, limit: number) => Promise<Kline[]>;
  subscribe: (market: MarketAddress, tf: AnalysisTf, onCandle: (row: LiveKline) => void) => () => void;
  evidence: (blocks: TerminalChartBlock[], at: number) => ChartEvidence;
  later: (callback: () => void, ms: number) => Timer;
  cancel: (timer: Timer) => void;
};
type Feed = {
  tf: AnalysisTf;
  connection?: { stop?: () => void };
  loaded: boolean;
  loading: boolean;
  needsRepair?: boolean;
  lastTime: number;
  lastLoad?: number;
  buffered: LiveKline[];
  deferredHistory?: { rows: Kline[]; requestedAt: number };
  suspendedBucket?: number;
  latest?: LiveKline;
  final?: LiveKline;
};
type Market = {
  scope: string;
  address: MarketAddress;
  blocks: TerminalChartBlock[];
  feeds: Map<AnalysisTf, Feed>;
  pending: Partial<Record<AnalysisTf, LiveKline>>;
  inFlight?: { id: number; at: number; discard: boolean };
  lastPosted: number;
  lastFastNeeded: number;
  shown: Set<string>;
};
export type AnalysisSession = {
  stop(): void;
  setVisible(value: boolean): void;
  setBlocks(blocks: readonly TerminalChartBlock[], configuredLimit: number): void;
};

const secondsFor = (tf: AnalysisTf) => tf === '5m' ? 300 : 60;
const needsMinuteChart = (market: Market) => market.blocks.some(b => b.timeframe === '1m' || b.timeframe === '30s');
const isFresh = (time: number | undefined, now: number) =>
  time !== undefined && Number.isFinite(time) && time <= now + 3_000 && now - time <= 15_000;

/** One coordinator per active Terminal/account. Reconcile only the markets and feeds that changed. */
export function startTerminalAnalysis(options: {
  blocks: readonly TerminalChartBlock[]; configuredLimit: number;
  onNotice: (notice: ContextNotice, market: MarketAddress) => boolean | void;
  onError: () => void; visible?: boolean;
}, runtime: SessionRuntime): AnalysisSession {
  let stopped = false;
  let visible = options.visible !== false;
  let historyBusy = 0;
  let nextRequestId = 0;
  let timer: Timer | undefined;
  let worker: AnalysisWorker | undefined;
  const markets = new Map<string, Market>();
  const queue = new Map<Feed, Market>();

  function stop() {
    if (stopped) return;
    stopped = true;
    // Cleanup happens in a React effect when the user disables analysis.
    // A native WebSocket/Worker teardown error must not replace the Terminal
    // with the page-level error boundary or leave other feeds subscribed.
    if (timer !== undefined) {
      try { runtime.cancel(timer); } catch { /* Already cancelled by the browser. */ }
      timer = undefined;
    }
    queue.clear();
    for (const market of markets.values()) for (const feed of market.feeds.values()) disconnect(feed);
    markets.clear();
    if (worker) {
      const disposedWorker = worker;
      worker = undefined;
      disposedWorker.onmessage = null;
      disposedWorker.onerror = null;
      try { disposedWorker.terminate(); } catch { /* A dead Worker is already inactive. */ }
    }
  }
  function fail() {
    if (stopped) return;
    stop();
    options.onError();
  }
  function send(message: WorkerRequest) {
    try { worker?.postMessage(message); } catch { fail(); }
  }
  function schedule() {
    if (stopped || !visible || timer !== undefined) return;
    timer = runtime.later(flush, 1_000);
  }
  function flush() {
    timer = undefined;
    if (stopped || !visible) return;
    const at = runtime.now();
    for (const market of markets.values()) {
      if (market.inFlight || !Object.keys(market.pending).length) continue;
      if (at - market.lastPosted < 1_000) { schedule(); continue; }
      const candles = market.pending;
      market.pending = {};
      for (const tf of ['5m', '1m'] as const) {
        if (candles[tf] && !isFresh(candles[tf].eventTime, at)) delete candles[tf];
      }
      if (!Object.keys(candles).length) continue;
      const closedCandles: Partial<Record<AnalysisTf, Kline>> = {};
      for (const [tf, feed] of market.feeds) {
        if (!feed.final) continue;
        const seconds = secondsFor(tf);
        const bucket = Math.floor(at / 1000 / seconds) * seconds;
        if (feed.final.time >= bucket) continue;
        if (feed.final.time === bucket - seconds) closedCandles[tf] = feed.final;
        feed.final = undefined;
      }
      market.inFlight = { id: ++nextRequestId, at, discard: false };
      market.lastPosted = at;
      send({ type: 'update', scope: market.scope, requestId: market.inFlight.id,
        candles, closedCandles, evidence: runtime.evidence(market.blocks, at), at });
    }
  }
  function seed(market: Market, feed: Feed, rows: Kline[], requestedAt: number) {
    const at = runtime.now();
    const seconds = secondsFor(feed.tf);
    const bucket = Math.floor(at / 1000 / seconds) * seconds;
    const returned = new Set(rows.filter(validBar).map(row => row.time));
    if (feed.needsRepair && requestedAt < bucket * 1000 && !returned.has(bucket) && feed.final?.time !== bucket - seconds) {
      // The last row of a page fetched before the boundary could still be open.
      return;
    }
    const merged = rows.concat(feed.buffered.filter(row => row.time === bucket || row.closed || !returned.has(row.time)));
    if (feed.final?.time === bucket - seconds) merged.push(feed.final);
    feed.buffered = [];
    // Count consecutive closed bars, including any live bars buffered during the request.
    // A long but stale or gapped page must remain eligible for recovery.
    const times = new Set(merged.filter(row => validBar(row) && row.time <= bucket && row.time % seconds === 0)
      .map(row => row.time));
    const minimum = feed.tf === '5m' ? 36 : 16;
    let count = 0;
    while (count < minimum && times.has(bucket - (count + 1) * seconds)) count++;
    feed.loaded = count === minimum;
    if (feed.loaded) feed.needsRepair = false;
    if (feed.needsRepair) return;
    for (const time of times) feed.lastTime = Math.max(feed.lastTime, time);
    send({ type: 'seed', scope: market.scope, tf: feed.tf, rows: merged, at });
    if (feed.latest && isFresh(feed.latest.eventTime, at)) {
      market.pending[feed.tf] = feed.latest;
      if (!market.inFlight) schedule();
    }
  }
  async function fetchHistory(market: Market, feed: Feed) {
    const requestedAt = runtime.now();
    feed.lastLoad = requestedAt;
    historyBusy++;
    try {
      const rows = await runtime.history(market.address, feed.tf, feed.tf === '5m' ? 289 : 180);
      if (stopped || markets.get(market.scope) !== market || market.feeds.get(feed.tf) !== feed) return;
      if (visible) seed(market, feed, rows, requestedAt);
      else feed.deferredHistory = { rows, requestedAt };
    } catch {
      // Retry on the next eligible market event, including a failed gap repair.
      feed.loaded = false;
    } finally {
      feed.loading = false;
      historyBusy--;
      drain();
    }
  }
  function drain() {
    while (!stopped && visible && historyBusy < 2 && queue.size) {
      const [feed, market] = queue.entries().next().value!;
      queue.delete(feed);
      void fetchHistory(market, feed);
    }
  }
  function load(market: Market, feed: Feed) {
    if (feed.loading || stopped || !visible) return;
    if (feed.lastLoad !== undefined && runtime.now() - feed.lastLoad < 60_000) return;
    feed.loading = true;
    queue.set(feed, market);
    drain();
  }
  function disconnect(feed: Feed) {
    const connection = feed.connection;
    feed.connection = undefined;
    try { connection?.stop?.(); } catch {
      // Releasing one transport must not interrupt the remaining feeds or
      // crash the Terminal during analysis OFF, account switch or unmount.
    }
  }
  function connect(market: Market, feed: Feed) {
    if (!visible || stopped || feed.connection) return;
    const seconds = secondsFor(feed.tf);
    const bucket = Math.floor(runtime.now() / 1000 / seconds) * seconds;
    if ((feed.lastTime > 0 && feed.lastTime < bucket - seconds) ||
        (feed.suspendedBucket !== undefined && feed.suspendedBucket < bucket)) {
      feed.loaded = false;
      feed.needsRepair = true;
    }
    feed.suspendedBucket = undefined;
    if (feed.deferredHistory) {
      const { rows, requestedAt } = feed.deferredHistory;
      feed.deferredHistory = undefined;
      seed(market, feed, rows, requestedAt);
      if (stopped) return;
    }
    // Shared transports may synchronously replay their cached candle on subscribe.
    const connection: NonNullable<Feed['connection']> = {};
    feed.connection = connection;
    try {
      connection.stop = runtime.subscribe(market.address, feed.tf, row => {
        if (stopped || !visible || feed.connection !== connection) return;
        const at = runtime.now();
        if (!isFresh(row.eventTime, at)) return;
        const currentBucket = Math.floor(at / 1000 / seconds) * seconds;
        if (row.closed && (row.time === currentBucket || row.time === currentBucket - seconds)) feed.final = row;
        if (row.time !== currentBucket || row.time < feed.lastTime) return;
        if (feed.lastTime > 0 && row.time - feed.lastTime > seconds) {
          feed.loaded = false;
          feed.needsRepair = true;
          delete market.pending[feed.tf];
        }
        feed.lastTime = row.time;
        feed.latest = row;
        if (!feed.loaded) load(market, feed);
        if (feed.loading || feed.needsRepair) {
          if (feed.buffered.at(-1)?.time === row.time) feed.buffered[feed.buffered.length - 1] = row;
          else {
            feed.buffered.push(row);
            if (feed.buffered.length > 4) feed.buffered.shift();
          }
        } else {
          market.pending[feed.tf] = row;
          if (!market.inFlight) schedule();
        }
      });
    } catch { fail(); return; }
    if (!feed.loaded) load(market, feed);
  }
  function ensureFeed(market: Market, tf: AnalysisTf) {
    let feed = market.feeds.get(tf);
    if (!feed) {
      feed = { tf, loaded: false, loading: false, lastTime: 0, buffered: [] };
      market.feeds.set(tf, feed);
    }
    connect(market, feed);
  }
  function releaseFeed(market: Market, feed: Feed) {
    queue.delete(feed);
    disconnect(feed);
    market.feeds.delete(feed.tf);
    delete market.pending[feed.tf];
  }
  function syncMinuteFeed(market: Market) {
    const feed = market.feeds.get('1m');
    if (needsMinuteChart(market) || runtime.now() - market.lastFastNeeded <= 10 * 60_000) {
      ensureFeed(market, '1m');
    } else if (feed) releaseFeed(market, feed);
  }
  function onResponse({ data }: { data: WorkerResponse }) {
    const market = markets.get(data.scope);
    const request = market?.inFlight;
    if (!market || !request || request.id !== data.requestId) return;
    market.inFlight = undefined;
    if (!visible) return;
    const at = runtime.now();
    if (!request.discard && isFresh(request.at, at)) {
      for (const notice of data.notices) {
        if (notice.observedAt > at || !isFresh(notice.observedAt, at)) continue;
        const needsWatch = notice.stage === 'confirmed' && (notice.scenario === 'temka1' || notice.scenario === 'temka2');
        if ((needsWatch || notice.stage === 'cancelled') && !market.shown.has(notice.key)) continue;
        if (options.onNotice(notice, market.address) === false) continue;
        if (notice.stage === 'cancelled') market.shown.delete(notice.key);
        else if (notice.stage === 'watch' || notice.stage === 'confirmed') {
          market.shown.add(notice.key);
          if (market.shown.size > 96) market.shown.delete(market.shown.values().next().value!);
        }
      }
      if (data.needFast) market.lastFastNeeded = at;
      syncMinuteFeed(market);
    }
    if (Object.keys(market.pending).length) schedule();
  }
  function startWorker() {
    if (worker || !visible || stopped) return;
    try {
      worker = runtime.createWorker();
      worker.onmessage = onResponse;
      worker.onerror = fail;
    } catch { fail(); }
  }
  function setBlocks(blocks: readonly TerminalChartBlock[], configuredLimit: number) {
    if (stopped) return;
    if (!terminalAnalysisAllowed(configuredLimit, blocks.length) || blocks.length === 0) { stop(); return; }
    const groups = new Map<string, TerminalChartBlock[]>();
    for (const block of blocks) {
      const scope = analysisMarketKey(block);
      const group = groups.get(scope);
      if (group) group.push(block);
      else groups.set(scope, [block]);
    }
    for (const [scope, market] of markets) {
      if (groups.has(scope)) continue;
      markets.delete(scope);
      for (const feed of market.feeds.values()) releaseFeed(market, feed);
      send({ type: 'remove', scope });
    }
    startWorker();
    for (const [scope, group] of groups) {
      if (stopped) break;
      let market = markets.get(scope);
      if (!market) {
        const { symbol, exchange, marketType } = group[0];
        market = { scope, address: { symbol: symbol.trim().toUpperCase(), exchange, marketType }, blocks: group,
          feeds: new Map(), pending: {}, shown: new Set(), lastPosted: -Infinity, lastFastNeeded: -Infinity };
        markets.set(scope, market);
      } else {
        if (market.inFlight && (market.blocks.length !== group.length || group.some(b =>
          !market.blocks.some(old => old.id === b.id && old.timeframe === b.timeframe)))) market.inFlight.discard = true;
        market.blocks = group;
      }
      ensureFeed(market, '5m');
      syncMinuteFeed(market);
    }
  }
  function setVisible(value: boolean) {
    if (visible === value || stopped) return;
    visible = value;
    if (!visible) {
      if (timer !== undefined) runtime.cancel(timer);
      timer = undefined;
      for (const feed of queue.keys()) feed.loading = false;
      queue.clear();
      for (const market of markets.values()) {
        market.pending = {};
        if (market.inFlight) market.inFlight.discard = true;
        for (const feed of market.feeds.values()) {
          disconnect(feed);
          feed.latest = undefined;
          feed.buffered = [];
          feed.suspendedBucket = Math.floor(runtime.now() / 1000 / secondsFor(feed.tf)) * secondsFor(feed.tf);
        }
      }
    } else {
      startWorker();
      for (const market of markets.values()) {
        ensureFeed(market, '5m');
        syncMinuteFeed(market);
      }
      drain();
    }
  }
  setBlocks(options.blocks, options.configuredLimit);
  return { stop, setVisible, setBlocks };
}
