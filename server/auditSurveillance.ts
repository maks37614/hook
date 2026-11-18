import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { ExchangeId, MarketType } from '../src/types';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { fetchKlines } from './marketService';
import { ExchangeStreamClient, type RawDepthDelta } from './surveillance/exchangeStream';
import { OrderBookEngine } from './surveillance/orderBookEngine';
import { SurveillanceReplayEngine } from './surveillance/replayEngine';

interface AuditOptions {
  symbol: string;
  exchange: ExchangeId;
  market: MarketType;
  threshold: number;
  timeoutMs: number;
}

function observeOrderBook(options: AuditOptions) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const book = new OrderBookEngine(options.symbol, options.exchange, options.market, {
      mode: 'MANUAL', manualThresholdUsd: options.threshold, minPersistenceSeconds: 15, minDistancePct: 0.1,
    });
    let stream: ExchangeStreamClient | null = null;
    let lastError = '';
    let snapshots = 0;
    let deltas = 0;
    const timer = setTimeout(() => {
      stream?.destroy();
      reject(new Error(`DOM: не отримано свіжого знімка й оновлення за ${options.timeoutMs / 1000} с. Статус: ${book.status}. ${lastError}`));
    }, options.timeoutMs);
    try {
      stream = new ExchangeStreamClient(options.symbol, options.exchange, options.market);
      stream.on('error', (error: Error) => { lastError = error.message; });
      stream.on('status', status => book.setStatus(status));
      stream.on('depth', (delta: RawDepthDelta) => {
        book.applyDepth(delta);
        if (book.sequenceGap) { stream?.resyncOrderBook(); return; }
        const state = book.getState();
        if (!state.dataValid || state.status !== 'LIVE') return;
        if (delta.isSnapshot) snapshots++; else deltas++;
        if (!snapshots || !deltas) return;
        const densities = book.getDensities();
        const amountsMatch = densities.every(d => d.notionalUsd === d.price * d.quantity && d.notionalUsd >= options.threshold);
        clearTimeout(timer);
        stream?.destroy();
        if (!amountsMatch) { reject(new Error('DOM: суми щільностей не відповідають рівням стакана')); return; }
        resolve({ status: 'LIVE', snapshots, deltas, sequence: state.sequence, sourceTimestamp: state.timestamp,
          bidLevels: state.bidDepth, askLevels: state.askDepth, manualThreshold: options.threshold,
          matchingLevels: densities.length, amountsMatch });
      });
    } catch (error) {
      clearTimeout(timer);
      stream?.destroy();
      reject(error);
    }
  });
}

async function inspectHistory(options: AuditOptions) {
  const asOf = Date.now();
  const candles = await fetchKlines(options.exchange, options.market, options.symbol, '15m', 200,
    undefined, undefined, { requireFresh: true });
  const result = new SurveillanceReplayEngine().runCausalBacktest(options.symbol, candles, '15m', asOf);
  if (result.closedCandles < 50) throw new Error('Бектест: біржа не повернула достатньо коректних закритих свічок');
  return { model: result.model, closedCandles: result.closedCandles, historyFrom: result.historyFrom,
    historyTo: result.historyTo, totalSetups: result.totalSetups, usesHistoricalOrderBook: result.usesHistoricalOrderBook };
}

export async function auditSurveillanceSources(options: AuditOptions) {
  if (!['binance', 'bybit'].includes(options.exchange) || !['spot', 'futures'].includes(options.market) ||
      !options.symbol || !Number.isFinite(options.threshold) || options.threshold <= 0 ||
      !Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 120000) {
    throw new Error('Невірні параметри діагностики');
  }
  const [book, history] = await Promise.allSettled([observeOrderBook(options), inspectHistory(options)]);
  return {
    success: book.status === 'fulfilled' && history.status === 'fulfilled',
    checkedAt: new Date().toISOString(), symbol: options.symbol, exchange: options.exchange, market: options.market,
    orderBook: book.status === 'fulfilled' ? book.value : null,
    backtest: history.status === 'fulfilled' ? history.value : null,
    errors: [book, history].flatMap(result => result.status === 'rejected' ? [String(result.reason?.message || result.reason)] : []),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: {
      symbol: { type: 'string', default: 'BTCUSDT' }, exchange: { type: 'string', default: 'binance' },
      market: { type: 'string', default: 'futures' }, threshold: { type: 'string', default: '1000000' },
      timeout: { type: 'string', default: '30' },
    } });
    const report = await auditSurveillanceSources({ symbol: normalizeExchangeSymbol(values.symbol!),
      exchange: values.exchange as ExchangeId, market: values.market as MarketType,
      threshold: Number(values.threshold), timeoutMs: Number(values.timeout) * 1000 });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.success ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
