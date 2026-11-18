import { timingSafeEqual } from 'node:crypto';
import type { Express, Request } from 'express';
import { exchangeHttp } from './exchangeHttp';
import { publicPriceFeed } from './publicPriceFeed';
import { binanceTickerStream } from './binanceTickerStream';
import { exchangeHistoryCache } from './exchangeHistoryCache';
import { getLiveOiCacheStats } from './marketService';
import { marketTickerFeed } from './marketTickerFeed';
import { liquidationFeed } from './liquidationFeed';
import { liquidationArchive } from './liquidationArchive';
import { getSharedExchangeStreamStats } from './surveillance/sharedExchangeStream';
import { RuntimeMetrics } from './runtimeMetrics';
import { publicQuoteResponseCache } from './marketQuoteResponse';
import { cronManager } from './cronService';
import { surveillanceManager } from './surveillance/surveillanceManager';
import { surveillanceStreamStats } from './surveillanceEvents';
import { getSharedScreenerJobStats } from './marketService';
import { telegramDispatchQueue } from './telegramQueue';
import { telegramDeliveryStats } from './telegramDelivery';
import { sharedMarketAnalysis } from './surveillance/sharedMarketAnalysis';
import { sharedPublicDepthMedian } from './surveillance/sharedDepthMedian';
import { sharedWorkerAnalysisClock } from './surveillance/sharedWorkerAnalysisClock';
import { sharedCandleFeedStats } from './surveillance/sharedCandleFeed';
import { sharedOiPoller } from './surveillance/sharedOiPoller';
import { surveillanceCheckCandleCache } from './surveillance/checkCandleCache';
import { priceAlertFallbackStats, priceAlertCheckStats } from './alertService';
import { candleCloseCheckPlanner } from './surveillance/candleCloseCheckPlanner';
import { sharedSurveillanceState } from './surveillance/sharedSurveillanceState';
import { persistenceMetrics } from './persistenceMetrics';

function authorized(req: Request): boolean {
  const secret = process.env.H00K_OPS_TOKEN;
  if (!secret || Buffer.byteLength(secret) < 32) return false;
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return token.length === expected.length && timingSafeEqual(token, expected);
}

/**
 * Optional private read-only diagnostics for controlled VPS load testing.
 * No route exists without a strong operator token. This endpoint never returns
 * user IDs, API keys, chat IDs, or application data.
 */
export function installOpsMetrics(app: Express,
  chartDepth: () => { activeMarkets: number; clients: number;
    sentPackets?: number; sentBytes?: number; slowConsumers?: number;
  } | null = () => null,
  chartKlines: () => {
    activeMarkets: number; clients: number; upstreamSockets: number;
    accepted: number; rejected: number; reconnects: number; failures: number;
    sent: number; sentBytes?: number; upstreamCandles?: number; slowConsumers: number;
  } | null = () => null) {
  // The event-loop histogram starts only after the first authorized operator
  // request, so it adds zero measurement overhead on unconfigured deployments.
  let runtime: RuntimeMetrics | null = null;
  app.get('/api/ops/market-data', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!authorized(req)) { res.status(404).end(); return; }
    runtime ??= new RuntimeMetrics();
    const processSample = runtime.sample();
    const shared = getSharedExchangeStreamStats();
    const memory = process.memoryUsage();
    res.json({
      recordedAt: Date.now(),
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal, externalBytes: memory.external },
      exchangeHttp: exchangeHttp.stats(),
      processPerformance: processSample,
      cronJobs: cronManager.getOperatorJobStats(),
      activeSurveillanceWorkers: surveillanceManager.getActiveWorkerCount(),
      surveillanceStream: surveillanceStreamStats(),
      sharedScreener: getSharedScreenerJobStats(),
      sharedMarketAnalysis: sharedMarketAnalysis.stats(),
      sharedPublicDepthMedian: sharedPublicDepthMedian.stats(),
      sharedWorkerAnalysisClock: sharedWorkerAnalysisClock.stats(),
      sharedCandles: sharedCandleFeedStats(),
      sharedOiPolling: sharedOiPoller.stats(),
      surveillanceCheckCandles: surveillanceCheckCandleCache.stats(),
      candleCloseCheckPlanner: candleCloseCheckPlanner.stats(),
      sharedSurveillanceState: sharedSurveillanceState.stats(),
      persistence: persistenceMetrics.stats(),
      telegramQueue: telegramDispatchQueue.stats(),
      telegramDurableDelivery: (() => { try { return telegramDeliveryStats(); }
        catch { return { healthy: false }; } })(),
      historicalOiCache: exchangeHistoryCache.stats(),
      liveOiCache: getLiveOiCacheStats(),
      marketTickerFeed: marketTickerFeed.diagnostics(),
      liquidationFeed: liquidationFeed.stats(),
      liquidationArchive: liquidationArchive.stats(),
      publicQuoteDelivery: publicQuoteResponseCache.stats(),
      publicPriceWebSockets: publicPriceFeed.status(),
      priceAlertFallback: priceAlertFallbackStats(),
      priceAlertChecks: priceAlertCheckStats(),
      binanceMarketTickers: binanceTickerStream.status(),
      sharedExchange: { marketStreams: shared.length,
        totalSubscribers: shared.reduce((sum, x) => sum + x.subscribers, 0),
        byInstrument: shared },
      hookChartDepth: chartDepth(),
      hookChartKlineRelay: chartKlines(),
    });
  });
}
